// ── Application state and shared types ──────────────────────────────────

use russh::client;
use std::sync::Mutex;

use crate::handler::ClientHandler;

/// Connection parameters sent from the frontend.
#[derive(Debug, serde::Deserialize)]
pub(crate) struct ConnectParams {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: Option<String>,
    pub private_key: Option<String>,
    /// Optional remote command to execute instead of the default shell.
    pub command: Option<String>,
    pub cols: u32,
    pub rows: u32,
}

/// Messages sent from Tauri commands into the single background task
/// that owns the SSH channel.
pub(crate) enum ControlMsg {
    /// Write terminal input to the SSH channel.
    Data(Vec<u8>),
    /// Resize the PTY (not yet implemented for ChannelStream).
    #[allow(dead_code)]
    Resize { cols: u32, rows: u32 },
}

/// Per-connection mutable state, protected by a std::sync::Mutex.
pub(crate) struct SshState {
    /// The Russh client handle. Dropping it closes the SSH connection.
    pub handle: Option<client::Handle<ClientHandler>>,
    /// Sender side of the control channel (Tauri commands → background task).
    pub control_tx: Option<tokio::sync::mpsc::UnboundedSender<ControlMsg>>,
    /// JoinHandle for the background read/write task.
    pub reader_task: Option<tokio::task::JoinHandle<()>>,
}

/// Tauri managed state.
pub(crate) struct AppState {
    pub ssh: Mutex<SshState>,
}
