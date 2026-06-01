// ── SSH login form component ─────────────────────────────────────────────

import { useState, useCallback } from "react";
import {
  Box,
  Button,
  FormControl,
  FormHelperText,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  Visibility,
  VisibilityOff,
  Key,
  Password,
  Save,
  FolderOpen,
} from "@mui/icons-material";
import type { AuthMethod, SavedConfig } from "../types";
import { normalizePrivateKey } from "../utils/keyNormalizer";

// ── Props ────────────────────────────────────────────────────────────────

interface LoginFormProps {
  /** Config label (auto-generated default, user-customizable). */
  label: string;
  /** Current form values. */
  host: string;
  port: string;
  username: string;
  authMethod: AuthMethod;
  password: string;
  privateKey: string;
  /** Optional remote command (SSH -t equivalent). */
  command: string;
  /** "true" when a connection attempt is in progress. */
  connecting: boolean;
  /** Error message to display. */
  error: string;
  /** List of saved configs for quick-load. */
  savedConfigs: SavedConfig[];
  /** Called when any field changes. */
  onChange: (field: string, value: string) => void;
  /** Called when auth method changes. */
  onAuthMethodChange: (method: AuthMethod) => void;
  /** Called when the user clicks Connect. */
  onConnect: () => void;
  /** Called to load a saved config. */
  onLoadConfig: (config: SavedConfig) => void;
  /** Called to open the config manager dialog. */
  onOpenManager: () => void;
  /** Called to save current form as a new config. */
  onSaveConfig: () => void;
}

// ── Component ────────────────────────────────────────────────────────────

export default function LoginForm({
  label,
  host,
  port,
  username,
  authMethod,
  password,
  privateKey,
  command,
  connecting,
  error,
  savedConfigs,
  onChange,
  onAuthMethodChange,
  onConnect,
  onLoadConfig,
  onOpenManager,
  onSaveConfig,
}: LoginFormProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [showPassword, setShowPassword] = useState(false);

  /** Normalize the private key when the user leaves the field. */
  const handlePrivateKeyBlur = useCallback(() => {
    if (privateKey.trim()) {
      onChange("privateKey", normalizePrivateKey(privateKey));
    }
  }, [privateKey, onChange]);

  return (
    <Box
      sx={{
        display: "flex",
        minHeight: "100dvh",
        alignItems: "center",
        justifyContent: "center",
        p: 2,
        pt: "calc(var(--safe-area-top) + 16px)",
        pb: "calc(var(--safe-area-bottom) + 16px)",
      }}
    >
      <Paper
        elevation={isMobile ? 0 : 3}
        sx={{
          width: "100%",
          maxWidth: 440,
          p: isMobile ? 2 : 4,
          ...(isMobile && { bgcolor: "transparent" }),
        }}
      >
        {/* ── Header ─────────────────────────────────── */}
        <Box sx={{ textAlign: "center", mb: 3 }}>
          <Box
            component="a"
            href="https://github.com/ahaoboy/ssh-tauri"
            target="_blank"
            rel="noopener noreferrer"
            sx={{ display: "inline-block", cursor: "pointer" }}
          >
            <Box
              component="img"
              src="/icon.png"
              alt="SSH Client"
              sx={{ width: 100, height: 100 }}
            />
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 600 }} gutterBottom>
            SSH Client
          </Typography>
        </Box>

        {/* ── Saved configs quick-select ─────────────── */}
        {savedConfigs.length > 0 && (
          <FormControl size="small" fullWidth sx={{ mb: 2 }}>
            <InputLabel>Saved Configurations</InputLabel>
            <Select
              value=""
              label="Saved Configurations"
              onChange={(e) => {
                const cfg = savedConfigs.find((c) => c.id === e.target.value);
                if (cfg) onLoadConfig(cfg);
              }}
              startAdornment={
                <InputAdornment position="start">
                  <FolderOpen fontSize="small" />
                </InputAdornment>
              }
            >
              {savedConfigs.map((cfg) => (
                <MenuItem key={cfg.id} value={cfg.id} dense>
                  {cfg.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {/* ── Form ───────────────────────────────────── */}
        <Box
          component="form"
          onSubmit={(e) => {
            e.preventDefault();
            onConnect();
          }}
          sx={{ display: "flex", flexDirection: "column", gap: 2 }}
        >
          {/* Config name */}
          <TextField
            label="Config Name"
            placeholder="my-server"
            value={label}
            onChange={(e) => onChange("label", e.target.value)}
            size="small"
          />

          {/* Host + Port */}
          <Box sx={{ display: "flex", gap: 1.5 }}>
            <TextField
              label="Host"
              placeholder="192.168.1.1"
              value={host}
              onChange={(e) => onChange("host", e.target.value)}
              required
              sx={{ flex: 2 }}
            />
            <TextField
              label="Port"
              type="number"
              value={port}
              onChange={(e) => onChange("port", e.target.value)}
              slotProps={{ htmlInput: { min: 1, max: 65535 } }}
              sx={{ flex: 1 }}
            />
          </Box>

          {/* Username */}
          <TextField
            label="Username"
            placeholder="root"
            value={username}
            onChange={(e) => onChange("username", e.target.value)}
            required
          />

          {/* Auth method */}
          <FormControl size="small">
            <InputLabel>Authentication</InputLabel>
            <Select
              value={authMethod}
              label="Authentication"
              onChange={(e) =>
                onAuthMethodChange(e.target.value as AuthMethod)
              }
            >
              <MenuItem value="password">
                <Password sx={{ mr: 1, fontSize: 18 }} />
                Password
              </MenuItem>
              <MenuItem value="privateKey">
                <Key sx={{ mr: 1, fontSize: 18 }} />
                Private Key
              </MenuItem>
            </Select>
          </FormControl>

          {/* Password / Private Key */}
          {authMethod === "password" ? (
            <TextField
              label="Password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => onChange("password", e.target.value)}
              placeholder="••••••••"
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        onClick={() => setShowPassword((v) => !v)}
                        edge="end"
                        tabIndex={-1}
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
          ) : (
            <TextField
              label="Private Key"
              multiline
              minRows={4}
              maxRows={8}
              value={privateKey}
              onChange={(e) => onChange("privateKey", e.target.value)}
              onBlur={handlePrivateKeyBlur}
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----\n..."
              slotProps={{
                htmlInput: {
                  sx: { fontFamily: "monospace", fontSize: 13 },
                },
              }}
            />
          )}

          {/* Remote command (-t flag) */}
          <TextField
            label="Remote Command (-t)"
            value={command}
            onChange={(e) => onChange("command", e.target.value)}
            size="small"
          />

          {/* Error */}
          {error && (
            <FormHelperText error sx={{ mx: 0 }}>
              {error}
            </FormHelperText>
          )}

          {/* Action buttons */}
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button
              type="submit"
              variant="contained"
              loading={connecting}
              loadingPosition="start"
              disabled={!host || !username}
              sx={{ flex: 2 }}
            >
              {connecting ? "Connecting…" : "Connect"}
            </Button>
            <Button
              variant="outlined"
              startIcon={<Save />}
              onClick={onSaveConfig}
              disabled={!host || !username}
              title="Save current form as a config"
            >
              Save
            </Button>
            <Button
              variant="outlined"
              onClick={onOpenManager}
              title="Manage saved configurations"
            >
              <FolderOpen />
            </Button>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}
