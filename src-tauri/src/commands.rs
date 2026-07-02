// ── Tauri commands (thin wrappers over the `ssh` module) ────────────────

use tauri::Emitter;
use tracing::warn;

use crate::error::AppError;
use crate::ssh::{ConnectParams, SshEventSink, SshSession};
use crate::state::AppState;

// ── Tauri ↔ SSH bridge ──────────────────────────────────────────────────

/// Adapter that forwards [`SshEventSink`] calls to Tauri events.
#[derive(Clone)]
struct TauriSink {
    app: tauri::AppHandle,
}

impl SshEventSink for TauriSink {
    fn on_connected(&self) {
        if let Err(e) = self.app.emit("ssh-connected", ()) {
            warn!("Failed to emit ssh-connected event: {e}");
        }
    }

    fn on_data(&self, data: String) {
        if let Err(e) = self.app.emit("ssh-data", data) {
            warn!("Failed to emit ssh-data event: {e}");
        }
    }

    fn on_closed(&self) {
        if let Err(e) = self.app.emit("ssh-closed", ()) {
            warn!("Failed to emit ssh-closed event: {e}");
        }
    }
}

// ── Commands ────────────────────────────────────────────────────────────

/// Connect to an SSH server and start an interactive shell.
#[tauri::command]
pub(crate) async fn ssh_connect(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    params: ConnectParams,
) -> Result<(), String> {
    // Tear down any existing connection (silent — no `on_closed` emit).
    {
        let mut ssh = state.ssh.lock().map_err(|_| AppError::Lock)?;
        let _ = ssh.take();
    }

    let session = SshSession::connect(params.into(), TauriSink { app })
        .await
        .map_err(AppError::from)?;

    {
        let mut ssh = state.ssh.lock().map_err(|_| AppError::Lock)?;
        *ssh = Some(session);
    }

    Ok(())
}

/// Send terminal input to the SSH session.
#[tauri::command]
pub(crate) async fn ssh_write(
    state: tauri::State<'_, AppState>,
    data: String,
) -> Result<(), String> {
    let ssh = state.ssh.lock().map_err(|_| AppError::Lock)?;
    let session = ssh
        .as_ref()
        .ok_or_else(|| AppError::Other("Not connected".into()))?;
    session.write(data).map_err(AppError::from)?;
    Ok(())
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
    let session = ssh
        .as_ref()
        .ok_or_else(|| AppError::Other("Not connected".into()))?;
    session.resize(cols, rows).map_err(AppError::from)?;
    Ok(())
}

/// Disconnect the active SSH session.
#[tauri::command]
pub(crate) async fn ssh_disconnect(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let mut ssh = state.ssh.lock().map_err(|_| AppError::Lock)?;
    if let Some(mut s) = ssh.take() {
        s.disconnect();
    }
    Ok(())
}

/// Check whether an SSH session is currently active.
#[tauri::command]
pub(crate) async fn ssh_is_connected(
    state: tauri::State<'_, AppState>,
) -> Result<bool, String> {
    let ssh = state.ssh.lock().map_err(|_| AppError::Lock)?;
    Ok(ssh.as_ref().map(|s| s.is_connected()).unwrap_or(false))
}
