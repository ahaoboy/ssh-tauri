// ── Terminal header bar ─────────────────────────────────────────────────

import {
  AppBar,
  IconButton,
  Toolbar,
  Typography,
} from "@mui/material";
import { useState, useCallback } from "react";
import { Terminal as TerminalIcon, Logout, ScreenRotation, KeyboardDoubleArrowDown } from "@mui/icons-material";

// ── Props ────────────────────────────────────────────────────────────────

interface TerminalHeaderProps {
  username: string;
  host: string;
  port: string;
  onDisconnect: () => void;
  onToggleOrientation: () => void;
  toolbarOpen: boolean;
  onToggleToolbar: () => void;
}

// ── Component ────────────────────────────────────────────────────────────

export default function TerminalHeader({
  username,
  host,
  port,
  onDisconnect,
  onToggleOrientation,
  toolbarOpen,
  onToggleToolbar,
}: TerminalHeaderProps) {
  const [copied, setCopied] = useState(false);

  const connectionString = `${username}@${host}:${port}`;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(connectionString);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable
    }
  }, [connectionString]);

  return (
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
          noWrap
          onClick={handleCopy}
          title={`${connectionString} — click to copy`}
          sx={{
            flex: 1,
            fontFamily: "monospace",
            ml: 0.5,
            cursor: "pointer",
            userSelect: "none",
            "&:hover": { color: "text.primary" },
          }}
        >
          {copied ? "Copied!" : connectionString}
        </Typography>

        <IconButton
          size="small"
          color="inherit"
          onClick={onToggleToolbar}
          title="Toggle keyboard toolbar"
        >
          <KeyboardDoubleArrowDown
            sx={{
              fontSize: 18,
              transform: toolbarOpen ? "rotate(180deg)" : "none",
              transition: "transform 0.2s",
            }}
          />
        </IconButton>

        <IconButton
          size="small"
          color="inherit"
          onClick={onToggleOrientation}
          title="Toggle orientation"
        >
          <ScreenRotation sx={{ fontSize: 18 }} />
        </IconButton>


        <IconButton
          size="small"
          color="error"
          onClick={onDisconnect}
          title="Disconnect"
        >
          <Logout sx={{ fontSize: 18 }} />
        </IconButton>
      </Toolbar>
    </AppBar>
  );
}
