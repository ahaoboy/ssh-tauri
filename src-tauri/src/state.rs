// ── Application state ───────────────────────────────────────────────────

use std::sync::Mutex;

use crate::ssh::SshSession;

/// Tauri managed state: holds the active SSH session, if any.
pub(crate) struct AppState {
    pub ssh: Mutex<Option<SshSession>>,
}
