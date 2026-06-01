import { platform } from "@tauri-apps/plugin-os"

// ── Platform detection utility ─────────────────────────────────────────

/**
 * Detect whether the app is running on Android (Tauri or browser).
 * Tauri on Android sets the user-agent to include "Android".
 */
export function isAndroid(): boolean {
  return platform() === "android";
}
