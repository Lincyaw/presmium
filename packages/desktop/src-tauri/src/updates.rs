//! Native updates stay outside the unprivileged Studio web page.
use std::fs;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::menu::MenuItem;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_updater::UpdaterExt;
use serde::Serialize;

pub const CHECK_UPDATES: &str = "check-updates";

#[derive(Clone, Serialize)]
pub struct UpdateState {
    phase: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    progress: Option<u64>,
}

impl Default for UpdateState {
    fn default() -> Self { Self { phase: "idle", version: None, progress: None } }
}

#[derive(Default)]
pub struct Updates {
    state: Mutex<UpdateState>,
    busy: AtomicBool,
    item: Mutex<Option<MenuItem<tauri::Wry>>>,
    timer: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
}

impl Updates {
    pub fn snapshot(&self) -> UpdateState { self.state.lock().unwrap().clone() }
}

fn phase(app: &AppHandle, phase: &'static str, version: Option<&str>, progress: Option<u64>) {
    let updates = app.state::<Updates>();
    {
        let mut state = updates.state.lock().unwrap();
        let version = version.map(Into::into).or_else(|| {
            if matches!(phase, "checking" | "error") { state.version.clone() } else { None }
        });
        *state = UpdateState { phase, version, progress };
    }
    super::chrome::publish(app);
}

pub fn menu_item(app: &AppHandle) -> tauri::Result<MenuItem<tauri::Wry>> {
    let item = MenuItem::with_id(app, CHECK_UPDATES, super::messages::current().check_updates, true, None::<&str>)?;
    *app.state::<Updates>().item.lock().unwrap() = Some(item.clone());
    Ok(item)
}

fn status(app: &AppHandle, label: &str, enabled: bool) {
    if let Some(item) = app.state::<Updates>().item.lock().unwrap().as_ref() {
        let _ = item.set_text(label);
        let _ = item.set_enabled(enabled);
    }
}

fn report(app: &AppHandle, message: &str) {
    let mut dialog = app.dialog().message(message).title(super::messages::current().updates_title);
    if let Some(window) = app.get_webview_window(super::MAIN) { dialog = dialog.parent(&window); }
    dialog.show(|_| {});
}

fn record_failure(app: &AppHandle, error: &str) {
    if let Ok(dir) = app.path().app_log_dir() {
        let _ = fs::create_dir_all(&dir);
        let _ = fs::write(dir.join("updates.log"), error);
    }
}

async fn confirm(app: AppHandle, message: String, accept: &'static str) -> bool {
    tauri::async_runtime::spawn_blocking(move || {
        let t = super::messages::current();
        let mut dialog = app.dialog().message(message).title(t.updates_title)
            .buttons(MessageDialogButtons::OkCancelCustom(accept.into(), t.update_later.into()));
        if let Some(window) = app.get_webview_window(super::MAIN) { dialog = dialog.parent(&window); }
        dialog.blocking_show()
    }).await.unwrap_or(false)
}

struct Busy(AppHandle);
impl Drop for Busy {
    fn drop(&mut self) {
        self.0.state::<Updates>().busy.store(false, Ordering::SeqCst);
        status(&self.0, super::messages::current().check_updates, true);
    }
}

#[derive(Clone, Copy, PartialEq)]
enum Mode { Background, Manual, Activate }

pub fn check(app: AppHandle, manual: bool) {
    run(app, if manual { Mode::Manual } else { Mode::Background });
}

pub fn activate(app: AppHandle) { run(app, Mode::Activate); }

