# Contributing to TaskDuo Connect

Thank you for your interest in contributing to **TaskDuo Connect**!  
We welcome contributions of all kinds: bug reports, documentation enhancements, feature requests, and pull requests.

---

## Code of Conduct

All contributors and maintainers are expected to adhere to our [Code of Conduct](CODE_OF_CONDUCT.md). Please treat everyone with respect and courtesy.

---

## Development Setup

### Prerequisites
- **Node.js**: `v20.0.0` or higher (v22 recommended)
- **npm**: `v10.0.0` or higher

### Clone & Install

```bash
git clone https://github.com/kanji-shinohara/taskduo-connect.git
cd taskduo-connect
npm install
```

### Build All Packages

```bash
npm run build
```

---

## Monorepo Packages

- **`packages/sdk`** (`@taskduo/sdk`): Official TypeScript SDK for TaskDuo REST API & WebSocket.
- **`packages/mcp-server`** (`@taskduo/mcp-server`): Model Context Protocol (MCP) server for Claude Code, Cursor, Antigravity, and other LLM clients.
- **`packages/worker`** (`@taskduo/worker`): Autonomous background runner daemon.
- **`packages/desktop-agent`**: Cross-platform system tray desktop GUI.

---

## Pull Request Guidelines

1. Fork the repository and create a new feature branch (`git checkout -b feat/my-awesome-feature`).
2. Ensure code passes type checks and builds:
   ```bash
   npm run build
   ```
3. Commit your changes using Conventional Commits (`feat: ...`, `fix: ...`, `docs: ...`).
4. Push to your branch and submit a Pull Request.

---

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
