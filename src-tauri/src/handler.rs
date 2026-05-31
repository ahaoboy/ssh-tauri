// ── SSH client handler ──────────────────────────────────────────────────

use russh::client::Handler;
use russh::keys::ssh_key;
use tracing::debug;

/// Minimal SSH client handler.
/// Accepts all server host keys (like StrictHostKeyChecking=no).
pub(crate) struct ClientHandler;

impl Handler for ClientHandler {
    type Error = russh::Error;

    /// Accept all server host keys (equivalent to StrictHostKeyChecking=no).
    async fn check_server_key(
        &mut self,
        _server_public_key: &ssh_key::PublicKey,
    ) -> Result<bool, Self::Error> {
        debug!("Accepting server host key");
        Ok(true)
    }
}
