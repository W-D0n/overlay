// Coquille de l'application « Overlay Studio » (docs/specs/controle-processus.md, D1).
//
// Elle lance les serveurs du projet (`bun dev/start-stream.js`) à l'ouverture, les arrête à la fermeture,
// ouvre le Studio dans sa fenêtre et propose « Lancer au démarrage de Windows », désactivé par défaut.
// Si les serveurs tournent déjà (lancés à la main), elle s'y attache sans rien lancer ni arrêter.
// Les ports viennent de `ports.config.js`, source unique du projet.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::{SocketAddr, TcpStream};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use tauri::menu::{CheckMenuItemBuilder, MenuBuilder, SubmenuBuilder};
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const SERVERS_READY_TIMEOUT: Duration = Duration::from_secs(20);
const AUTOSTART_MENU_ID: &str = "autostart";

/// Lanceur démarré par l'application ; `None` si les serveurs tournaient déjà ou n'ont pas pu être lancés.
struct OwnedLauncher(Mutex<Option<Child>>);

/// Valeur d'une constante numérique exportée par `ports.config.js` (`export const NAME = 1234;`).
fn parse_port(source: &str, name: &str) -> Option<u16> {
    let marker = format!("export const {name} =");
    let rest = &source[source.find(&marker)? + marker.len()..];
    rest.trim_start()
        .chars()
        .take_while(char::is_ascii_digit)
        .collect::<String>()
        .parse()
        .ok()
}

/// Port d'un serveur : la variable d'environnement du même nom (comme les scripts Bun), sinon `ports.config.js`.
fn port(name: &str, config: &str) -> Result<u16, String> {
    match std::env::var(name) {
        Ok(value) => value.parse().map_err(|_| format!("{name} n'est pas un port : {value}")),
        Err(_) => parse_port(config, name).ok_or_else(|| format!("{name} introuvable dans ports.config.js")),
    }
}

/// Racine du projet : variable `OVERLAY_ROOT`, sinon le dossier parent de `src-tauri/` à la compilation.
fn project_root() -> PathBuf {
    std::env::var_os("OVERLAY_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|| Path::new(env!("CARGO_MANIFEST_DIR")).join(".."))
}

fn port_open(port: u16) -> bool {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    TcpStream::connect_timeout(&address, Duration::from_millis(300)).is_ok()
}

fn wait_until_open(ports: &[u16], timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if ports.iter().all(|port| port_open(*port)) {
            return true;
        }
        thread::sleep(Duration::from_millis(200));
    }
    false
}

fn launch_servers(root: &Path) -> std::io::Result<Child> {
    Command::new("bun")
        .arg("dev/start-stream.js")
        .current_dir(root)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
}

/// Arrête le lanceur et tous ses enfants (les serveurs).
fn stop_tree(launcher: &mut Child) {
    let _ = Command::new("taskkill")
        .args(["/T", "/F", "/PID", &launcher.id().to_string()])
        .creation_flags(CREATE_NO_WINDOW)
        .status();
    let _ = launcher.wait();
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .manage(OwnedLauncher(Mutex::new(None)))
        .setup(|app| {
            let root = project_root();
            let config = std::fs::read_to_string(root.join("ports.config.js"))?;
            let static_port = port("STATIC_PORT", &config)?;
            let state_port = port("BACKGROUND_STATE_PORT", &config)?;

            let autostart = CheckMenuItemBuilder::with_id(AUTOSTART_MENU_ID, "Lancer au démarrage de Windows")
                .checked(app.autolaunch().is_enabled().unwrap_or(false))
                .build(app)?;
            let menu = MenuBuilder::new(app)
                .item(&SubmenuBuilder::new(app, "Application").item(&autostart).separator().quit().build()?)
                .build()?;
            app.set_menu(menu)?;
            app.on_menu_event(move |app, event| {
                if event.id() != AUTOSTART_MENU_ID {
                    return;
                }
                let manager = app.autolaunch();
                let wanted = autostart.is_checked().unwrap_or(false);
                let applied = if wanted { manager.enable() } else { manager.disable() };
                if applied.is_err() {
                    let _ = autostart.set_checked(manager.is_enabled().unwrap_or(false));
                }
            });

            let handle = app.handle().clone();
            thread::spawn(move || {
                if !port_open(static_port) && !port_open(state_port) {
                    match launch_servers(&root) {
                        Ok(child) => *handle.state::<OwnedLauncher>().0.lock().unwrap() = Some(child),
                        Err(error) => eprintln!("[overlay-studio] impossible de lancer bun : {error}"),
                    }
                }
                if !wait_until_open(&[static_port, state_port], SERVERS_READY_TIMEOUT) {
                    eprintln!("[overlay-studio] les serveurs ne répondent pas après {SERVERS_READY_TIMEOUT:?}");
                }
                let url = format!("http://localhost:{static_port}/dev/studio.html");
                let window = WebviewWindowBuilder::new(&handle, "main", WebviewUrl::External(url.parse().unwrap()))
                    .title("Overlay Studio")
                    .inner_size(1400.0, 900.0)
                    .build();
                if let Err(error) = window {
                    eprintln!("[overlay-studio] fenêtre impossible : {error}");
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("erreur au lancement de l'application Tauri");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            if let Some(mut launcher) = handle.state::<OwnedLauncher>().0.lock().unwrap().take() {
                stop_tree(&mut launcher);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lit_les_ports_dans_la_source_unique_du_projet() {
        let config = std::fs::read_to_string(project_root().join("ports.config.js")).unwrap();
        let static_port = parse_port(&config, "STATIC_PORT").unwrap();
        let state_port = parse_port(&config, "BACKGROUND_STATE_PORT").unwrap();
        assert_ne!(static_port, state_port);
        assert!(static_port > 1024 && state_port > 1024);
    }

    #[test]
    fn un_nom_absent_ne_donne_rien() {
        assert_eq!(parse_port("export const A = 12;", "B"), None);
        assert_eq!(parse_port("export const A = 12;", "A"), Some(12));
    }
}
