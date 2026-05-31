// ── Application error type ──────────────────────────────────────────────

/// All application errors, using `thiserror` for ergonomic `Display` impls.
#[derive(Debug, thiserror::Error)]
pub(crate) enum AppError {
    #[error("SSH connection failed: {0}")]
    Connection(#[source] russh::Error),

    #[error("Authentication failed: {0}")]
    Auth(String),

    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Internal state lock poisoned")]
    Lock,

    #[error("{0}")]
    Other(String),
}

impl From<russh::Error> for AppError {
    fn from(e: russh::Error) -> Self {
        AppError::Connection(e)
    }
}

/// Tauri commands return `Result<(), String>`, so we convert.
impl From<AppError> for String {
    fn from(e: AppError) -> String {
        e.to_string()
    }
}
