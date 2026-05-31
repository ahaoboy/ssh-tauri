// ── Module declarations ──────────────────────────────────────────────────

mod commands;
mod error;
mod handler;
mod io_loop;
mod state;

use commands::{
    ssh_connect, ssh_disconnect, ssh_is_connected, ssh_resize, ssh_write,
};
use state::{AppState, SshState};
use std::sync::Mutex;
use tracing::info;

// ── Entry point ───────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize tracing: respects RUST_LOG env var (defaults to "info").
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    info!("Starting SSH Tauri application");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            ssh: Mutex::new(SshState {
                handle: None,
                control_tx: None,
                reader_task: None,
            }),
        })
        .invoke_handler(tauri::generate_handler![
            ssh_connect,
            ssh_write,
            ssh_resize,
            ssh_disconnect,
            ssh_is_connected,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