fn run(app: AppHandle, mode: Mode) {
    let manual = mode != Mode::Background;
    if app.state::<Updates>().busy.swap(true, Ordering::SeqCst) { return; }
    tauri::async_runtime::spawn(async move {
        let _busy = Busy(app.clone());
        let t = super::messages::current();
        let mut interacted = manual;
        status(&app, t.update_checking, false);
        phase(&app, "checking", None, None);
        let outcome = async {
            let updater = app.updater_builder().timeout(Duration::from_secs(30)).build()?;
            let Some(mut update) = updater.check().await? else {
                phase(&app, "current", None, None);
                if manual { report(&app, &t.update_current.replace("{version}", &app.package_info().version.to_string())); }
                return Ok::<(), tauri_plugin_updater::Error>(());
            };
            phase(&app, "available", Some(&update.version), None);
            // Background discovery changes only the icon; downloading requires an author action.
            if mode == Mode::Background { return Ok(()); }
            update.timeout = Some(Duration::from_secs(20 * 60));

            let cache = app.path().app_cache_dir().ok().map(|dir| dir.join("updates").join(format!("{}-{}.bin", update.target, update.version)));
            if let Some(path) = &cache {
                if let Some(dir) = path.parent() {
                    if let Ok(entries) = fs::read_dir(dir) {
                        for entry in entries.flatten() {
                            let old = entry.path();
                            if old != *path && matches!(old.extension().and_then(|value| value.to_str()), Some("bin" | "partial")) {
                                let _ = fs::remove_file(old);
                            }
                        }
                    }
                }
            }
            let cached = cache.as_ref().and_then(|path| fs::read(path).ok()).filter(|bytes| update.verify(bytes).is_ok());
            let bytes = if let Some(bytes) = cached { bytes } else {
                let message = t.update_available.replace("{version}", &update.version);
                if mode != Mode::Activate && !confirm(app.clone(), message, t.update_download).await { return Ok(()); }
                interacted = true;
                let mut downloaded = 0u64;
                let mut last = None;
                let progress_app = app.clone();
                let progress_version = update.version.clone();
                status(&app, t.update_downloading, false);
                phase(&app, "downloading", Some(&update.version), None);
                let bytes = update.download(move |chunk, total| {
                    downloaded += chunk as u64;
                    let percentage = total.filter(|total| *total > 0).map(|total| (downloaded.saturating_mul(100) / total).min(100));
                    if percentage != last {
                        last = percentage;
                        let label = percentage.map(|value| format!("{} {value}%", super::messages::current().update_downloading))
                            .unwrap_or_else(|| super::messages::current().update_downloading.into());
                        status(&progress_app, &label, false);
                        phase(&progress_app, "downloading", Some(&progress_version), percentage);
                    }
                }, || {}).await?;
                if let Some(path) = &cache {
                    // A cached package is always verified again against the current signed-version manifest.
                    if let Some(dir) = path.parent() { let _ = fs::create_dir_all(dir); }
                    let temporary = path.with_extension("partial");
                    if fs::write(&temporary, &bytes).is_ok() { let _ = fs::rename(temporary, path); }
                }
                bytes
            };
            status(&app, t.update_ready, false);
            phase(&app, "ready", Some(&update.version), Some(100));
            if !confirm(app.clone(), t.update_restart_hint.into(), t.update_restart).await { return Ok(()); }
            phase(&app, "installing", Some(&update.version), None);
            // Windows installation exits the process itself, so owned Studio must stop before install.
            super::stop_studio(&app);
            let installed = tauri::async_runtime::spawn_blocking(move || update.install(bytes)).await;
            match installed {
                Ok(Ok(())) => {
                    if let Some(path) = cache { let _ = fs::remove_file(path); }
                    app.restart();
                }
                failed => {
                    phase(&app, "error", None, None);
                    let reason = match failed {
                        Ok(Err(error)) => error.to_string(),
                        Err(error) => error.to_string(),
                        _ => unreachable!(),
                    };
                    record_failure(&app, &reason);
                    super::show_launcher(&app, &[]);
                    report(&app, t.update_install_failed);
                }
            }
            Ok(())
        }.await;
        if let Err(error) = outcome {
            phase(&app, "error", None, None);
            record_failure(&app, &error.to_string());
            if interacted { report(&app, t.update_failed); }
        }
    });
}

pub fn start(app: &AppHandle) {
    // Development sessions do not prompt to replace the application being developed.
    if cfg!(debug_assertions) { return; }
    let handle = app.clone();
    *app.state::<Updates>().timer.lock().unwrap() = Some(tauri::async_runtime::spawn(async move {
        loop {
            check(handle.clone(), false);
            tokio::time::sleep(Duration::from_secs(6 * 60 * 60)).await;
        }
    }));
}

pub fn stop(app: &AppHandle) {
    if let Some(timer) = app.state::<Updates>().timer.lock().unwrap().take() { timer.abort(); }
}
