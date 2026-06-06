// ── Collapsible virtual keyboard toolbar ────────────────────────────────

import { Box, Button, Stack, SxProps, Theme } from "@mui/material";
import { useRef, useState, useEffect, useCallback } from "react";
import {
  KeyboardArrowUp,
  KeyboardArrowDown,
  KeyboardArrowLeft,
  KeyboardArrowRight,
  Tab,
  BackspaceOutlined,
  KeyboardReturn,
  ContentCopy,
  ContentPaste,
} from "@mui/icons-material";
import { KEY_SEQUENCES } from "../constants/terminal";
import { useTerminalTheme } from "../hooks/useTerminalTheme";

// ── Key definitions (single source of truth) ─────────────────────────────

interface KeyDef {
  id: string;
  icon: React.ReactNode;
  label?: string;
  narrowSx?: SxProps<Theme>;
  /** `true` for paste (clipboard), otherwise sends KEY_SEQUENCES[id]. */
  isPaste?: boolean;
}

/** Key order for the wide (1-row wrap) layout. */
const WIDE_KEYS: KeyDef[] = [
  { id: "arrowUp", icon: <KeyboardArrowUp /> },
  { id: "arrowDown", icon: <KeyboardArrowDown /> },
  { id: "arrowLeft", icon: <KeyboardArrowLeft /> },
  { id: "arrowRight", icon: <KeyboardArrowRight /> },
  { id: "tab", icon: <Tab />, label: "Tab" },
  { id: "delete", icon: <BackspaceOutlined />, label: "Del" },
  { id: "enter", icon: <KeyboardReturn />, label: "Enter", narrowSx: { flex: 1, maxWidth: 120 } },
  { id: "ctrlC", icon: <ContentCopy />, label: "C" },
  { id: "paste", icon: <ContentPaste />, label: "V", isPaste: true },
];

/** Key order for the narrow (2-row) layout. */
const NARROW_ROWS: KeyDef[][] = [
  WIDE_KEYS.slice(0, 6),
  WIDE_KEYS.slice(6),
];

// ── Props ────────────────────────────────────────────────────────────────

interface KeyToolbarProps {
  onSendKey: (data: string) => void;
  open: boolean;
}

// ── Component ────────────────────────────────────────────────────────────

export default function KeyToolbar({ onSendKey, open }: KeyToolbarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  const { chrome } = useTerminalTheme();

  // ── Dynamically decide 1-row vs 2-row layout ───────────────────
  // Total minimum width ≈ 9 buttons × 44px + 8 gaps × 6px + 2×12px padding
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setNarrow(entry.contentRect.width < 440);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── Handlers ────────────────────────────────────────────────────
  const handlePress = useCallback(
    (id: string) => {
      const seq = KEY_SEQUENCES[id];
      if (seq) onSendKey(seq);
    },
    [onSendKey],
  );

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) onSendKey(text);
    } catch (e) {
      console.warn("Clipboard read failed:", e);
    }
  }, [onSendKey]);

  /** Resolve onClick for a key def. */
  const getClick = useCallback(
    (k: KeyDef) => (k.isPaste ? handlePaste : () => handlePress(k.id)),
    [handlePaste, handlePress],
  );

  // ── Render ──────────────────────────────────────────────────────
  const renderKey = (k: KeyDef) => (
    <KeyBtn
      key={k.id}
      icon={k.icon}
      onClick={getClick(k)}
      label={k.label}
      sx={narrow ? k.narrowSx : undefined}
    />
  );

  return (
    <Box
      ref={containerRef}
      sx={{
        borderBottom: 1,
        borderColor: "divider",
        bgcolor: chrome.bg,
        backdropFilter: "blur(8px)",
      }}
    >
      {open &&
        (narrow
          ? // ── Narrow: 2-row layout ──────────────────────────────
          NARROW_ROWS.map((row, i) => (
            <Stack
              key={i}
              direction="row"
              spacing={0.8}
              sx={{ justifyContent: "center", px: 1.5, pb: i === 0 ? 0.5 : 1.5, pt: i === 0 ? 1.5 : 0 }}
            >
              {row.map((k) => renderKey(k))}
            </Stack>
          ))
          : // ── Wide: single wrapping row ──────────────────────────
          (
            <Stack direction="row" spacing={0.8} sx={{ px: 1.5, pb: 1.5, pt: 1.5, justifyContent: "center", flexWrap: "wrap" }}>
              {WIDE_KEYS.map((k) => renderKey(k))}
            </Stack>
          ))}
    </Box>
  );
}

// ── Key button ───────────────────────────────────────────────────────────

interface KeyBtnProps {
  icon: React.ReactNode;
  onClick: () => void;
  label?: string;
  sx?: SxProps<Theme>;
}

function KeyBtn({ icon, onClick, label, sx }: KeyBtnProps) {
  const { chrome } = useTerminalTheme();
  return (
    <Button
      variant="outlined"
      size="small"
      onClick={onClick}
      color="inherit"
      sx={{
        minWidth: 44,
        minHeight: 40,
        px: 1,
        fontSize: 11,
        fontWeight: 600,
        borderColor: chrome.border,
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
