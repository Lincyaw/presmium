//! The app's own words (window title, menu) and the launcher page's language, by the system's language.

pub struct Messages {
    pub title: &'static str,
    pub workspace: &'static str,
    pub open_workspace: &'static str,
    pub quit: &'static str,
    pub edit: &'static str,
    pub window: &'static str,
}

const ZH_CN: Messages = Messages {
    title: "Presmium Studio",
    workspace: "工作区",
    open_workspace: "打开工作区…",
    quit: "退出 Presmium Studio",
    edit: "编辑",
    window: "窗口",
};

const EN: Messages = Messages {
    title: "Presmium Studio",
    workspace: "Workspace",
    open_workspace: "Open Workspace…",
    quit: "Quit Presmium Studio",
    edit: "Edit",
    window: "Window",
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
