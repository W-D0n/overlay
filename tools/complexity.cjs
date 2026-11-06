// tools/complexity.cjs — Measures the cyclomatic complexity and the length of every function of the production sources (tests and e2e excluded).
// Dev tooling only, never imported by the overlay and not run in OBS. It needs the TypeScript parser, installed outside the repo:
//   mkdir -p "$TEMP/tsx" && cd "$TEMP/tsx" && bun add typescript@5.6.3
//   NODE_PATH="$TEMP/tsx/node_modules" node tools/complexity.cjs        (from the repo root, in Git Bash)
const ts = require('typescript');
const fs = require('fs');
const { execSync } = require('child_process');
const files = execSync('git ls-files "*.js"', { cwd: process.cwd(), encoding: 'utf8' }).split('\n').filter((f) => f && !f.endsWith('.test.js') && !f.includes('e2e'));
const rows = [];
for (const file of files) {
  const text = fs.readFileSync(`${process.cwd()}/${file}`, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
  const visit = (node, outerName) => {
    const isFn = ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node);
    if (isFn && node.body) {
      let complexity = 1;
      const count = (n) => {
        if (n !== node && (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n))) return;
        if (ts.isIfStatement(n) || ts.isForStatement(n) || ts.isForInStatement(n) || ts.isForOfStatement(n) || ts.isWhileStatement(n) || ts.isDoStatement(n) || ts.isCaseClause(n) || ts.isCatchClause(n) || ts.isConditionalExpression(n)) complexity += 1;
        if (ts.isBinaryExpression(n) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(n.operatorToken.kind)) complexity += 1;
        ts.forEachChild(n, count);
      };
      ts.forEachChild(node, count);
      const start = source.getLineAndCharacterOfPosition(node.getStart()).line;
      const end = source.getLineAndCharacterOfPosition(node.getEnd()).line;
      let name = node.name ? node.name.getText() : (node.parent && ts.isVariableDeclaration(node.parent) ? node.parent.name.getText() : '(anonymous)');
      rows.push({ file, name, lines: end - start + 1, complexity, line: start + 1 });
    }
    ts.forEachChild(node, (child) => visit(child));
  };
  visit(source);
}
rows.sort((a, b) => b.complexity - a.complexity);
console.log('functions:', rows.length);
console.log('complexity > 15:', rows.filter((r) => r.complexity > 15).length, ' > 25:', rows.filter((r) => r.complexity > 25).length);
console.log('lines > 100:', rows.filter((r) => r.lines > 100).length, ' > 200:', rows.filter((r) => r.lines > 200).length);
console.log('--- top 25 by complexity');
for (const r of rows.slice(0, 25)) console.log(`${String(r.complexity).padStart(3)} cx  ${String(r.lines).padStart(4)} l  ${r.file}:${r.line} ${r.name}`);
console.log('--- top 15 by length');
for (const r of [...rows].sort((a, b) => b.lines - a.lines).slice(0, 15)) console.log(`${String(r.lines).padStart(4)} l  ${String(r.complexity).padStart(3)} cx  ${r.file}:${r.line} ${r.name}`);
