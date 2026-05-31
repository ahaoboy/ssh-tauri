<p align="center">
  <img src="public/icon.png" alt="SSH Client" width="96" />
</p>

<h1 align="center">SSH Client — Tauri Edition</h1>

<p align="center">
  A cross-platform SSH client built with <strong>Tauri</strong> + <strong>React</strong> + <strong>MUI</strong>.
  <br/>
  Connect to remote servers via password or private key, with a full terminal emulator.
</p>

---

## Features

- **Password & private key authentication** — auto-detect key type, normalize PEM format
- **Built-in terminal** — powered by [xterm.js](https://xtermjs.org/) with GitHub-dark theme
- **Config management** — save, load, and delete connection profiles (auto-saved on success)
- **Remote command (-t)** — execute a custom command instead of the default shell
- **Dark mode** — auto-detects system `prefers-color-scheme`
- **Mobile support** — responsive layout, Android safe-area handling
- **Cross-platform** — Windows, macOS, Linux, Android

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | [Tauri v2](https://tauri.app/) |
| Frontend | React 19 + TypeScript |
| UI library | [MUI](https://mui.com/) (Material UI) |
| Terminal | [xterm.js](https://xtermjs.org/) |
| SSH backend | [russh](https://docs.rs/russh/) (async Rust SSH) |
| Logging | `tracing` |

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) (latest stable)
- [Node.js](https://nodejs.org/) ≥ 18
- [pnpm](https://pnpm.io/) (or npm)

### Install & Run

```bash
# Install frontend dependencies
pnpm install

# Run in development mode
pnpm tauri dev

# Build for production
pnpm tauri build
```

### Android

```bash
pnpm tauri android init
pnpm tauri android dev
```

## License

MIT

