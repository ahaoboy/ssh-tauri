// ── Terminal view (connected state) ──────────────────────────────────────

import { useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import {
  AppBar,
  Box,
  Button,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { Terminal as TerminalIcon, Logout } from "@mui/icons-material";

// ── Terminal theme ──────────────────────────────────────────────────────

/** GitHub-dark-inspired xterm.js color theme. */
const TERMINAL_THEME = {
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
};

// ── Props ────────────────────────────────────────────────────────────────

interface TerminalViewProps {
  username: string;
  host: string;
  port: string;
  onDisconnect: () => void;
}

// ── Component ────────────────────────────────────────────────────────────

export default function TerminalView({
  username,
  host,
  port,
  onDisconnect,
}: TerminalViewProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const terminalRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const eventUnlistenRef = useRef<(() => Promise<void>) | null>(null);

  // ── Initialize terminal instance (once) ─────────────────────────────
  const initTerminal = useCallback(() => {
    if (termRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: isMobile ? 12 : 14,
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
      theme: TERMINAL_THEME,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Forward user keystrokes to the Rust backend
    term.onData((data) => {
      invoke("ssh_write", { data }).catch(() => { });
    });
  }, [isMobile]);

  // ── Mount terminal into DOM and subscribe to events ─────────────────
  useEffect(() => {
    initTerminal();

    const term = termRef.current;
    const fitAddon = fitAddonRef.current;
    if (!term || !fitAddon || !terminalRef.current) return;

    // Avoid double-mounting
    if (term.element?.parentElement) return;

    term.open(terminalRef.current);
    fitAddon.fit();

    // Subscribe to data and close events from Rust
    const unlistenData = listen<string>("ssh-data", (event) => {
      term.write(event.payload);
    });
    const unlistenClosed = listen<void>("ssh-closed", () => {
      // Handled by App-level state
    });

    eventUnlistenRef.current = async () => {
      (await unlistenData)();
      (await unlistenClosed)();
    };

    // ── Resize observer ────────────────────────────────────────────
    const observer = new ResizeObserver(() => {
      fitAddon.fit();
    });
    observer.observe(terminalRef.current);

    return () => {
      observer.disconnect();
      if (eventUnlistenRef.current) {
        eventUnlistenRef.current();
        eventUnlistenRef.current = null;
      }
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
    // We intentionally only run this effect once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100dvh",
        bgcolor: TERMINAL_THEME.background,
      }}
    >
      {/* ── Header bar ──────────────────────────────── */}
      <AppBar
        position="static"
        color="transparent"
        elevation={0}
        sx={{
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: "rgba(22, 27, 34, 0.95)",
          backdropFilter: "blur(8px)",
        }}
      >
        <Toolbar variant="dense" sx={{ gap: 1 }}>
          <TerminalIcon sx={{ fontSize: 18, color: "primary.main" }} />
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ flex: 1, fontFamily: "monospace" }}
          >
            {username}@{host}:{port}
          </Typography>
          <Button
            size="small"
            color="error"
            variant="outlined"
            startIcon={<Logout />}
            onClick={onDisconnect}
          >
            {isMobile ? "" : "Disconnect"}
          </Button>
        </Toolbar>
      </AppBar>

      {/* ── Terminal container ──────────────────────── */}
      <Box
        ref={terminalRef}
        sx={{
          flex: 1,
          p: 1,
          overflow: "hidden",
          "& .xterm": {
            height: "100%",
          },
          "& .xterm-viewport::-webkit-scrollbar": {
            width: 8,
          },
          "& .xterm-viewport::-webkit-scrollbar-track": {
            background: "transparent",
          },
          "& .xterm-viewport::-webkit-scrollbar-thumb": {
            background: "#30363d",
            borderRadius: 4,
          },
        }}
      />
    </Box>
  );
}
