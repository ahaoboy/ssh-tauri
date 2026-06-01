// ── Terminal view (connected state) ──────────────────────────────────────

import { useRef, useEffect, useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import {
  AppBar,
  Box,
  Button,
  IconButton,
  Stack,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  Terminal as TerminalIcon,
  Logout,
  KeyboardArrowUp,
  KeyboardArrowDown,
  KeyboardArrowLeft,
  KeyboardArrowRight,
  Tab,
  BackspaceOutlined,
  KeyboardReturn,
  ContentCopy,
  ContentPaste,
  ScreenRotation,
  KeyboardDoubleArrowDown,
} from "@mui/icons-material";

// ── Terminal theme ──────────────────────────────────────────────────────

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

// ── Virtual key codes ───────────────────────────────────────────────────

/** Map button IDs to raw byte sequences sent over SSH. */
const KEY_SEQUENCES: Record<string, string> = {
  arrowUp: "\x1b[A",
  arrowDown: "\x1b[B",
  arrowRight: "\x1b[C",
  arrowLeft: "\x1b[D",
  tab: "\t",
  delete: "\x7f",
  enter: "\r",
  ctrlC: "\x03",
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
  const [toolbarOpen, setToolbarOpen] = useState(false);

  const terminalRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const eventUnlistenRef = useRef<(() => Promise<void>) | null>(null);

  // ── Helper: send raw bytes to the SSH session ──────────────────────
  const sendKey = useCallback((key: string) => {
    invoke("ssh_write", { data: key }).catch(() => { });
  }, []);

  /** Send a named virtual key sequence. */
  const handleKeyPress = useCallback(
    (id: string) => {
      const seq = KEY_SEQUENCES[id];
      if (seq) sendKey(seq);
    },
    [sendKey],
  );

  /** Paste clipboard content into the terminal. */
  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) sendKey(text);
    } catch {
      // Clipboard API may not be available
    }
  }, [sendKey]);

  /** Toggle between portrait and landscape orientation. */
  const handleToggleOrientation = useCallback(async () => {
    try {
      const current = screen.orientation?.type ?? "";
      if (current.startsWith("portrait")) {
        await (screen.orientation as any).lock?.("landscape").catch(() => { });
      } else {
        await (screen.orientation as any).lock?.("portrait").catch(() => { });
      }
    } catch {
      // Orientation lock not supported
    }
  }, []);

  // ── Initialize terminal instance (once) ──────────────────────────
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

    term.onData((data) => {
      invoke("ssh_write", { data }).catch(() => { });
    });
  }, [isMobile]);

  // ── Mount terminal into DOM and subscribe to events ──────────────
  useEffect(() => {
    initTerminal();

    const term = termRef.current;
    const fitAddon = fitAddonRef.current;
    if (!term || !fitAddon || !terminalRef.current) return;

    if (term.element?.parentElement) return;

    term.open(terminalRef.current);
    fitAddon.fit();

    const unlistenData = listen<string>("ssh-data", (event) => {
      term.write(event.payload);
    });
    const unlistenClosed = listen<void>("ssh-closed", () => { });

    eventUnlistenRef.current = async () => {
      (await unlistenData)();
      (await unlistenClosed)();
    };

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Render ───────────────────────────────────────────────────────
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100dvh",
        bgcolor: TERMINAL_THEME.background,
        pt: "var(--safe-area-top)",
        pb: "var(--safe-area-bottom)",
      }}
    >
      {/* ── Header bar ─────────────────────────────── */}
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
        <Toolbar variant="dense" sx={{ gap: 0.5 }}>
          <TerminalIcon sx={{ fontSize: 18, color: "primary.main" }} />
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ flex: 1, fontFamily: "monospace", ml: 0.5 }}
          >
            {username}@{host}:{port}
          </Typography>

          {/* Orientation toggle */}
          <IconButton
            size="small"
            color="inherit"
            onClick={handleToggleOrientation}
            title="Toggle orientation"
          >
            <ScreenRotation sx={{ fontSize: 18 }} />
          </IconButton>

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

      {/* ── Terminal container ─────────────────────── */}
      <Box
        ref={terminalRef}
        sx={{
          flex: 1,
          p: 1,
          overflow: "hidden",
          "& .xterm": { height: "100%" },
          "& .xterm-viewport::-webkit-scrollbar": { width: 8 },
          "& .xterm-viewport::-webkit-scrollbar-track": {
            background: "transparent",
          },
          "& .xterm-viewport::-webkit-scrollbar-thumb": {
            background: "#30363d",
            borderRadius: 4,
          },
        }}
      />

      {/* ── Mobile virtual keyboard toolbar ────────── */}
      {isMobile && (
        <Box
          sx={{
            borderTop: 1,
            borderColor: "divider",
            bgcolor: "rgba(22, 27, 34, 0.95)",
            backdropFilter: "blur(8px)",
          }}
        >
          {/* Toggle button */}
          <Box sx={{ display: "flex", justifyContent: "center", py: 0.5 }}>
            <IconButton
              size="small"
              onClick={() => setToolbarOpen((v) => !v)}
              sx={{ color: "text.secondary" }}
            >
              <KeyboardDoubleArrowDown
                sx={{
                  fontSize: 18,
                  transform: toolbarOpen ? "rotate(180deg)" : "none",
                  transition: "transform 0.2s",
                }}
              />
            </IconButton>
          </Box>

          {toolbarOpen && (
            <Stack spacing={1} sx={{ px: 1.5, pb: 1.5 }}>
              {/* Row 1: arrows + tab + del */}
              <Stack direction="row" spacing={0.8} sx={{ justifyContent: "center" }}>
                <KeyBtn icon={<KeyboardArrowLeft />} id="arrowLeft" onClick={handleKeyPress} />
                <KeyBtn icon={<KeyboardArrowUp />} id="arrowUp" onClick={handleKeyPress} />
                <KeyBtn icon={<KeyboardArrowDown />} id="arrowDown" onClick={handleKeyPress} />
                <KeyBtn icon={<KeyboardArrowRight />} id="arrowRight" onClick={handleKeyPress} />
                <KeyBtn icon={<Tab />} id="tab" onClick={handleKeyPress} label="Tab" />
                <KeyBtn icon={<BackspaceOutlined />} id="delete" onClick={handleKeyPress} label="Del" />
              </Stack>
              {/* Row 2: enter + ctrl+c + ctrl+v */}
              <Stack direction="row" spacing={0.8} sx={{ justifyContent: "center" }}>
                <KeyBtn
                  icon={<KeyboardReturn />}
                  id="enter"
                  onClick={handleKeyPress}
                  label="Enter"
                  sx={{ flex: 1, maxWidth: 120 }}
                />
                <KeyBtn
                  icon={<ContentCopy />}
                  id="ctrlC"
                  onClick={handleKeyPress}
                  label="C"
                  color="warning"
                />
                <KeyBtn
                  icon={<ContentPaste />}
                  onClick={handlePaste}
                  label="V"
                  color="info"
                />
              </Stack>
            </Stack>
          )}
        </Box>
      )}
    </Box>
  );
}

// ── Virtual key button ──────────────────────────────────────────────────

interface KeyBtnProps {
  icon: React.ReactNode;
  id?: string;
  onClick: (id: string) => void;
  label?: string;
  color?: "warning" | "info";
  sx?: any;
}

function KeyBtn({ icon, id, onClick, label, color, sx }: KeyBtnProps) {
  return (
    <Button
      variant="outlined"
      size="small"
      onClick={() => id && onClick(id)}
      color={color || "inherit"}
      sx={{
        minWidth: 44,
        minHeight: 40,
        px: 1,
        fontSize: 11,
        fontWeight: 600,
        borderColor: "rgba(255,255,255,0.12)",
        color: "text.secondary",
        textTransform: "none",
        ...sx,
      }}
    >
      {label ? (
        <>
          {icon}
          <Box component="span" sx={{ ml: 0.5 }}>{label}</Box>
        </>
      ) : (
        icon
      )}
    </Button>
  );
}
