// Presmium Studio as a desktop app: a launcher page picks a workspace, the app starts `presmium studio` on it with the
// Node runtime and the `@lincyaw/presmium` installation it carries, and the window opens the address Studio prints.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod messages;
mod studio;

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use serde::Serialize;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::webview::{DownloadEvent, NewWindowResponse};
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Manager, RunEvent, State, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;

const MAIN: &str = "main";
const OPEN_WORKSPACE: &str = "open-workspace";
const RECENT_LIMIT: usize = 12;

#[derive(Default)]
struct Desktop {
    running: Mutex<Option<studio::Running>>,
    /// Which start the running Studio came from, so an old one ending does not disturb a newer one.
    generation: AtomicU64,
    current: AtomicU64,
    /// The launcher page's address, to return to it from Studio.
    launcher: Mutex<Option<Url>>,
    /// The last workspace is reopened once per run, when the launcher first loads.
    reopened: Mutex<bool>,
    /// Studio's origin while its first page loads, for one same-site retry of the sign-in (see `create_window`).
    signing_in: Mutex<Option<String>>,
}

#[derive(Serialize)]
struct LauncherState {
    locale: &'static str,
    recent: Vec<String>,
    reopen: Option<String>,
}

fn recent_file(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|dir| dir.join("workspaces.json"))
}

fn read_recent(app: &AppHandle) -> Vec<String> {
    recent_file(app)
        .and_then(|file| std::fs::read_to_string(file).ok())
        .and_then(|text| serde_json::from_str::<Vec<String>>(&text).ok())
        .unwrap_or_default()
}

fn write_recent(app: &AppHandle, recent: &[String]) {
    if let Some(file) = recent_file(app) {
        if let Some(dir) = file.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        if let Ok(text) = serde_json::to_string_pretty(recent) {
            let _ = std::fs::write(file, text);
        }
    }
}

fn remember(app: &AppHandle, workspace: &Path) {
    let path = workspace.to_string_lossy().to_string();
    let mut recent = read_recent(app);
    recent.retain(|other| other != &path);
    recent.insert(0, path);
    recent.truncate(RECENT_LIMIT);
    write_recent(app, &recent);
}

fn runtime(app: &AppHandle) -> Option<studio::Runtime> {
    let exe = std::env::current_exe().ok()?;
    let node = exe.parent()?.join(if cfg!(windows) { "presmium-node.exe" } else { "presmium-node" });
    let presmium = app.path().resource_dir().ok()?.join("runtime/node_modules/@lincyaw/presmium/bin/presmium.mjs");
    let log = app.path().app_log_dir().ok()?.join("studio.log");
    Some(studio::Runtime { node, presmium, log })
}

fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(MAIN)
}

/// Back to the launcher page, with what it should do there.
fn show_launcher(app: &AppHandle, query: &[(&str, &str)]) {
    let desktop = app.state::<Desktop>();
    let Some(mut url) = desktop.launcher.lock().unwrap().clone() else { return };
    url.query_pairs_mut().clear().extend_pairs(query);
    if let Some(window) = main_window(app) {
        let _ = window.set_title(messages::current().title);
        let _ = window.navigate(url);
    }
}

#[tauri::command]
fn launcher_state(app: AppHandle, desktop: State<'_, Desktop>) -> LauncherState {
    let recent = read_recent(&app);
    let mut reopened = desktop.reopened.lock().unwrap();
    let reopen = if *reopened { None } else { recent.first().filter(|path| Path::new(path).is_dir()).cloned() };
    *reopened = true;
    LauncherState { locale: messages::locale(), recent, reopen }
}

#[tauri::command]
fn forget_workspace(app: AppHandle, path: String) -> Vec<String> {
    let mut recent = read_recent(&app);
    recent.retain(|other| other != &path);
    write_recent(&app, &recent);
    recent
}

#[tauri::command]
async fn choose_workspace(app: AppHandle) -> Option<String> {
    let picked = app.dialog().file().set_title(messages::current().open_workspace).blocking_pick_folder()?;
    picked.into_path().ok().map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
async fn open_workspace(app: AppHandle, path: String) -> Result<(), String> {
    let workspace = PathBuf::from(&path);
    let runtime = runtime(&app).ok_or_else(|| studio::LaunchError::StartFailed.code().to_string())?;
    let handle = app.clone();
    let started = tauri::async_runtime::spawn_blocking(move || {
        let desktop = handle.state::<Desktop>();
        if let Some(previous) = desktop.running.lock().unwrap().take() {
            previous.stop();
        }
        let generation = desktop.generation.fetch_add(1, Ordering::SeqCst) + 1;
        let ended = handle.clone();
        let spawner = handle.clone();
        let spawn = move |mut command: std::process::Command| {
            let (sent, spawned) = std::sync::mpsc::channel();
            spawner
                .run_on_main_thread(move || {
                    let _ = sent.send(command.spawn());
                })
                .map_err(std::io::Error::other)?;
            spawned.recv().map_err(std::io::Error::other)?
        };
        studio::start(&runtime, &workspace, spawn, move || {
            let desktop = ended.state::<Desktop>();
            if desktop.current.load(Ordering::SeqCst) != generation {
                return;
            }
            if let Some(gone) = desktop.running.lock().unwrap().take() {
                gone.stop();
            }
            show_launcher(&ended, &[("error", "studio-ended")]);
        })
        .map(|running| (generation, running))
    })
    .await
    .map_err(|_| studio::LaunchError::StartFailed.code().to_string())?;

    let (generation, running) = started.map_err(|error| error.code().to_string())?;
    let url = Url::parse(&running.url).map_err(|_| studio::LaunchError::StartFailed.code().to_string())?;
    remember(&app, &running.workspace);
    let name = running.workspace.file_name().map(|name| name.to_string_lossy().to_string()).unwrap_or_default();
    let desktop = app.state::<Desktop>();
    *desktop.running.lock().unwrap() = Some(running);
    desktop.current.store(generation, Ordering::SeqCst);
    *desktop.signing_in.lock().unwrap() = Some(url.origin().ascii_serialization());
    if let Some(window) = main_window(&app) {
        let _ = window.set_title(&format!("{name} — {}", messages::current().title));
        let _ = window.navigate(url);
    }
    Ok(())
}

/// The details of a failed start: Studio's output, in the system's viewer for text.
#[tauri::command]
fn show_details(app: AppHandle) {
    if let Some(runtime) = runtime(&app) {
        let _ = tauri_plugin_opener::open_path(&runtime.log, None::<&str>);
    }
}

fn is_loopback(url: &Url) -> bool {
    matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "[::1]" | "::1"))
}

