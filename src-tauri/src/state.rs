// ── Application state ───────────────────────────────────────────────────

use std::sync::Mutex;

use tokio::sync::watch;

use crate::ssh::SshSession;

/// Tauri managed state: holds the active SSH session, if any.
pub(crate) struct AppState {
    pub ssh: Mutex<Option<SshSession>>,
    pub connect_cancel: ConnectCancel,
}

/// Shared cancellation signal for an in-flight SSH connection attempt.
///
/// `ssh_connect` records the current generation; `ssh_cancel_connect` bumps
/// it. The cancelled future is dropped, which closes the TCP socket.
#[derive(Clone)]
pub(crate) struct ConnectCancel {
    generation: watch::Sender<u64>,
}

impl Default for ConnectCancel {
    fn default() -> Self {
        let (generation, _) = watch::channel(0);
        Self { generation }
    }
}

impl ConnectCancel {
    pub fn subscribe(&self) -> (u64, watch::Receiver<u64>) {
        let rx = self.generation.subscribe();
        let generation = *rx.borrow();
        (generation, rx)
    }

    pub fn cancel_all(&self) {
        let next = self.generation.borrow().wrapping_add(1);
        // `send` fails when no receiver is alive; `send_replace` always
        // updates the generation so later attempts start from the new value.
        self.generation.send_replace(next);
    }
}

/// Resolves when `ssh_cancel_connect` is invoked after the given generation.
pub(crate) async fn wait_cancelled(generation: u64, mut rx: watch::Receiver<u64>) {
    loop {
        if *rx.borrow() != generation {
            return;
        }
        if rx.changed().await.is_err() {
            return;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[tokio::test]
    async fn cancel_wakes_in_flight_waiter() {
        let cancel = ConnectCancel::default();
        let (generation, rx) = cancel.subscribe();
        let waiter = tokio::spawn(wait_cancelled(generation, rx));

        cancel.cancel_all();

        tokio::time::timeout(Duration::from_secs(1), waiter)
            .await
            .expect("cancellation should wake the waiter")
            .expect("waiter task should not panic");
    }

    #[tokio::test]
    async fn subscription_after_cancel_starts_fresh() {
        let cancel = ConnectCancel::default();
        let before = *cancel.generation.borrow();
        cancel.cancel_all();
        assert_eq!(*cancel.generation.borrow(), before.wrapping_add(1));

        let (generation, rx) = cancel.subscribe();
        tokio::time::timeout(Duration::from_millis(100), wait_cancelled(generation, rx))
            .await
            .expect_err("a new subscription must not inherit an earlier cancellation");
    }
}
