# @taskduo/mcp-server

Official **Model Context Protocol (MCP)** server for [TaskDuo](https://taskduo.app).  
Allows AI agents (Claude Code, Cursor, Antigravity, Cline, Windsurf, Zed) to query, create, track, and complete tasks directly in TaskDuo.

---

## Features

- 🛠️ **Full Task Lifecycle**: `task_list`, `task_get`, `task_create`, `task_start`, `task_complete`, `task_update`, `task_delete`
- 🎯 **Definition of Done (DoD) Enforcement**: Guarantees high-precision task execution with structured checklists.
- 🔒 **Safe & Standardized**: Works over standard I/O (STDIO) transport. Zero local machine secrets leaked.

---

## Quick Configuration

### Claude Code (`claude.json`)

```json
{
  "mcpServers": {
    "taskduo": {
      "command": "npx",
      "args": ["-y", "@taskduo/mcp-server"],
      "env": {
        "TASKDUO_API_URL": "http://localhost:43000",
        "TASKDUO_API_KEY": "sk_your_api_key_here"
      }
    }
  }
}
```

### Cursor (`cursor-settings.json` or UI)

- **Name**: `TaskDuo`
- **Type**: `command`
- **Command**: `npx -y @taskduo/mcp-server`
- **Environment Variables**:
  - `TASKDUO_API_URL`: `http://localhost:43000`
  - `TASKDUO_API_KEY`: `sk_your_api_key_here`

### Antigravity (`~/.gemini/antigravity/mcp.json`)

```json
{
  "mcpServers": {
    "TaskDuo": {
      "command": "npx",
      "args": ["-y", "@taskduo/mcp-server"],
      "env": {
        "TASKDUO_API_URL": "http://localhost:43000",
        "TASKDUO_API_KEY": "sk_your_api_key_here"
      }
    }
  }
}
```

---

## Environment Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `TASKDUO_API_URL` | Base URL of your TaskDuo server | `http://localhost:43000` |
| `TASKDUO_API_KEY` | API Key generated in TaskDuo Settings | *(Required for authentication)* |

---

## License

[Apache-2.0](../../LICENSE) © TaskDuo Authors
