// Coquille de l'application « Overlay Studio » (docs/specs/controle-processus.md, D1).
//
// Elle vérifie ses prérequis (Bun), lance les serveurs du projet (`bun dev/start-stream.js`), ouvre le Studio dans
// sa fenêtre et arrête ce qu'elle a lancé à la fermeture. Si les serveurs tournent déjà (lancés à la main), elle
// s'y attache sans rien lancer ni arrêter à la fermeture. Son menu « Serveurs » démarre, redémarre et arrête
// de force, sans passer par la page : c'est le recours quand la page elle-même ne répond plus.
// Les ports viennent de `STATIC_PORT` / `BACKGROUND_STATE_PORT`, sinon de `ports.config.js` (source unique du projet).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use tauri::menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const SERVERS_READY_TIMEOUT: Duration = Duration::from_secs(20);
const AUTOSTART_MENU_ID: &str = "autostart";
const START_MENU_ID: &str = "servers-start";
const RESTART_MENU_ID: &str = "servers-restart";
const STOP_MENU_ID: &str = "servers-stop";
const BUN_DOWNLOAD: &str = "https://bun.sh";

/// Racine du projet et ports des serveurs, lus une fois au démarrage.
struct Config {
    root: PathBuf,
    static_port: u16,
    state_port: u16,
}

/// Lanceur démarré par l'application ; `None` si les serveurs tournaient déjà ou ne sont pas lancés.
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

/// Vrai si le serveur d'état du projet répond sur ce port (et pas un autre programme qui tiendrait le port).
fn state_server_answers(port: u16) -> bool {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(500)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(1500)));
    let request = "GET /obs-status HTTP/1.0\r\nHost: localhost\r\nConnection: close\r\n\r\n";
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut head = [0u8; 64];
    let read = stream.read(&mut head).unwrap_or(0);
    String::from_utf8_lossy(&head[..read]).starts_with("HTTP/1.1 200")
        || String::from_utf8_lossy(&head[..read]).starts_with("HTTP/1.0 200")
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

fn wait_until_closed(ports: &[u16], timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if ports.iter().all(|port| !port_open(*port)) {
            return true;
        }
        thread::sleep(Duration::from_millis(200));
    }
    false
}

/// Version de Bun installée, `None` s'il est introuvable.
fn bun_version() -> Option<String> {
    let output = Command::new("bun").arg("--version").creation_flags(CREATE_NO_WINDOW).output().ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).trim().to_string())
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

fn alert(app: &AppHandle, title: &str, message: &str) {
    app.dialog()
        .message(message)
        .title(title)
        .kind(MessageDialogKind::Error)
        .blocking_show();
}

/// Lance les serveurs s'ils ne tournent pas, puis attend qu'ils répondent. Dit pourquoi en cas d'échec.
fn ensure_servers(app: &AppHandle) -> Result<(), String> {
    let config = app.state::<Config>();
    let ports = [config.static_port, config.state_port];
    if ports.iter().any(|port| port_open(*port)) {
        // Des serveurs tournent déjà : s'y attacher, sauf si un autre programme tient le port.
        if !wait_until_open(&ports, Duration::from_secs(2)) || !state_server_answers(config.state_port) {
            return Err(format!(
                "Les ports {} et {} sont occupés par un autre programme que les serveurs du projet. Ferme-le (Gestionnaire des tâches) puis relance l'application.",
                config.static_port, config.state_port
            ));
        }
        return Ok(());
    }
    let child = launch_servers(&config.root).map_err(|error| format!("Impossible de lancer Bun : {error}"))?;
    *app.state::<OwnedLauncher>().0.lock().unwrap() = Some(child);
    if wait_until_open(&ports, SERVERS_READY_TIMEOUT) {
        Ok(())
    } else {
        Err(format!(
            "Les serveurs n'ont pas répondu après {} s. Lance start-stream.bat dans un terminal pour lire l'erreur.",
            SERVERS_READY_TIMEOUT.as_secs()
        ))
    }
}

/// Arrête de force tout ce qui tient les ports du projet : ce que l'application a lancé, puis ce qui reste
/// (serveurs lancés à la main) par `kill-servers`, qui ne touche jamais un programme étranger au projet.
fn stop_everything(app: &AppHandle) {
    if let Some(mut launcher) = app.state::<OwnedLauncher>().0.lock().unwrap().take() {
        stop_tree(&mut launcher);
    }
    let config = app.state::<Config>();
    if port_open(config.static_port) || port_open(config.state_port) {
        let _ = Command::new("bun")
            .arg("dev/kill-servers.js")
            .current_dir(&config.root)
            .creation_flags(CREATE_NO_WINDOW)
            .status();
    }
    wait_until_closed(&[config.static_port, config.state_port], Duration::from_secs(8));
}

fn reload_studio(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.eval("window.location.reload()");
    }
}

fn confirm(app: &AppHandle, title: &str, message: &str, label: &str) -> bool {
    app.dialog()
        .message(message)
        .title(title)
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom(label.to_string(), "Annuler".to_string()))
        .blocking_show()
}

