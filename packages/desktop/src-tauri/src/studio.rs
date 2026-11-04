//! One `presmium studio` per window: started with the bundled Node and the bundled runtime, read for the address it
//! prints, stopped when the app quits or another workspace is opened.

use std::fs::File;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

/// Studio installs nothing on start, but a first start builds the workspace's previews.
const START_TIMEOUT: Duration = Duration::from_secs(180);
const STOP_GRACE: Duration = Duration::from_secs(8);

/// Why a start failed, as the launcher page names it (`ui/messages.ts`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LaunchError {
    NotDirectory,
    StartFailed,
    StartTimeout,
}

impl LaunchError {
    pub fn code(self) -> &'static str {
        match self {
            LaunchError::NotDirectory => "not-directory",
            LaunchError::StartFailed => "start-failed",
            LaunchError::StartTimeout => "start-timeout",
        }
    }
}

/// Where the bundle keeps the Node runtime and `@lincyaw/presmium`.
pub struct Runtime {
    pub node: PathBuf,
    pub presmium: PathBuf,
    pub log: PathBuf,
}

pub struct Running {
    pub url: String,
    pub workspace: PathBuf,
    child: Arc<Mutex<Child>>,
    /// Set before an intended stop, so the watcher does not report it as a crash.
    stopping: Arc<Mutex<bool>>,
}

impl Running {
    pub fn stop(self) {
        *self.stopping.lock().unwrap() = true;
        let mut child = self.child.lock().unwrap();
        terminate(&mut child);
        let deadline = Instant::now() + STOP_GRACE;
        while Instant::now() < deadline {
            if let Ok(Some(_)) = child.try_wait() {
                return;
            }
            thread::sleep(Duration::from_millis(100));
        }
        let _ = child.kill();
        let _ = child.wait();
    }
}

/// Lets Studio close DeepSeek Harness and the workspace service itself; Windows has no such signal, and there the
/// launcher's watchdog stops its children when it goes.
#[cfg(unix)]
fn terminate(child: &mut Child) {
    unsafe {
        libc::kill(child.id() as libc::pid_t, libc::SIGTERM);
    }
}

#[cfg(windows)]
fn terminate(child: &mut Child) {
    let _ = child.kill();
}

/// Starts Studio on `workspace` and waits for its address. `spawn` runs the command (on Linux, from a thread that
/// lives as long as the app); `on_exit` runs when Studio ends without being stopped.
pub fn start(
    runtime: &Runtime,
    workspace: &Path,
    spawn: impl FnOnce(Command) -> std::io::Result<Child>,
    on_exit: impl FnOnce() + Send + 'static,
) -> Result<Running, LaunchError> {
    if !workspace.is_dir() {
        return Err(LaunchError::NotDirectory);
    }
    if let Some(dir) = runtime.log.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let log = File::create(&runtime.log).map_err(|_| LaunchError::StartFailed)?;
    let errors = log.try_clone().map_err(|_| LaunchError::StartFailed)?;

    let mut command = Command::new(&runtime.node);
    command
        .arg(&runtime.presmium)
        .arg("studio")
        .arg(workspace)
        .current_dir(workspace)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::from(errors));
    // Tools the agent runs (`node`, `presmium`) find the bundled Node first.
    if let Some(bin) = runtime.node.parent() {
        let mut paths = vec![bin.to_path_buf()];
        paths.extend(std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default()));
        if let Ok(path) = std::env::join_paths(paths) {
            command.env("PATH", path);
        }
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    // If the app is killed, the kernel stops Studio too, which stops its own children. The signal follows the
    // thread that spawned it, hence `spawn`.
    #[cfg(target_os = "linux")]
    unsafe {
        use std::os::unix::process::CommandExt;
        command.pre_exec(|| {
            libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGTERM);
            Ok(())
        });
    }
    let mut child = spawn(command).map_err(|_| LaunchError::StartFailed)?;
    let stdout = child.stdout.take().ok_or(LaunchError::StartFailed)?;
    let child = Arc::new(Mutex::new(child));
    let stopping = Arc::new(Mutex::new(false));

    let (address, received) = mpsc::channel::<String>();
    {
        let stopping = stopping.clone();
        let mut log = log;
        thread::spawn(move || {
            let mut address = Some(address);
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                let _ = writeln!(log, "{line}");
                if let Some(url) = line.strip_prefix("studio  ") {
                    if let Some(sender) = address.take() {
                        let _ = sender.send(url.trim().to_string());
                    }
                }
            }
            // Studio closed its output: it has ended (or is about to). `stop` reaps it.
            if !*stopping.lock().unwrap() {
                on_exit();
            }
        });
    }

    let running = Running { url: String::new(), workspace: workspace.to_path_buf(), child, stopping };
    match received.recv_timeout(START_TIMEOUT) {
        Ok(url) if url.starts_with("http://") || url.starts_with("https://") => Ok(Running { url, ..running }),
        Ok(_) | Err(mpsc::RecvTimeoutError::Disconnected) => {
            running.stop();
            Err(LaunchError::StartFailed)
        }
        Err(mpsc::RecvTimeoutError::Timeout) => {
            running.stop();
            Err(LaunchError::StartTimeout)
        }
    }
}
