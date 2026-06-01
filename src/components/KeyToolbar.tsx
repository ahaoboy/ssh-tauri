// ── Collapsible virtual keyboard toolbar ────────────────────────────────

import { Box, Button, Stack } from "@mui/material";
import { useRef, useState, useEffect } from "react";
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

// ── Props ────────────────────────────────────────────────────────────────

interface KeyToolbarProps {
  onSendKey: (data: string) => void;
  open: boolean;
}

// ── Component ────────────────────────────────────────────────────────────

export default function KeyToolbar({ onSendKey, open }: KeyToolbarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);

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

  /** Send a named virtual key sequence. */
  const handlePress = (id: string) => {
    const seq = KEY_SEQUENCES[id];
    if (seq) onSendKey(seq);
  };

  /** Paste clipboard content. */
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) onSendKey(text);
    } catch {
      // Clipboard API may not be available
    }
  };

  return (
    <Box
      ref={containerRef}
      sx={{
        borderBottom: 1,
        borderColor: "divider",
        bgcolor: "rgba(22, 27, 34, 0.95)",
        backdropFilter: "blur(8px)",
      }}
    >
      {open && (
        narrow ? (
          <Stack spacing={1} sx={{ px: 1.5, pb: 1.5 }}>
            <Stack direction="row" spacing={0.8} sx={{ justifyContent: "center" }}>
              <KeyBtn icon={<KeyboardArrowLeft />} onClick={() => handlePress("arrowLeft")} />
              <KeyBtn icon={<KeyboardArrowUp />} onClick={() => handlePress("arrowUp")} />
              <KeyBtn icon={<KeyboardArrowDown />} onClick={() => handlePress("arrowDown")} />
              <KeyBtn icon={<KeyboardArrowRight />} onClick={() => handlePress("arrowRight")} />
              <KeyBtn icon={<Tab />} onClick={() => handlePress("tab")} label="Tab" />
              <KeyBtn icon={<BackspaceOutlined />} onClick={() => handlePress("delete")} label="Del" />
            </Stack>
            <Stack direction="row" spacing={0.8} sx={{ justifyContent: "center" }}>
              <KeyBtn icon={<KeyboardReturn />} onClick={() => handlePress("enter")} label="Enter" sx={{ flex: 1, maxWidth: 120 }} />
              <KeyBtn icon={<ContentCopy />} onClick={() => handlePress("ctrlC")} label="C" color="warning" />
              <KeyBtn icon={<ContentPaste />} onClick={handlePaste} label="V" color="info" />
            </Stack>
          </Stack>
        ) : (
          <Stack direction="row" spacing={0.8} sx={{ px: 1.5, pb: 1.5, justifyContent: "center", flexWrap: "wrap" }}>
            <KeyBtn icon={<KeyboardArrowLeft />} onClick={() => handlePress("arrowLeft")} />
            <KeyBtn icon={<KeyboardArrowUp />} onClick={() => handlePress("arrowUp")} />
            <KeyBtn icon={<KeyboardArrowDown />} onClick={() => handlePress("arrowDown")} />
            <KeyBtn icon={<KeyboardArrowRight />} onClick={() => handlePress("arrowRight")} />
            <KeyBtn icon={<Tab />} onClick={() => handlePress("tab")} label="Tab" />
            <KeyBtn icon={<BackspaceOutlined />} onClick={() => handlePress("delete")} label="Del" />
            <KeyBtn icon={<KeyboardReturn />} onClick={() => handlePress("enter")} label="Enter" />
            <KeyBtn icon={<ContentCopy />} onClick={() => handlePress("ctrlC")} label="C" color="warning" />
            <KeyBtn icon={<ContentPaste />} onClick={handlePaste} label="V" color="info" />
          </Stack>
        )
      )}
    </Box>
  );
}

// ── Key button ───────────────────────────────────────────────────────────

interface KeyBtnProps {
  icon: React.ReactNode;
  onClick: () => void;
  label?: string;
  color?: "warning" | "info";
  sx?: any;
}

function KeyBtn({ icon, onClick, label, color, sx }: KeyBtnProps) {
  return (
    <Button
      variant="outlined"
      size="small"
      onClick={onClick}
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
