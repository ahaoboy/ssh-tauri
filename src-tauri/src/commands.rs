// ── Tauri commands ──────────────────────────────────────────────────────

use russh::client;
use russh::keys::{load_secret_key, PrivateKeyWithHashAlg};
use std::sync::Arc;
use tauri::Emitter;
use tracing::{debug, info, warn};

use crate::error::AppError;
use crate::handler::ClientHandler;
use crate::io_loop::ssh_io_loop;
use crate::state::{AppState, ConnectParams, ControlMsg};

/// Connect to an SSH server and start an interactive shell.
#[tauri::command]
pub(crate) async fn ssh_connect(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    params: ConnectParams,
) -> Result<(), String> {
    info!(
        "Connecting to {}@{}:{} (auth: {}, cmd: {}, cols: {}x{})",
        params.username,
        params.host,
        params.port,
        if params.private_key.is_some() { "key" } else { "password" },
        params.command.as_deref().unwrap_or("(shell)"),
        params.cols,
        params.rows,
    );

    // ── Tear down any existing connection ──────────────────────
    {
        let mut ssh = state.ssh.lock().map_err(|_| AppError::Lock)?;
        if ssh.handle.is_some() {
            info!("Closing existing SSH connection");
        }
        ssh.control_tx.take();
        ssh.handle.take();
        if let Some(task) = ssh.reader_task.take() {
            task.abort();
        }
    }

    // ── Connect ───────────────────────────────────────────────
    let config = client::Config::default();
    let handler = ClientHandler;

    debug!("Received params: host={}, port={}, user={}, has_key={}, has_pass={}, command={:?}",
        params.host, params.port, params.username,
        params.private_key.is_some(), params.password.is_some(),
        params.command);
    let mut handle = client::connect(
        Arc::new(config),
        (params.host.as_str(), params.port),
        handler,
    )
    .await
    .map_err(AppError::Connection)?;
    info!("TCP connection established, authenticating…");

    // ── Authenticate ──────────────────────────────────────────
    let auth_result = if let Some(ref key_str) = params.private_key {
        if key_str.trim().is_empty() {
            warn!("Empty private key provided");
            return Err(AppError::Other("Private key is empty".into()).into());
        }
        debug!("Authenticating with private key…");
        let tmp_dir = std::env::temp_dir();
        let key_path = tmp_dir.join(format!("ssh-tauri-key-{}", std::process::id()));
        std::fs::write(&key_path, key_str).map_err(AppError::Io)?;

        let result = async {
            let key_pair = load_secret_key(&key_path, None)
                .map_err(|e| AppError::Auth(format!("Invalid private key: {e}")))?;
            let key_with_alg = PrivateKeyWithHashAlg::new(Arc::new(key_pair), None);
            handle
                .authenticate_publickey(&params.username, key_with_alg)
                .await
                .map_err(|e| AppError::Auth(format!("Authentication failed: {e}")))
        }
        .await;

        let _ = std::fs::remove_file(&key_path).inspect_err(|e| {
            warn!("Failed to remove temp key file: {e}");
        });
        result?
    } else if let Some(ref password) = params.password {
        debug!("Authenticating with password…");
        handle
            .authenticate_password(&params.username, password)
            .await
            .map_err(|e| AppError::Auth(format!("Authentication failed: {e}")))?
    } else {
        warn!("No authentication method provided");
        return Err(AppError::Other("No authentication method provided".into()).into());
    };

    if !auth_result.success() {
        warn!("Authentication rejected by server");
        return Err(AppError::Auth("Authentication rejected by server".into()).into());
    }
    info!("Authentication succeeded");

    // ── Open channel + PTY + shell ────────────────────────────
    debug!("Opening session channel…");
    let channel = handle
        .channel_open_session()
        .await
        .map_err(|e| AppError::Other(format!("Failed to open channel: {e}")))?;

    debug!("Requesting PTY ({}x{})", params.cols, params.rows);
    channel
        .request_pty(false, "xterm-256color", params.cols, params.rows, 0, 0, &[])
        .await
        .map_err(|e| AppError::Other(format!("Failed to request PTY: {e}")))?;

    if let Some(ref cmd) = params.command {
        info!("Executing remote command: {cmd}");
        channel
            .exec(true, cmd.as_bytes().to_vec())
            .await
            .map_err(|e| AppError::Other(format!("Failed to execute command: {e}")))?;
    } else {
        debug!("Starting interactive shell");
        channel
            .request_shell(false)
            .await
            .map_err(|e| AppError::Other(format!("Failed to start shell: {e}")))?;
    }

    // ── Spawn background I/O task ─────────────────────────────
    let (control_tx, control_rx) = tokio::sync::mpsc::unbounded_channel();
    let app_clone = app.clone();
    let reader_task = tokio::spawn(ssh_io_loop(channel, control_rx, app_clone));

    // ── Store state ───────────────────────────────────────────
    {
        let mut ssh = state.ssh.lock().map_err(|_| AppError::Lock)?;
        ssh.handle = Some(handle);
        ssh.control_tx = Some(control_tx);
        ssh.reader_task = Some(reader_task);
    }

    if let Err(e) = app.emit("ssh-connected", ()) {
        warn!("Failed to emit ssh-connected event: {e}");
    }
    info!("SSH session ready");
    Ok(())
}

/// Send terminal input to the SSH session.
#[tauri::command]
pub(crate) async fn ssh_write(
    state: tauri::State<'_, AppState>,
    data: String,
) -> Result<(), String> {
    let ssh = state.ssh.lock().map_err(|_| AppError::Lock)?;
    if let Some(ref tx) = ssh.control_tx {
        tx.send(ControlMsg::Data(data.into_bytes()))
            .map_err(|_| AppError::Other("Connection closed".into()).into())
    } else {
        Err(AppError::Other("Not connected".into()).into())
    }
}

/// Resize the remote PTY.
#[tauri::command]
pub(crate) async fn ssh_resize(
    state: tauri::State<'_, AppState>,
    cols: u32,
    rows: u32,
    _width_px: u32,
    _height_px: u32,
) -> Result<(), String> {
    let ssh = state.ssh.lock().map_err(|_| AppError::Lock)?;
    if let Some(ref tx) = ssh.control_tx {
        tx.send(ControlMsg::Resize { cols, rows })
            .map_err(|_| AppError::Other("Connection closed".into()).into())
    } else {
        Err(AppError::Other("Not connected".into()).into())
    }
}

/// Disconnect the active SSH session.
#[tauri::command]
pub(crate) async fn ssh_disconnect(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    info!("Disconnecting SSH session");
    let mut ssh = state.ssh.lock().map_err(|_| AppError::Lock)?;
    ssh.control_tx.take();
    ssh.handle.take();
    if let Some(task) = ssh.reader_task.take() {
        task.abort();
    }
    if let Err(e) = app.emit("ssh-closed", ()) {
        warn!("Failed to emit ssh-closed event: {e}");
    }
    debug!("SSH session fully disconnected");
    Ok(())
}

/// Check whether an SSH session is currently active.
#[tauri::command]
pub(crate) async fn ssh_is_connected(
    state: tauri::State<'_, AppState>,
) -> Result<bool, String> {
    let ssh = state.ssh.lock().map_err(|_| AppError::Lock)?;
    Ok(ssh.handle.is_some())
}
