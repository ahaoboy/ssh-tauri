// ── Terminal header bar ─────────────────────────────────────────────────

import {
  AppBar,
  Button,
  IconButton,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { Terminal as TerminalIcon, Logout, ScreenRotation } from "@mui/icons-material";

// ── Props ────────────────────────────────────────────────────────────────

interface TerminalHeaderProps {
  username: string;
  host: string;
  port: string;
  onDisconnect: () => void;
  onToggleOrientation: () => void;
}

// ── Component ────────────────────────────────────────────────────────────

export default function TerminalHeader({
  username,
  host,
  port,
  onDisconnect,
  onToggleOrientation,
}: TerminalHeaderProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

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
          sx={{ flex: 1, fontFamily: "monospace", ml: 0.5 }}
        >
          {username}@{host}:{port}
        </Typography>

        <IconButton
          size="small"
          color="inherit"
          onClick={onToggleOrientation}
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
  );
}
