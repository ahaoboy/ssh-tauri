import { platform } from "@tauri-apps/plugin-os";

// ── Platform detection utility ─────────────────────────────────────────

/**
 * Detect whether the app is running on Android.
 * Uses Tauri's OS plugin when available; falls back to user-agent sniffing
 * in browser dev mode where Tauri APIs aren't present.
 */
export function isAndroid(): boolean {
  try {
    return platform() === "android";
  } catch {
    console.warn("Tauri OS plugin unavailable, falling back to user-agent");
    return /android/i.test(navigator.userAgent);
  }
}
