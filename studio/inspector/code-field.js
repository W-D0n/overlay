// @ts-check
/**
 * studio/inspector/code-field.js — A code text of a layer (HTML, CSS, JavaScript, shader, declared settings) as a form field: a fixed-width text area with line numbers, the editing keys
 * (`code-editing.js`), the insertion of a file of the media library, and a report underneath — the declaration of the settings tells its defaults live, the JavaScript shows the
 * errors the page reported.
 */
import { parseParamSpec } from '../../src/components/code-params.js';
import { codeKeyEdit, lineCount } from './code-editing.js';

/** @typedef {Pick<NonNullable<import('../../src/types.js').ComponentInstance['reports']>, 'current' | 'subscribe'>} CodeReports */

/** @param {string} text @param {{ start: number, end: number }} selection @param {string} insertion */
export function insertAt(text, selection, insertion) {
  return { text: `${text.slice(0, selection.start)}${insertion}${text.slice(selection.end)}`, caret: selection.start + insertion.length };
}

/** The number of text-area rows a language gets. @param {string | undefined} language */
export function codeRows(language) {
  return language === 'javascript' || language === 'glsl' ? 14 : language === 'css' ? 10 : 8;
}

/**
 * @param {{
 *   documentRef: Document,
 *   field: import('../../src/layers/layer-kinds.js').FieldSchema,
 *   value: unknown,
 *   emit: (key: string, value: unknown) => void,
 *   assetLibrary?: { open: (choose: (asset: { id: string }) => void, accept?: 'image' | 'font') => void },
 *   reports?: CodeReports | null,
 *   onParamSpec?: (text: string) => void,
 * }} input `onParamSpec`: told the text of the declaration of settings at each keystroke (the form of the settings is rebuilt from it)
 * @returns {{ el: HTMLElement, dispose: () => void }}
 */
export function createCodeField({ documentRef, field, value, emit, assetLibrary, reports = null, onParamSpec }) {
  const wrapper = documentRef.createElement('div');
  wrapper.className = 'code-field';
  const textarea = documentRef.createElement('textarea');
  textarea.className = 'code-input';
  textarea.setAttribute('aria-label', field.label);
  textarea.setAttribute('spellcheck', 'false');
  textarea.setAttribute('autocapitalize', 'off');
  textarea.setAttribute('autocomplete', 'off');
  textarea.setAttribute('wrap', 'off');
  textarea.rows = codeRows(field.language);
  textarea.value = typeof value === 'string' ? value : '';
  const editor = documentRef.createElement('div');
  editor.className = 'code-editor';
  const gutter = documentRef.createElement('div');
  gutter.className = 'code-gutter';
  gutter.setAttribute('aria-hidden', 'true');
  const numberLines = () => {
    const count = lineCount(textarea.value);
    if (gutter.dataset.lines === String(count)) return;
    gutter.dataset.lines = String(count);
    gutter.textContent = Array.from({ length: count }, (_, index) => index + 1).join('\n');
  };
  textarea.addEventListener('scroll', () => { gutter.scrollTop = textarea.scrollTop; });
  let leaving = false;
  textarea.addEventListener('blur', () => { leaving = false; });
  textarea.addEventListener('keydown', (event) => {
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? start;
    const action = codeKeyEdit(event, textarea.value, start, end, leaving);
    leaving = action.leaving;
    const { edit } = action;
    if (edit === null) return;
    event.preventDefault();
    // execCommand keeps the browser's own undo (Ctrl+Z) for the edit; setRangeText is the fallback.
    textarea.setSelectionRange(edit.from, edit.to);
    if (!documentRef.execCommand?.('insertText', false, edit.insert)) {
      textarea.setRangeText(edit.insert, edit.from, edit.to, 'end');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    textarea.setSelectionRange(edit.start, edit.end);
  });
  const status = documentRef.createElement('p');
  status.className = 'field-status';
  status.setAttribute('role', 'status');

  /** @param {string} text */
  function showParamProblems(text) {
    const { errors } = parseParamSpec(text);
    status.textContent = errors.join('\n');
    status.dataset.level = errors.length > 0 ? 'error' : 'ok';
  }
  textarea.oninput = () => {
    numberLines();
    emit(field.key, textarea.value);
    if (field.key === 'paramSpec') {
      showParamProblems(textarea.value);
      onParamSpec?.(textarea.value);
    }
  };
  numberLines();
  editor.append(gutter, textarea);
  wrapper.appendChild(editor);

  if (['html', 'css', 'javascript'].includes(field.language ?? '')) {
    const insert = documentRef.createElement('button');
    insert.type = 'button';
    insert.className = 'code-insert';
    insert.textContent = 'Insérer un fichier…';
    insert.title = 'Choisir un fichier de la médiathèque : son adresse (asset:<identifiant>) est écrite à l’endroit du curseur';
    insert.disabled = assetLibrary === undefined;
    insert.onclick = () => {
      const selection = { start: textarea.selectionStart ?? textarea.value.length, end: textarea.selectionEnd ?? textarea.value.length };
      assetLibrary?.open((asset) => {
        const next = insertAt(textarea.value, selection, `asset:${asset.id}`);
        textarea.value = next.text;
        textarea.focus();
        textarea.setSelectionRange(next.caret, next.caret);
        emit(field.key, next.text);
      });
    };
    wrapper.appendChild(insert);
  }
  wrapper.appendChild(status);

  if (field.key === 'paramSpec') showParamProblems(textarea.value);
  let dispose = () => {};
  if (field.reports === true && reports !== null) {
    /** @param {readonly { message: string, line: number | null }[]} list */
    const show = (list) => {
      status.textContent = list.slice(-3).map(({ message, line }) => (line === null ? message : `ligne ${line} : ${message}`)).join('\n');
      status.dataset.level = list.length > 0 ? 'error' : 'ok';
    };
    show(reports.current());
    dispose = reports.subscribe(show);
  }
  return { el: wrapper, dispose };
}
