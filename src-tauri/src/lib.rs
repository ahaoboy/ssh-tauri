use russh::client::{self, Handler};
use russh::keys::{load_secret_key, ssh_key, PrivateKeyWithHashAlg};
use russh::Channel;
use std::sync::{Arc, Mutex};
use tauri::Emitter;

// ── Connection parameters ───────────────────────────────────────────────────

/// Connection parameters sent from the frontend.
#[derive(Debug, serde::Deserialize)]
struct ConnectParams {
    host: String,
    port: u16,
    username: String,
    password: Option<String>,
    private_key: Option<String>,
    cols: u32,
    rows: u32,
}

// ── Client handler ──────────────────────────────────────────────────────────

/// Minimal SSH client handler.
/// Accepts all server host keys (like StrictHostKeyChecking=no).
struct ClientHandler;

impl Handler for ClientHandler {
    type Error = russh::Error;

    /// Accept all server host keys (equivalent to StrictHostKeyChecking=no).
    async fn check_server_key(
        &mut self,
        _server_public_key: &ssh_key::PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

// ── Control messages for the background SSH task ────────────────────────────

/// Messages sent from Tauri commands into the single background task
/// that owns the SSH channel.
enum ControlMsg {
    /// Write terminal input to the SSH channel.
    Data(Vec<u8>),
    /// Resize the PTY (not yet implemented for ChannelStream).
    #[allow(dead_code)]
    Resize { cols: u32, rows: u32 },
}

// ── Application state ───────────────────────────────────────────────────────

/// Per-connection mutable state, protected by a std::sync::Mutex.
struct SshState {
    /// The Russh client handle. Dropping it closes the SSH connection.
    handle: Option<client::Handle<ClientHandler>>,
    /// Sender side of the control channel (Tauri commands → background task).
    control_tx: Option<tokio::sync::mpsc::UnboundedSender<ControlMsg>>,
    /// JoinHandle for the background read/write task.
    reader_task: Option<tokio::task::JoinHandle<()>>,
}

/// Tauri managed state.
struct AppState {
    ssh: Mutex<SshState>,
}

// ── Background SSH I/O task ─────────────────────────────────────────────────

/// Runs in a tokio task: reads from the SSH channel and emits `ssh-data`
/// events; receives `ControlMsg` from the mpsc channel to write data
/// or resize the terminal.
async fn ssh_io_loop(
    channel: Channel<client::Msg>,
    mut control_rx: tokio::sync::mpsc::UnboundedReceiver<ControlMsg>,
    app: tauri::AppHandle,
) {
    // Wrap the channel in a stream for ergonomic AsyncRead/AsyncWrite.
    let mut stream = channel.into_stream();
    let mut read_buf = [0u8; 8192];

    loop {
        tokio::select! {
            // ── Read from SSH → emit to frontend ────────────────
            result = tokio::io::AsyncReadExt::read(&mut stream, &mut read_buf) => {
                match result {
                    Ok(0) => {
                        let _ = app.emit("ssh-data",
                            "\r\n\x1b[33mConnection closed by remote host.\x1b[0m\r\n");
                        let _ = app.emit("ssh-closed", ());
                        break;
                    }
                    Ok(n) => {
                        let text = String::from_utf8_lossy(&read_buf[..n]).to_string();
                        let _ = app.emit("ssh-data", text);
                    }
                    Err(e) => {
                        let _ = app.emit("ssh-data",
                            format!("\r\n\x1b[31mRead error: {}\x1b[0m\r\n", e));
                        let _ = app.emit("ssh-closed", ());
                        break;
                    }
                }
            }

            // ── Control messages (write / resize) ──────────────
            msg = control_rx.recv() => {
                match msg {
                    Some(ControlMsg::Data(data)) => {
                        use tokio::io::AsyncWriteExt;
                        if let Err(e) = stream.write_all(&data).await {
                            let _ = app.emit("ssh-data",
                                format!("\r\n\x1b[31mWrite error: {}\x1b[0m\r\n", e));
                            break;
                        }
                    }
                    Some(ControlMsg::Resize { cols: _, rows: _ }) => {
                        // PTY resize via ChannelStream is not supported;
                        // most remote shells adapt to SIGWINCH automatically.
                    }
                    None => break, // sender dropped → shut down
                }
            }
        }
    }
}

// ── Tauri commands ──────────────────────────────────────────────────────────

/// Connect to an SSH server and start an interactive shell.
#[tauri::command]
async fn ssh_connect(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    params: ConnectParams,
) -> Result<(), String> {
    // ── Tear down any existing connection ──────────────────────
    {
        let mut ssh = state.ssh.lock().map_err(|e| e.to_string())?;
        ssh.control_tx.take(); // dropping the sender signals the task to stop
        ssh.handle.take(); // dropping the handle closes the TCP connection
        if let Some(task) = ssh.reader_task.take() {
            task.abort();
        }
    }

    // ── Connect ───────────────────────────────────────────────
    let config = client::Config::default();
    let handler = ClientHandler;

    let mut handle = client::connect(
        Arc::new(config),
        (params.host.as_str(), params.port),
        handler,
    )
    .await
    .map_err(|e| format!("SSH connection failed: {}", e))?;

    // ── Authenticate ──────────────────────────────────────────
    let auth_result = if let Some(ref key_str) = params.private_key {
        // Guard: reject empty key strings
        if key_str.trim().is_empty() {
            return Err("Private key is empty".into());
        }
        // Write key to temp file (russh-keys reads from path)
        let tmp_dir = std::env::temp_dir();
        let key_path = tmp_dir.join(format!("ssh-tauri-key-{}", std::process::id()));
        std::fs::write(&key_path, key_str)
            .map_err(|e| format!("Failed to write temp key: {}", e))?;

        let result = async {
            let key_pair = load_secret_key(&key_path, None)
                .map_err(|e| format!("Invalid private key: {}", e))?;
            let key_with_alg = PrivateKeyWithHashAlg::new(Arc::new(key_pair), None);
            handle
                .authenticate_publickey(&params.username, key_with_alg)
                .await
                .map_err(|e| format!("Authentication failed: {}", e))
        }
        .await;

        let _ = std::fs::remove_file(&key_path);
        result?
    } else if let Some(ref password) = params.password {
        handle
            .authenticate_password(&params.username, password)
            .await
            .map_err(|e| format!("Authentication failed: {}", e))?
    } else {
        return Err("No authentication method provided".into());
    };

    if !auth_result.success() {
        return Err("Authentication rejected by server".into());
    }

    // ── Open channel + PTY + shell ────────────────────────────
    let channel = handle
        .channel_open_session()
        .await
        .map_err(|e| format!("Failed to open channel: {}", e))?;

    channel
        .request_pty(false, "xterm-256color", params.cols, params.rows, 0, 0, &[])
        .await
        .map_err(|e| format!("Failed to request PTY: {}", e))?;

    channel
        .request_shell(false)
        .await
        .map_err(|e| format!("Failed to start shell: {}", e))?;

    // ── Spawn background I/O task ─────────────────────────────
    let (control_tx, control_rx) = tokio::sync::mpsc::unbounded_channel();
    let app_clone = app.clone();
    let reader_task = tokio::spawn(ssh_io_loop(channel, control_rx, app_clone));

    // ── Store state ───────────────────────────────────────────
    {
        let mut ssh = state.ssh.lock().map_err(|e| e.to_string())?;
        ssh.handle = Some(handle);
        ssh.control_tx = Some(control_tx);
        ssh.reader_task = Some(reader_task);
    }

    let _ = app.emit("ssh-connected", ());
    Ok(())
}

/// Send terminal input to the SSH session.
#[tauri::command]
async fn ssh_write(state: tauri::State<'_, AppState>, data: String) -> Result<(), String> {
    let ssh = state.ssh.lock().map_err(|e| e.to_string())?;
    if let Some(ref tx) = ssh.control_tx {
        tx.send(ControlMsg::Data(data.into_bytes()))
            .map_err(|_| "Connection closed".to_string())
    } else {
        Err("Not connected".into())
    }
}

/// Resize the remote PTY.
#[tauri::command]
async fn ssh_resize(
    state: tauri::State<'_, AppState>,
    cols: u32,
    rows: u32,
    _width_px: u32,
    _height_px: u32,
) -> Result<(), String> {
    let ssh = state.ssh.lock().map_err(|e| e.to_string())?;
    if let Some(ref tx) = ssh.control_tx {
        tx.send(ControlMsg::Resize { cols, rows })
            .map_err(|_| "Connection closed".to_string())
    } else {
        Err("Not connected".into())
    }
}

/// Disconnect the active SSH session.
#[tauri::command]
async fn ssh_disconnect(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let mut ssh = state.ssh.lock().map_err(|e| e.to_string())?;
    ssh.control_tx.take();
    ssh.handle.take();
    if let Some(task) = ssh.reader_task.take() {
        task.abort();
    }
    let _ = app.emit("ssh-closed", ());
    Ok(())
}

/// Check whether an SSH session is currently active.
#[tauri::command]
async fn ssh_is_connected(state: tauri::State<'_, AppState>) -> Result<bool, String> {
    let ssh = state.ssh.lock().map_err(|e| e.to_string())?;
    Ok(ssh.handle.is_some())
}

// ── Entry point ─────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(AppState {
            ssh: Mutex::new(SshState {
                handle: None,
                control_tx: None,
                reader_task: None,
            }),
        })
        .invoke_handler(tauri::generate_handler![
            ssh_connect,
            ssh_write,
            ssh_resize,
            ssh_disconnect,
            ssh_is_connected,
        ]);

    #[cfg(target_os = "windows")]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}));

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
