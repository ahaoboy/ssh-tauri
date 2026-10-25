// ── Thin wrapper over the `sssh` crate for Tauri integration ────────────

use serde::Deserialize;
pub use sssh::Error as SshError;
pub use sssh::EventSink as SshEventSink;
pub use sssh::Session as SshSession;

/// Total wall-clock budget for the connect + auth + shell startup sequence.
pub(crate) const CONNECT_TIMEOUT_SECS: u64 = 20;

/// Tauri-compatible connection parameters (serde-friendly, camelCase from JS).
#[derive(Debug, Clone, Deserialize)]
pub struct ConnectParams {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: Option<String>,
    #[serde(rename = "privateKey")]
    pub private_key: Option<String>,
    /// Optional remote command or shell to execute instead of the default
    /// login shell (e.g. `/jffs/fish`). When set, the SSH session runs
    /// `exec(<command>)` rather than `request_shell`.
    pub command: Option<String>,
    /// Terminal columns (default: 80).
    #[serde(default = "default_cols")]
    pub cols: u32,
    /// Terminal rows (default: 24).
    #[serde(default = "default_rows")]
    pub rows: u32,
}

fn default_cols() -> u32 {
    80
}
fn default_rows() -> u32 {
    24
}

impl From<ConnectParams> for sssh::Config {
    fn from(p: ConnectParams) -> Self {
        Self {
            host: p.host,
            port: p.port,
            username: p.username,
            password: p.password,
            private_key: p.private_key,
            command: p.command,
            cols: p.cols,
            rows: p.rows,
            // Also let sssh apply its own TCP-connect timeout.
            timeout_secs: Some(CONNECT_TIMEOUT_SECS),
            host_key_verifier: None,
        }
    }
}
