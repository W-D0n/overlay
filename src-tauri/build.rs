use std::path::Path;

fn main() {
    // Le panneau (`ui/`) est embarqué : il ne peut pas charger `tokens.css` depuis les serveurs, qui sont justement
    // ce qu'il pilote. La source reste la racine du projet ; `ui/tokens.css` en est une copie générée (ignorée par git).
    let source = Path::new("..").join("tokens.css");
    println!("cargo:rerun-if-changed={}", source.display());
    std::fs::copy(&source, Path::new("ui").join("tokens.css")).expect("copie de tokens.css impossible");
    tauri_build::build()
}
