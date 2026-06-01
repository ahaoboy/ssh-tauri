// ── Collapsible virtual keyboard toolbar ────────────────────────────────

import { useState } from "react";
import { Box, Button, IconButton, Stack } from "@mui/material";
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
  KeyboardDoubleArrowDown,
} from "@mui/icons-material";
import { KEY_SEQUENCES } from "../constants/terminal";

// ── Props ────────────────────────────────────────────────────────────────

interface KeyToolbarProps {
  /** Send raw bytes to the SSH session. */
  onSendKey: (data: string) => void;
}

// ── Component ────────────────────────────────────────────────────────────

export default function KeyToolbar({ onSendKey }: KeyToolbarProps) {
  const [open, setOpen] = useState(false);

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
      sx={{
        borderBottom: 1,
        borderColor: "divider",
        bgcolor: "rgba(22, 27, 34, 0.95)",
        backdropFilter: "blur(8px)",
      }}
    >
      {/* Toggle chevron */}
      <Box sx={{ display: "flex", justifyContent: "center", py: 0.5 }}>
        <IconButton
          size="small"
          onClick={() => setOpen((v) => !v)}
          sx={{ color: "text.secondary" }}
        >
          <KeyboardDoubleArrowDown
            sx={{
              fontSize: 18,
              transform: open ? "rotate(180deg)" : "none",
              transition: "transform 0.2s",
            }}
          />
        </IconButton>
      </Box>

      {open && (
        <Stack spacing={1} sx={{ px: 1.5, pb: 1.5 }}>
          {/* Row 1: arrows + tab + del */}
          <Stack direction="row" spacing={0.8} sx={{ justifyContent: "center" }}>
            <KeyBtn icon={<KeyboardArrowLeft />} onClick={() => handlePress("arrowLeft")} />
            <KeyBtn icon={<KeyboardArrowUp />} onClick={() => handlePress("arrowUp")} />
            <KeyBtn icon={<KeyboardArrowDown />} onClick={() => handlePress("arrowDown")} />
            <KeyBtn icon={<KeyboardArrowRight />} onClick={() => handlePress("arrowRight")} />
            <KeyBtn icon={<Tab />} onClick={() => handlePress("tab")} label="Tab" />
            <KeyBtn icon={<BackspaceOutlined />} onClick={() => handlePress("delete")} label="Del" />
          </Stack>
          {/* Row 2: enter + ctrl+c + paste */}
          <Stack direction="row" spacing={0.8} sx={{ justifyContent: "center" }}>
            <KeyBtn
              icon={<KeyboardReturn />}
              onClick={() => handlePress("enter")}
              label="Enter"
              sx={{ flex: 1, maxWidth: 120 }}
            />
            <KeyBtn
              icon={<ContentCopy />}
              onClick={() => handlePress("ctrlC")}
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
