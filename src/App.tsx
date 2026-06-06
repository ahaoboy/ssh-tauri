// ── SSH Client — main application controller ──────────────────────────────

import { useState, useCallback, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CssBaseline } from "@mui/material";
import { useAutoOrientation } from "./hooks/useAutoOrientation";
import { isMobile } from "./utils/platform";
import type { AuthMethod, ConnectionState, ConnectParams, SavedConfig } from "./types";
import { normalizePrivateKey } from "./utils/keyNormalizer";
import {
  loadAllConfigs,
  saveConfig,
  deleteConfig,
  generateConfigId,
  getLastUsedConfigId,
  setLastUsedConfigId,
} from "./utils/configStore";
import LoginForm from "./components/LoginForm";
import TerminalView from "./components/TerminalView";

// ── App component ──────────────────────────────────────────────────────────

export default function App() {
  // ── Connection form state ────────────────────────────────────
  const [label, setLabel] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [username, setUsername] = useState("");
  const [authMethod, setAuthMethod] = useState<AuthMethod>("password");
  const [password, setPassword] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [command, setCommand] = useState("");
  // Track whether the user has manually edited the config label
  const [labelEdited, setLabelEdited] = useState(false);

  // ── Connection lifecycle state ───────────────────────────────
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected");
  const [error, setError] = useState("");

  // ── Config management state ──────────────────────────────────
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>([]);
  /** Currently selected config ID (synced across connect/disconnect). */
  const [selectedConfigId, setSelectedConfigId] = useState("");

  // Load saved configs on mount, and auto-select the last used one
  useEffect(() => {
    const configs = loadAllConfigs();
    setSavedConfigs(configs);

    const lastId = getLastUsedConfigId();
    if (lastId) {
      const lastCfg = configs.find((c) => c.id === lastId);
      if (lastCfg) {
        handleLoadConfig(lastCfg);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Reload configs helper ────────────────────────────────────
  const reloadConfigs = useCallback(() => {
    setSavedConfigs(loadAllConfigs());
  }, []);

  // ── Auto-generate default label from host + username ─────────
  useEffect(() => {
    if (!labelEdited && host && username) {
      setLabel(`${username}@${host}`);
    } else if (!host && !username) {
      setLabel("");
    }
  }, [host, username, labelEdited]);

  // ── Update a single form field ───────────────────────────────
  const handleFieldChange = useCallback((field: string, value: string) => {
    if (field === "label") {
      setLabel(value);
      setLabelEdited(true);
      return;
    }
    const setters: Record<string, (v: string) => void> = {
      host: setHost,
      port: setPort,
      username: setUsername,
      password: setPassword,
      privateKey: setPrivateKey,
      command: setCommand,
    };
    setters[field]?.(value);
  }, []);

  // ── Load a saved config into the form ────────────────────────
  const handleLoadConfig = useCallback(
    (config: SavedConfig) => {
      setLabel(config.label);
      setHost(config.host);
      setPort(config.port);
      setUsername(config.username);
      setAuthMethod(config.authMethod);
      setPassword(config.password);
      setPrivateKey(config.privateKey);
      setCommand(config.command ?? "");
      setLabelEdited(true);
      setSelectedConfigId(config.id);
    },
    [],
  );

  // ── Save current form values (create or update by id) ────────
  const handleSaveConfig = useCallback(() => {
    if (!host || !username) return;
    const id = selectedConfigId || generateConfigId();
    const config: SavedConfig = {
      id,
      label: label || `${username}@${host}`,
      host,
      port,
      username,
      authMethod,
      password,
      privateKey,
      command,
    };
    saveConfig(config);
    setSelectedConfigId(id);
    setLabelEdited(true);
    reloadConfigs();
  }, [selectedConfigId, label, host, port, username, authMethod, password, privateKey, command, reloadConfigs]);

  // ── Delete the currently selected config by id ───────────────
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

      // Pass the remote command if provided (SSH -t equivalent)
      if (command.trim()) {
        params.command = command.trim();
      }

      await invoke("ssh_connect", { params });
      setConnectionState("connected");

      // Auto-save config on successful connection.
      // Use selected config id if available, else match by host+username.
      const existing = savedConfigs.find(
        (c) => c.id === selectedConfigId,
      ) ?? savedConfigs.find(
        (c) => c.host === host && c.username === username,
      );
      const config: SavedConfig = {
        id: existing?.id ?? generateConfigId(),
        label: label || existing?.label || `${username}@${host}`,
        host,
        port,
        username,
        authMethod,
        // Only persist credentials if the connection succeeded
        password,
        privateKey,
        command,
      };
      saveConfig(config);
      setLastUsedConfigId(config.id);
      reloadConfigs();
      setSelectedConfigId(config.id);
    } catch (e) {
      console.error("SSH connection failed:", e);
      setError(String(e));
      setConnectionState("error");
    }
  }, [host, port, username, authMethod, password, privateKey, command, reloadConfigs, savedConfigs]);

  // ── Disconnect from SSH server ───────────────────────────────
  const handleDisconnect = useCallback(async () => {
    try {
      await invoke("ssh_disconnect");
    } catch (e) {
      console.warn("SSH disconnect error:", e);
    }
    setConnectionState("disconnected");
  }, []);

  // ── Determine whether to render login or terminal ────────────
  const isConnected = connectionState === "connected";

  // ── Window orientation ──────────────────────────────────────
  // Login always portrait; terminal follows screen aspect ratio
  const orientation = isConnected && !isMobile() && screen.width > screen.height
    ? "landscape"
    : "portrait";
  useAutoOrientation(orientation);

  const loginFormProps = useMemo(
    () => ({
      label,
      host,
      port,
      username,
      authMethod,
      password,
      privateKey,
      command,
      connecting: connectionState === "connecting",
      error,
      savedConfigs,
      onChange: handleFieldChange,
      onAuthMethodChange: setAuthMethod,
      onConnect: handleConnect,
      onLoadConfig: handleLoadConfig,
      onSaveConfig: handleSaveConfig,
      onDeleteConfig: handleDeleteConfig,
      selectedConfigId,
      onSelectConfig: setSelectedConfigId,
    }),
    [
      label,
      host,
      port,
      username,
      authMethod,
      password,
      privateKey,
      command,
      connectionState,
      error,
      savedConfigs,
      handleFieldChange,
      handleConnect,
      handleLoadConfig,
      handleSaveConfig,
      handleDeleteConfig,
      selectedConfigId,
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
    </>
  );
}


