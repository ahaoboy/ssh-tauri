import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import "./App.css";

// ── Types ───────────────────────────────────────────────────────────────────

type AuthMethod = "password" | "privateKey";
type ConnectionState = "disconnected" | "connecting" | "connected" | "error";

interface ConnectParams {
  host: string;
  port: number;
  username: string;
  password?: string;
  private_key?: string;
  cols: number;
  rows: number;
}

// ── Private key normalization ───────────────────────────────────────────────

/// Regex to match any PEM boundary line — both BEGIN and END markers.
const PEM_BOUNDARY_RE = /^-{2,}(?:BEGIN|END)\s.{1,70}PRIVATE\sKEY-{2,}\s*/gim;

/// Normalize a pasted private key:
/// 1. Strip leading/trailing whitespace from the whole input
/// 2. Strip PEM boundary lines (-----BEGIN ...----- / -----END ...-----)
/// 3. Remove all whitespace from the base64 body
/// 4. Re-wrap at 64 characters per line
/// 5. Re-wrap with "-----BEGIN OPENSSH PRIVATE KEY-----" / "-----END OPENSSH PRIVATE KEY-----"
function normalizePrivateKey(raw: string): string {
  // Step 1: trim outer whitespace and normalize line endings
  let text = raw.trim().replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Step 2: detect the key type from the header, default to OPENSSH
  const firstLine = text.split("\n")[0] || "";
  const headerMatch = firstLine.match(
    /-{2,}BEGIN\s(.{1,70}PRIVATE\sKEY)-{2,}/i,
  );
  const keyType = headerMatch ? headerMatch[1] : "OPENSSH PRIVATE KEY";

  // Step 3: strip ALL PEM boundary lines (both BEGIN and END)
  const body = text
    .replace(PEM_BOUNDARY_RE, "")
    .replace(/\s+/g, ""); // remove all whitespace from base64 content

  if (body.length === 0) return "";

  // Only allow valid base64 characters
  if (!/^[A-Za-z0-9+/=]+$/.test(body)) return "";

  // Step 4: re-wrap base64 at 64 chars per line
  const wrapped = body.match(/.{1,64}/g)?.join("\n") ?? body;

  // Step 5: reconstruct with proper PEM envelope
  return `-----BEGIN ${keyType}-----\n${wrapped}\n-----END ${keyType}-----`;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function App() {
  // Form state
  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [username, setUsername] = useState("");
  const [authMethod, setAuthMethod] = useState<AuthMethod>("password");
  const [password, setPassword] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected");
  const [error, setError] = useState("");

  // Terminal refs
  const terminalRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const eventUnlistenRef = useRef<(() => Promise<void>) | null>(null);

  // ── Terminal initialization ───────────────────────────────────────────────

  const initTerminal = useCallback(() => {
    if (termRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
      theme: {
        background: "#0d1117",
        foreground: "#c9d1d9",
        cursor: "#58a6ff",
        cursorAccent: "#0d1117",
        selectionBackground: "#264f78",
        black: "#484f58",
        red: "#ff7b72",
        green: "#3fb950",
        yellow: "#d29922",
        blue: "#58a6ff",
        magenta: "#bc8cff",
        cyan: "#39c5cf",
        white: "#b1bac4",
        brightBlack: "#6e7681",
        brightRed: "#ffa198",
        brightGreen: "#56d364",
        brightYellow: "#e3b341",
        brightBlue: "#79c0ff",
        brightMagenta: "#d2a8ff",
        brightCyan: "#56d4dd",
        brightWhite: "#f0f6fc",
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Handle user input: send to Rust backend
    term.onData((data) => {
      invoke("ssh_write", { data }).catch(() => { });
    });

    return { term, fitAddon };
  }, []);

  // ── Mount terminal into DOM ───────────────────────────────────────────────

  const mountTerminal = useCallback(() => {
    const { term, fitAddon } = initTerminal()!;
    if (terminalRef.current && !term.element?.parentElement) {
      term.open(terminalRef.current);
      fitAddon.fit();

      // Listen for SSH output events from the Rust backend
      const unlistenData = listen<string>("ssh-data", (event) => {
        term.write(event.payload);
      });
      const unlistenClosed = listen<void>("ssh-closed", () => {
        // Connection was closed remotely; the disconnect handler
        // will clean up the terminal.
      });

      // Store cleanup functions
      eventUnlistenRef.current = async () => {
        (await unlistenData)();
        (await unlistenClosed)();
      };
    }
  }, [initTerminal]);

  // ── Connect ───────────────────────────────────────────────────────────────

  const connect = useCallback(async () => {
    if (!host || !username) return;

    setConnectionState("connecting");
    setError("");

    try {
      const params: ConnectParams = {
        host,
        port: parseInt(port, 10) || 22,
        username,
        cols: 80,
        rows: 24,
      };

      if (authMethod === "privateKey" && privateKey) {
        params.private_key = normalizePrivateKey(privateKey);
      } else if (password) {
        params.password = password;
      }

      await invoke("ssh_connect", { params });
      setConnectionState("connected");
      // Save username for convenience
      localStorage.setItem("ssh:username", username);
    } catch (e) {
      setError(String(e));
      setConnectionState("error");
    }
  }, [host, port, username, authMethod, password, privateKey]);

  // ── Disconnect ────────────────────────────────────────────────────────────

  const disconnect = useCallback(async () => {
    // Unsubscribe from events
    if (eventUnlistenRef.current) {
      await eventUnlistenRef.current();
      eventUnlistenRef.current = null;
    }

    try {
      await invoke("ssh_disconnect");
    } catch {
      // Ignore errors during disconnect
    }

    // Dispose terminal
    termRef.current?.dispose();
    termRef.current = null;
    fitAddonRef.current = null;

    setConnectionState("disconnected");
  }, []);

  // ── Mount terminal when connected ─────────────────────────────────────────

  useEffect(() => {
    if (connectionState === "connected") {
      // Small delay to let the DOM render the terminal container
      const timer = setTimeout(mountTerminal, 50);
      return () => clearTimeout(timer);
    }
  }, [connectionState, mountTerminal]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (eventUnlistenRef.current) {
        eventUnlistenRef.current();
      }
      termRef.current?.dispose();
    };
  }, []);

  // ── Handle window resize ──────────────────────────────────────────────────

  useEffect(() => {
    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [connectionState]);

  // ── Handle form submit ────────────────────────────────────────────────────

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    connect();
  };

  // ── Render: Connected view (terminal) ─────────────────────────────────────

  if (connectionState === "connected") {
    return (
      <div className="app-shell">
        <header className="terminal-header">
          <div className="terminal-header__info">
            <svg
              className="terminal-header__icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="18" height="12" x="3" y="4" rx="2" />
              <polyline points="8 20 16 20" />
            </svg>
            <span>
              {username}@{host}:{port}
            </span>
          </div>
          <button className="btn btn--ghost btn--sm" onClick={disconnect}>
            <svg
              className="btn__icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" x2="9" y1="12" y2="12" />
            </svg>
            Disconnect
          </button>
        </header>
        <main className="terminal-container">
          <div ref={terminalRef} className="terminal-wrapper" />
        </main>
      </div>
    );
  }

  // ── Render: Login form ────────────────────────────────────────────────────

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Header */}
        <div className="login-header">
          <svg
            className="login-header__icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect width="18" height="12" x="3" y="4" rx="2" />
            <polyline points="8 20 16 20" />
          </svg>
          <h1 className="login-header__title">SSH Client</h1>
          <p className="login-header__subtitle">
            Connect to a remote server via SSH
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="login-form">
          {/* Host + Port row */}
          <div className="form-row form-row--host-port">
            <div className="form-field form-field--host">
              <label className="form-label" htmlFor="host">
                Host
              </label>
              <input
                id="host"
                className="form-input"
                placeholder="192.168.1.1"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                required
              />
            </div>
            <div className="form-field form-field--port">
              <label className="form-label" htmlFor="port">
                Port
              </label>
              <input
                id="port"
                className="form-input"
                type="number"
                value={port}
                onChange={(e) => setPort(e.target.value)}
              />
            </div>
          </div>

          {/* Username */}
          <div className="form-field">
            <label className="form-label" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              className="form-input"
              placeholder="root"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          {/* Auth method */}
          <div className="form-field">
            <label className="form-label">Authentication</label>
            <select
              className="form-select"
              value={authMethod}
              onChange={(e) => setAuthMethod(e.target.value as AuthMethod)}
            >
              <option value="password">Password</option>
              <option value="privateKey">Private Key</option>
            </select>
          </div>

          {/* Password / Private Key */}
          {authMethod === "password" ? (
            <div className="form-field">
              <label className="form-label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                className="form-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          ) : (
            <div className="form-field">
              <label className="form-label" htmlFor="privateKey">
                Private Key
              </label>
              <textarea
                id="privateKey"
                className="form-textarea"
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                onBlur={() => {
                  if (privateKey.trim()) {
                    setPrivateKey(normalizePrivateKey(privateKey));
                  }
                }}
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----\n..."
                rows={6}
              />
            </div>
          )}

          {/* Error message */}
          {error && <p className="form-error">{error}</p>}

          {/* Submit button */}
          <button
            type="submit"
            className="btn btn--primary btn--full"
            disabled={connectionState === "connecting" || !host || !username}
          >
            {connectionState === "connecting" ? (
              <>
                <span className="spinner" />
                Connecting...
              </>
            ) : (
              <>
                <svg
                  className="btn__icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect width="18" height="12" x="3" y="4" rx="2" />
                  <polyline points="8 20 16 20" />
                </svg>
                Connect
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

