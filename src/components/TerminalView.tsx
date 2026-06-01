// ── Terminal view — orchestrator for the connected SSH session ──────────

import { useRef, useEffect, useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PhysicalSize } from "@tauri-apps/api/dpi";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { Box, useMediaQuery, useTheme } from "@mui/material";
import { TERMINAL_THEME } from "../constants/terminal";
import { isAndroid } from "../utils/platform";
import TerminalHeader from "./TerminalHeader";
import KeyToolbar from "./KeyToolbar";

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
  const [forcedRotation, setForcedRotation] = useState(0);
  /** Toolbar open state lives here so it survives orientation changes. */
  const [toolbarOpen, setToolbarOpen] = useState(false);

  const terminalRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const eventUnlistenRef = useRef<(() => Promise<void>) | null>(null);

  // ── Send raw bytes to the SSH session ──────────────────────────────
  const sendKey = useCallback((key: string) => {
    invoke("ssh_write", { data: key }).catch((e) => console.error("ssh_write error:", e));
  }, []);

  // ── Orientation toggle ────────────────────────────────────────────
  const handleToggleOrientation = useCallback(async () => {
    console.log("Toggling orientation", isAndroid());
    if (!isAndroid()) {
      // ── Desktop (Tauri): swap window width/height ──────────
      try {
        const win = getCurrentWindow();
        const size = await win.outerSize();
        if (size.width > 0 && size.height > 0) {
          await win.setSize(new PhysicalSize(size.height, size.width));
          return;
        }
      } catch (e) {
        console.error("Failed to toggle orientation via window resize:", e);
        // Fall through
      }
    }

    // ── Mobile / fallback: native orientation lock ───────────
    try {
      const current = screen.orientation?.type ?? "";
      const target = current.startsWith("portrait") ? "landscape" : "portrait";
      await (screen.orientation as any).lock?.(target);
      return;
    } catch {
      console.warn("Orientation lock unavailable, using CSS fallback");
    }
    setForcedRotation((prev) => (prev === 0 ? 90 : 0));
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
      invoke("ssh_write", { data }).catch((e) => console.error("ssh_write error:", e));
    });
  }, [isMobile]);

  // ── Mount terminal and subscribe to events ──────────────────────
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

    const observer = new ResizeObserver(() => fitAddon.fit());
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
        ...(forcedRotation
          ? {
            transform: `rotate(${forcedRotation}deg)`,
            transformOrigin: "center center",
            width: "100dvh",
            height: "100dvw",
            position: "fixed",
            top: "50%",
            left: "50%",
            ml: "-50dvh",
            mt: "-50dvw",
          }
          : {}),
      }}
    >
      <TerminalHeader
        username={username}
        host={host}
        port={port}
        onDisconnect={onDisconnect}
        onToggleOrientation={handleToggleOrientation}
        toolbarOpen={toolbarOpen}
        onToggleToolbar={() => setToolbarOpen((v) => !v)}
      />

      <KeyToolbar onSendKey={sendKey} open={toolbarOpen} />

      <Box
        ref={terminalRef}
        sx={{
          flex: 1,
          p: 1,
          overflow: "hidden",
          "& .xterm": { height: "100%" },
          "& .xterm-viewport": {
            // Smooth scrolling on touch devices
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "none",
            touchAction: "pan-y",
            // Thin overlay scrollbar
            scrollbarWidth: "thin",
          },
          "& .xterm-viewport::-webkit-scrollbar": { width: 6 },
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
