//! The remote Studio gets only these bounded chrome actions, never launcher/file/process commands.
use serde::Serialize;
use tauri::{AppHandle, Manager, WebviewWindow};

#[derive(Serialize)]
pub struct DesktopState {
    version: String,
    platform: &'static str,
    fullscreen: bool,
    update: super::updates::UpdateState,
}

fn authorized(app: &AppHandle, window: &WebviewWindow) -> Result<(), String> {
    if window.label() != super::MAIN { return Err("desktop-origin-denied".into()); }
    let url = window.url().map_err(|_| "desktop-origin-denied")?;
    if is_launcher(app, &url) { return Ok(()); }
    let desktop = app.state::<super::Desktop>();
    let running = desktop.running.lock().unwrap();
    if running.as_ref().and_then(|running| tauri::Url::parse(&running.url).ok())
        .is_some_and(|studio| studio.origin() == url.origin() && url.path() == "/") { return Ok(()); }
    Err("desktop-origin-denied".into())
}

pub fn is_launcher(app: &AppHandle, url: &tauri::Url) -> bool {
    let Some(mut launcher) = app.state::<super::Desktop>().launcher.lock().unwrap().clone() else { return false };
    let mut candidate = url.clone();
    launcher.set_query(None); launcher.set_fragment(None);
    candidate.set_query(None); candidate.set_fragment(None);
    // `tauri:` has an opaque URL origin, so comparing origin() rejects even the same launcher URL.
    launcher == candidate
}

fn snapshot(app: &AppHandle, window: &WebviewWindow) -> DesktopState {
    DesktopState {
        version: app.package_info().version.to_string(),
        platform: if cfg!(target_os = "macos") { "darwin" } else if cfg!(windows) { "win32" } else { "linux" },
        fullscreen: window.is_fullscreen().unwrap_or(false),
        update: app.state::<super::updates::Updates>().snapshot(),
    }
}

pub fn publish(app: &AppHandle) {
    if let Some(window) = super::main_window(app) {
        if authorized(app, &window).is_ok() {
            if let Ok(json) = serde_json::to_string(&snapshot(app, &window)) {
                let _ = window.eval(format!("window.dispatchEvent(new CustomEvent('presmium-desktop-state',{{detail:{json}}}))"));
            }
        }
    }
}

#[tauri::command]
pub fn desktop_state(app: AppHandle, window: WebviewWindow) -> Result<DesktopState, String> {
    authorized(&app, &window)?;
    Ok(snapshot(&app, &window))
}

#[tauri::command]
pub fn activate_app_update(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    authorized(&app, &window)?;
    super::updates::activate(app);
    Ok(())
}

#[tauri::command]
pub fn drag_window(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    authorized(&app, &window)?;
    window.start_dragging().map_err(|_| "desktop-window-unavailable".into())
}

#[tauri::command]
pub fn toggle_window(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    authorized(&app, &window)?;
    if window.is_maximized().unwrap_or(false) { window.unmaximize() } else { window.maximize() }
        .map_err(|_| "desktop-window-unavailable".into())
}