/// Gestes du menu « Serveurs », hors du fil de l'interface : ils attendent des processus.
fn run_server_action(app: AppHandle, id: String) {
    thread::spawn(move || match id.as_str() {
        START_MENU_ID => match ensure_servers(&app) {
            Ok(()) => reload_studio(&app),
            Err(message) => alert(&app, "Démarrage impossible", &message),
        },
        RESTART_MENU_ID => {
            if !confirm(&app, "Redémarrer les serveurs ?", "Une source OBS qui affiche le fond restera noire quelques secondes, puis se reconnectera seule.", "Redémarrer") {
                return;
            }
            stop_everything(&app);
            match ensure_servers(&app) {
                Ok(()) => reload_studio(&app),
                Err(message) => alert(&app, "Redémarrage impossible", &message),
            }
        }
        STOP_MENU_ID => {
            if confirm(&app, "Arrêter les serveurs ?", "Arrêt forcé : le fond des sources OBS restera noir tant que les serveurs sont arrêtés. Relance-les par « Serveurs > Démarrer ».", "Arrêter") {
                stop_everything(&app);
            }
        }
        _ => {}
    });
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_dialog::init())
        .manage(OwnedLauncher(Mutex::new(None)))
        .setup(|app| {
            let root = project_root();
            let ports_source = std::fs::read_to_string(root.join("ports.config.js"))?;
            app.manage(Config {
                static_port: port("STATIC_PORT", &ports_source)?,
                state_port: port("BACKGROUND_STATE_PORT", &ports_source)?,
                root,
            });

            let autostart = CheckMenuItemBuilder::with_id(AUTOSTART_MENU_ID, "Lancer au démarrage de Windows")
                .checked(app.autolaunch().is_enabled().unwrap_or(false))
                .build(app)?;
            let menu = MenuBuilder::new(app)
                .item(&SubmenuBuilder::new(app, "Application").item(&autostart).separator().quit().build()?)
                .item(
                    &SubmenuBuilder::new(app, "Serveurs")
                        .item(&MenuItemBuilder::with_id(START_MENU_ID, "Démarrer").build(app)?)
                        .item(&MenuItemBuilder::with_id(RESTART_MENU_ID, "Redémarrer").build(app)?)
                        .item(&MenuItemBuilder::with_id(STOP_MENU_ID, "Arrêter (forcé)").build(app)?)
                        .build()?,
                )
                .build()?;
            app.set_menu(menu)?;
            app.on_menu_event(move |app, event| {
                let id = event.id().as_ref().to_string();
                if id == AUTOSTART_MENU_ID {
                    let manager = app.autolaunch();
                    let wanted = autostart.is_checked().unwrap_or(false);
                    let applied = if wanted { manager.enable() } else { manager.disable() };
                    if applied.is_err() {
                        let _ = autostart.set_checked(manager.is_enabled().unwrap_or(false));
                    }
                } else {
                    run_server_action(app.clone(), id);
                }
            });

            let handle = app.handle().clone();
            thread::spawn(move || {
                if bun_version().is_none() {
                    alert(
                        &handle,
                        "Bun est introuvable",
                        &format!("Les serveurs du Studio ont besoin de Bun, qui n'est pas installé ou pas dans le PATH. Installe-le depuis {BUN_DOWNLOAD}, puis relance l'application."),
                    );
                    handle.exit(1);
                    return;
                }
                if let Err(message) = ensure_servers(&handle) {
                    alert(&handle, "Démarrage impossible", &message);
                }
                let static_port = handle.state::<Config>().static_port;
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

    #[test]
    fn bun_est_detecte_quand_il_est_dans_le_path_et_absent_quand_il_n_y_est_pas() {
        assert!(bun_version().is_some(), "Bun doit être installé pour lancer les tests");
        let saved = std::env::var_os("PATH");
        std::env::set_var("PATH", "");
        let without = bun_version();
        if let Some(path) = saved {
            std::env::set_var("PATH", path);
        }
        assert_eq!(without, None);
    }

    #[test]
    fn un_port_ferme_ne_repond_pas_comme_serveur_d_etat() {
        let probe = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let free = probe.local_addr().unwrap().port();
        drop(probe);
        assert!(!port_open(free));
        assert!(!state_server_answers(free));
    }

    #[test]
    fn un_programme_etranger_sur_le_port_n_est_pas_pris_pour_le_serveur_d_etat() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let stranger = thread::spawn(move || {
            if let Ok((mut stream, _)) = listener.accept() {
                let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\n\r\n");
            }
        });
        assert!(port_open(port));
        assert!(!state_server_answers(port));
        let _ = stranger.join();
    }

    #[test]
    fn le_serveur_d_etat_du_projet_est_reconnu_par_sa_reponse_200() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = thread::spawn(move || {
            if let Ok((mut stream, _)) = listener.accept() {
                let mut buffer = [0u8; 256];
                let _ = stream.read(&mut buffer);
                let _ = stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n{}");
            }
        });
        assert!(state_server_answers(port));
        let _ = server.join();
    }
}
