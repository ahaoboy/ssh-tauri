// ── SSH Client — main application controller ──────────────────────────────

import { useState, useCallback, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CssBaseline } from "@mui/material";
import type { AuthMethod, ConnectionState, ConnectParams, SavedConfig } from "./types";
import { normalizePrivateKey } from "./utils/keyNormalizer";
import {
  loadAllConfigs,
  saveConfig,
  deleteConfig,
  generateConfigId,
} from "./utils/configStore";
import LoginForm from "./components/LoginForm";
import TerminalView from "./components/TerminalView";
import ConfigDialog from "./components/ConfigDialog";

// ── App component ──────────────────────────────────────────────────────────

export default function App() {
  // ── Connection form state ────────────────────────────────────
  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [username, setUsername] = useState("");
  const [authMethod, setAuthMethod] = useState<AuthMethod>("password");
  const [password, setPassword] = useState("");
  const [privateKey, setPrivateKey] = useState("");

  // ── Connection lifecycle state ───────────────────────────────
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected");
  const [error, setError] = useState("");

  // ── Config management state ──────────────────────────────────
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>([]);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);

  // Load saved configs on mount
  useEffect(() => {
    setSavedConfigs(loadAllConfigs());
  }, []);

  // ── Reload configs helper ────────────────────────────────────
  const reloadConfigs = useCallback(() => {
    setSavedConfigs(loadAllConfigs());
  }, []);

  // ── Update a single form field ───────────────────────────────
  const handleFieldChange = useCallback((field: string, value: string) => {
    const setters: Record<string, (v: string) => void> = {
      host: setHost,
      port: setPort,
      username: setUsername,
      password: setPassword,
      privateKey: setPrivateKey,
    };
    setters[field]?.(value);
  }, []);

  // ── Load a saved config into the form ────────────────────────
  const handleLoadConfig = useCallback(
    (config: SavedConfig) => {
      setHost(config.host);
      setPort(config.port);
      setUsername(config.username);
      setAuthMethod(config.authMethod);
      setPassword(config.password);
      setPrivateKey(config.privateKey);
    },
    [],
  );

  // ── Save current form values as a new config ─────────────────
  const handleSaveConfig = useCallback(() => {
    if (!host || !username) return;
    const config: SavedConfig = {
      id: generateConfigId(),
      label: `${username}@${host}`,
      host,
      port,
      username,
      authMethod,
      password,
      privateKey,
    };
    saveConfig(config);
    reloadConfigs();
  }, [host, port, username, authMethod, password, privateKey, reloadConfigs]);

  // ── Delete a saved config ────────────────────────────────────
  const handleDeleteConfig = useCallback(
    (id: string) => {
      deleteConfig(id);
      reloadConfigs();
    },
    [reloadConfigs],
  );

  // ── Connect to SSH server ────────────────────────────────────
  const handleConnect = useCallback(async () => {
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
    } catch (e) {
      setError(String(e));
      setConnectionState("error");
    }
  }, [host, port, username, authMethod, password, privateKey]);

  // ── Disconnect from SSH server ───────────────────────────────
  const handleDisconnect = useCallback(async () => {
    try {
      await invoke("ssh_disconnect");
    } catch {
      // Ignore errors during disconnect
    }
    setConnectionState("disconnected");
  }, []);

  // ── Determine whether to render login or terminal ────────────
  const isConnected = connectionState === "connected";

  const loginFormProps = useMemo(
    () => ({
      host,
      port,
      username,
      authMethod,
      password,
      privateKey,
      connecting: connectionState === "connecting",
      error,
      savedConfigs,
      onChange: handleFieldChange,
      onAuthMethodChange: setAuthMethod,
      onConnect: handleConnect,
      onLoadConfig: handleLoadConfig,
      onOpenManager: () => setConfigDialogOpen(true),
      onSaveConfig: handleSaveConfig,
    }),
    [
      host,
      port,
      username,
      authMethod,
      password,
      privateKey,
      connectionState,
      error,
      savedConfigs,
      handleFieldChange,
      handleConnect,
      handleLoadConfig,
      handleSaveConfig,
    ],
  );

  return (
    <>
      <CssBaseline />
      {isConnected ? (
        <TerminalView
          username={username}
          host={host}
          port={port}
          onDisconnect={handleDisconnect}
        />
      ) : (
        <LoginForm {...loginFormProps} />
      )}
      <ConfigDialog
        open={configDialogOpen}
        configs={savedConfigs}
        onClose={() => setConfigDialogOpen(false)}
        onLoad={(cfg) => {
          handleLoadConfig(cfg);
        }}
        onDelete={handleDeleteConfig}
      />
    </>
  );
}


