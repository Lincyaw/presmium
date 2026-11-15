//! The app's own words (window title, menu) and the launcher page's language, by the system's language.

pub struct Messages {
    pub title: &'static str,
    pub workspace: &'static str,
    pub open_workspace: &'static str,
    pub quit: &'static str,
    pub edit: &'static str,
    pub window: &'static str,
    pub check_updates: &'static str,
    pub updates_title: &'static str,
    pub update_checking: &'static str,
    pub update_current: &'static str,
    pub update_available: &'static str,
    pub update_download: &'static str,
    pub update_downloading: &'static str,
    pub update_ready: &'static str,
    pub update_later: &'static str,
    pub update_restart_hint: &'static str,
    pub update_restart: &'static str,
    pub update_failed: &'static str,
    pub update_install_failed: &'static str,
}

const ZH_CN: Messages = Messages {
    title: "Presmium Studio",
    workspace: "工作区",
    open_workspace: "打开工作区…",
    quit: "退出 Presmium Studio",
    edit: "编辑",
    window: "窗口",
    check_updates: "检查更新…",
    updates_title: "Presmium Studio 更新",
    update_checking: "正在检查更新…",
    update_current: "当前已是最新版本（{version}）。",
    update_available: "发现新版本 {version}。下载完成后会提示重启安装，你可以继续编辑当前工作区。",
    update_download: "下载更新",
    update_downloading: "正在下载更新…",
    update_ready: "更新已就绪",
    update_later: "稍后",
    update_restart_hint: "更新已下载并校验。请先保存文稿、处理未提交的表单和录音，再重启安装。安装后会重新打开上次的工作区。",
    update_restart: "重启安装",
    update_failed: "暂时无法完成更新，请检查网络后通过“检查更新”重试。",
    update_install_failed: "更新未能安装，原有工作区内容仍然保留。请重试，或从发布页面下载安装包。",
};

const EN: Messages = Messages {
    title: "Presmium Studio",
    workspace: "Workspace",
    open_workspace: "Open Workspace…",
    quit: "Quit Presmium Studio",
    edit: "Edit",
    window: "Window",
    check_updates: "Check for Updates…",
    updates_title: "Presmium Studio Update",
    update_checking: "Checking for updates…",
    update_current: "You are up to date ({version}).",
    update_available: "Version {version} is available. You can keep editing while it downloads; installation waits for your confirmation.",
    update_download: "Download Update",
    update_downloading: "Downloading update…",
    update_ready: "Update ready",
    update_later: "Later",
    update_restart_hint: "The update is downloaded and verified. Save your document and finish any unsaved forms or recordings before restarting. Your last workspace will reopen after installation.",
    update_restart: "Restart and Install",
    update_failed: "The update could not finish. Check your connection and try Check for Updates again.",
    update_install_failed: "The update could not be installed. Your workspace content is retained. Retry or download the installer from the release page.",
};

/// `zh-CN` or `en`, as the launcher page names them.
pub fn locale() -> &'static str {
    match sys_locale::get_locale() {
        Some(locale) if locale.to_lowercase().starts_with("zh") => "zh-CN",
        _ => "en",
    }
}

pub fn current() -> &'static Messages {
    if locale() == "zh-CN" { &ZH_CN } else { &EN }
}
