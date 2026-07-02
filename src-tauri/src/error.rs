// ── Application error type ──────────────────────────────────────────────

use crate::ssh::SshError;

/// Application-level errors.
///
/// SSH-specific failures are forwarded from [`SshError`]; `Lock` and `Other`
/// cover app-level concerns (state access, pre-condition checks).
#[derive(Debug, thiserror::Error)]
pub(crate) enum AppError {
    #[error(transparent)]
    Ssh(#[from] SshError),

    #[error("Internal state lock poisoned")]
    Lock,

    #[error("{0}")]
    Other(String),
}

/// Tauri commands return `Result<T, String>`, so we convert.
impl From<AppError> for String {
    fn from(e: AppError) -> String {
        e.to_string()
    }
}
