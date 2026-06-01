// ── Background SSH I/O task ─────────────────────────────────────────────

use russh::client;
use russh::Channel;
use tauri::Emitter;
use tracing::{debug, error, info, warn};

use crate::state::ControlMsg;

/// Runs in a tokio task: reads from the SSH channel and emits `ssh-data`
/// events; receives `ControlMsg` from the mpsc channel to write data
/// or resize the terminal.
pub(crate) async fn ssh_io_loop(
    channel: Channel<client::Msg>,
    mut control_rx: tokio::sync::mpsc::UnboundedReceiver<ControlMsg>,
    app: tauri::AppHandle,
) {
    info!("SSH I/O loop started");
    let mut stream = channel.into_stream();
    let mut read_buf = [0u8; 8192];

    loop {
        tokio::select! {
            // ── Read from SSH → emit to frontend ────────────────
            result = tokio::io::AsyncReadExt::read(&mut stream, &mut read_buf) => {
                match result {
                    Ok(0) => {
                        info!("SSH channel closed (EOF)");
                        if let Err(e) = app.emit("ssh-data",
                            "\r\n\x1b[33mConnection closed by remote host.\x1b[0m\r\n") {
                            warn!("Failed to emit ssh-data event: {e}");
                        }
                        if let Err(e) = app.emit("ssh-closed", ()) {
                            warn!("Failed to emit ssh-closed event: {e}");
                        }
                        break;
                    }
                    Ok(n) => {
                        let text = String::from_utf8_lossy(&read_buf[..n]).to_string();
                        if let Err(e) = app.emit("ssh-data", text) {
                            warn!("Failed to emit ssh-data event: {e}");
                        }
                    }
                    Err(e) => {
                        error!(%e, "Read error in SSH I/O loop");
                        if let Err(e2) = app.emit("ssh-data",
                            format!("\r\n\x1b[31mRead error: {}\x1b[0m\r\n", e)) {
                            warn!("Failed to emit ssh-data event: {e2}");
                        }
                        if let Err(e3) = app.emit("ssh-closed", ()) {
                            warn!("Failed to emit ssh-closed event: {e3}");
                        }
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
                            error!(%e, "Write error in SSH I/O loop");
                            if let Err(e2) = app.emit("ssh-data",
                                format!("\r\n\x1b[31mWrite error: {}\x1b[0m\r\n", e)) {
                                warn!("Failed to emit ssh-data event: {e2}");
                            }
                            break;
                        }
                    }
                    Some(ControlMsg::Resize { cols: _, rows: _ }) => {
                        // PTY resize via ChannelStream is not supported;
                        // most remote shells adapt to SIGWINCH automatically.
                    }
                    None => {
                        debug!("Control channel closed, shutting down I/O loop");
                        break;
                    }
                }
            }
        }
    }
    info!("SSH I/O loop ended");
}
