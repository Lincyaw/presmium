fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "launcher_state", "forget_workspace", "choose_workspace", "open_workspace", "show_details",
            "desktop_state", "activate_app_update", "drag_window", "toggle_window",
        ]),
    )).expect("desktop permissions could not be generated")
}