fn menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let t = messages::current();
    let open = MenuItem::with_id(app, OPEN_WORKSPACE, t.open_workspace, true, Some("CmdOrCtrl+Shift+O"))?;
    let workspace = Submenu::with_items(app, t.workspace, true, &[&open, &PredefinedMenuItem::separator(app)?, &PredefinedMenuItem::quit(app, Some(t.quit))?])?;
    // macOS routes copy, paste and undo through the Edit menu; without it these shortcuts do nothing in the page.
    let edit = Submenu::with_items(app, t.edit, true, &[
        &PredefinedMenuItem::undo(app, None)?,
        &PredefinedMenuItem::redo(app, None)?,
        &PredefinedMenuItem::separator(app)?,
        &PredefinedMenuItem::cut(app, None)?,
        &PredefinedMenuItem::copy(app, None)?,
        &PredefinedMenuItem::paste(app, None)?,
        &PredefinedMenuItem::select_all(app, None)?,
    ])?;
    let window = Submenu::with_items(app, t.window, true, &[
        &PredefinedMenuItem::minimize(app, None)?,
        &PredefinedMenuItem::fullscreen(app, None)?,
    ])?;
    #[cfg(target_os = "macos")]
    {
        let about = Submenu::with_items(app, t.title, true, &[
            &PredefinedMenuItem::about(app, None, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ])?;
        return Menu::with_items(app, &[&about, &workspace, &edit, &window]);
    }
    #[cfg(not(target_os = "macos"))]
    Menu::with_items(app, &[&workspace, &edit, &window])
}

fn create_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let window = WebviewWindowBuilder::new(app, MAIN, WebviewUrl::App("index.html".into()))
        .title(messages::current().title)
        .inner_size(1440.0, 900.0)
        .min_inner_size(720.0, 480.0)
        // Links out of Studio open in the browser; its own pages (presenting, previews) stay in the app.
        .on_new_window(move |url, _features| {
            if is_loopback(&url) {
                return NewWindowResponse::Allow;
            }
            if matches!(url.scheme(), "http" | "https" | "mailto") {
                let _ = tauri_plugin_opener::open_url(url.as_str(), None::<&str>);
            }
            NewWindowResponse::Deny
        })
        // Exports land in the Downloads folder and are shown there.
        .on_download(|webview, event| {
            match event {
                DownloadEvent::Requested { url, destination } => {
                    if !destination.is_absolute() {
                        if let Ok(downloads) = webview.app_handle().path().download_dir() {
                            let name = destination
                                .file_name()
                                .map(|name| name.to_os_string())
                                .or_else(|| url.path_segments().and_then(|mut segments| segments.next_back()).filter(|name| !name.is_empty()).map(Into::into))
                                .unwrap_or_else(|| "download".into());
                            *destination = downloads.join(name);
                        }
                    }
                }
                DownloadEvent::Finished { path: Some(path), success: true, .. } => {
                    let _ = tauri_plugin_opener::reveal_item_in_dir(path);
                }
                _ => {}
            }
            true
        })
        // Studio signs the window in with a `SameSite=Strict` cookie that its launch address sets and redirects
        // to. Coming from the launcher page (another site), that redirect may be sent without the cookie, and
        // DeepSeek Harness answers with its plain-text sign-in error; loading again from Studio's own page sends it.
        .on_page_load(|window, payload| {
            if payload.event() != PageLoadEvent::Finished {
                return;
            }
            let desktop = window.app_handle().state::<Desktop>();
            let mut signing_in = desktop.signing_in.lock().unwrap();
            if signing_in.as_deref() == Some(payload.url().origin().ascii_serialization().as_str()) {
                *signing_in = None;
                let _ = window.eval("if (document.contentType === 'text/plain') location.replace('/')");
            }
        })
        .build()?;
    *app.state::<Desktop>().launcher.lock().unwrap() = window.url().ok();
    Ok(window)
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = main_window(app) {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Desktop::default())
        .invoke_handler(tauri::generate_handler![launcher_state, forget_workspace, choose_workspace, open_workspace, show_details])
        .menu(|app| menu(app))
        .on_menu_event(|app, event| {
            if event.id() == OPEN_WORKSPACE {
                let app = app.clone();
                app.dialog().file().set_title(messages::current().open_workspace).pick_folder(move |picked| {
                    if let Some(path) = picked.and_then(|picked| picked.into_path().ok()) {
                        show_launcher(&app, &[("workspace", &path.to_string_lossy())]);
                    }
                });
            }
        })
        .setup(|app| {
            create_window(app.handle())?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Presmium Studio could not start");

    app.run(|app, event| {
        if let RunEvent::Exit = event {
            if let Some(running) = app.state::<Desktop>().running.lock().unwrap().take() {
                running.stop();
            }
        }
    });
}
