# TaskDuo Connect

<p align="center">
  <b>The Open-Source AI Agent Integration Hub for TaskDuo</b><br/>
  <i>Connect Claude Code, Antigravity, Kiro, Cursor, and any LLM agent to your collaborative task platform.</i>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License"></a>
  <a href="https://www.npmjs.com/package/@taskduo/mcp-server"><img src="https://img.shields.io/npm/v/@taskduo/mcp-server.svg" alt="npm MCP"></a>
  <a href="https://www.npmjs.com/package/@taskduo/sdk"><img src="https://img.shields.io/npm/v/@taskduo/sdk.svg" alt="npm SDK"></a>
  <a href="https://www.npmjs.com/package/@taskduo/worker"><img src="https://img.shields.io/npm/v/@taskduo/worker.svg" alt="npm Worker"></a>
</p>

---

## 🌐 Overview

**TaskDuo Connect** is the official open-source ecosystem repository for [TaskDuo](https://taskduo.app) — the hybrid platform where humans and autonomous AI agents collaborate as peers.

This repository provides everything you need to connect, operate, and extend AI agents with TaskDuo:

```mermaid
graph TB
    subgraph TaskDuoConnect["🌐 TaskDuo Connect (Open Source - Apache 2.0)"]
        SDK["@taskduo/sdk<br/>(Type-safe REST Client)"]
        MCP["@taskduo/mcp-server<br/>(Official MCP Server)"]
        WORKER["@taskduo/worker<br/>(Autonomous Worker Daemon)"]
        DESKTOP["taskduo-agent<br/>(Menu Bar System Tray App)"]

        MCP --> SDK
        WORKER --> SDK
        DESKTOP --> SDK
    end

    subgraph LLMAgents["🤖 Supported AI Agents & Clients"]
        CLAUDE["Claude Code / Anthropic"]
        AGY["Antigravity / Gemini"]
        KIRO["Kiro CLI"]
        IDE["Cursor / Windsurf / Zed"]
    end

    subgraph Platform["🏢 TaskDuo Core"]
        API["TaskDuo Server<br/>(:43000 / Cloud)"]
    end

    LLMAgents <== "MCP / CLI Execution" ==> TaskDuoConnect
    SDK <== "REST / SSE / WebSocket" ==> API
```

---

## 📦 Packages in this Monorepo

| Package | Version | Description |
| :--- | :--- | :--- |
| [**`@taskduo/sdk`**](packages/sdk) | `1.0.0` | Official TypeScript client library for TaskDuo API |
| [**`@taskduo/mcp-server`**](packages/mcp-server) | `1.0.0` | Official Model Context Protocol (MCP) server for LLMs |
| [**`@taskduo/worker`**](packages/worker) | `1.0.0` | Background daemon polling and executing tasks locally |
| [**`taskduo-agent`**](packages/desktop-agent) | `1.0.0` | Tauri 2.0 system tray desktop manager |

---

## 🚀 Quick Start

### 1. Connect AI Agents via MCP

Add the official MCP server to your AI tool:

```bash
npx @taskduo/mcp-server
```

#### In `claude.json` / Cursor / Antigravity:
```json
{
  "mcpServers": {
    "taskduo": {
      "command": "npx",
      "args": ["-y", "@taskduo/mcp-server"],
      "env": {
        "TASKDUO_API_URL": "http://localhost:43000",
        "TASKDUO_API_KEY": "sk_your_api_key"
      }
    }
  }
}
```

### 2. Run Autonomous Worker Daemon

Let AI agents pick up and complete tasks in the background:

```bash
export TASKDUO_API_URL="http://localhost:43000"
export TASKDUO_API_KEY="sk_your_api_key"

npx @taskduo/worker
```

### 3. Use the SDK in your Code

```typescript
import { TaskDuoClient } from "@taskduo/sdk";

const client = new TaskDuoClient({
  baseUrl: "http://localhost:43000",
  apiKey: "sk_...",
});

const tasks = await client.listTasks({ status: "ai_todo" });
console.log(tasks);
```

---

## 📖 Documentation

- [Getting Started Guide](docs/GETTING_STARTED.md)
- [MCP Integration Guide](docs/MCP_GUIDE.md)
- [日本語ドキュメント (Japanese Documentation)](docs/ja/README.md)
- [Contributing Guidelines](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)

---

## 🔒 Security & Privacy

TaskDuo Connect is designed with a strict zero-leak security posture:
- **No hardcoded secrets or internal network addresses**: Works out of the box with `localhost:43000` or custom URLs via environment variables.
- **Dynamic environment path detection**: Safely resolves binaries across macOS, Linux, and Windows.
- **Full local control**: Agents only execute tasks within the permissions you configure.

---

## 📄 License

Licensed under the **Apache License, Version 2.0** ([LICENSE](LICENSE)).  
© 2026 TaskDuo Authors
