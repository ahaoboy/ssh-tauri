// ── Shared types for the SSH client application ─────────────────────────────

/** Available authentication methods. */
export type AuthMethod = "password" | "privateKey";

/** Current state of the SSH connection. */
export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

/** Parameters sent to the Rust backend to establish an SSH connection. */
export interface ConnectParams {
  host: string;
  port: number;
  username: string;
  password?: string;
  private_key?: string;
  cols: number;
  rows: number;
}

/** A saved connection configuration, identified by a unique id. */
export interface SavedConfig {
  id: string;
  label: string;
  host: string;
  port: string;
  username: string;
  authMethod: AuthMethod;
  password: string;
  privateKey: string;
}
