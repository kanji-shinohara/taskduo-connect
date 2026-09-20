# Getting Started with TaskDuo Connect

This guide will walk you through setting up **TaskDuo Connect** to work with your local AI development environment.

---

## 1. Prerequisites

- **TaskDuo Instance**: A running instance of TaskDuo (e.g. at `http://localhost:43000` or a deployed URL).
- **TaskDuo API Key**: Generated in **Settings > API Keys** inside the TaskDuo Web or Desktop app.
- **Node.js**: v20 or higher.
- **AI CLI Tool**: One or more supported agent CLIs installed in your PATH:
  - Antigravity (`agy`)
  - Claude Code (`claude`)
  - Kiro (`kiro-cli`)

---

## 2. Setting Up MCP (Model Context Protocol)

With MCP, you can converse with your AI agent in tools like Claude Code or Cursor, and the agent will directly fetch and manage tasks from TaskDuo.

### Claude Code

Add the following to `~/.claude/claude.json`:

```json
{
  "mcpServers": {
    "TaskDuo": {
      "command": "npx",
      "args": ["-y", "@taskduo/mcp-server"],
      "env": {
        "TASKDUO_API_URL": "http://localhost:43000",
        "TASKDUO_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

### Testing the MCP Connection

Ask Claude Code or Cursor:
> *"What tasks are currently open in TaskDuo?"*

The agent will execute `task_list` and present the structured tasks and their Definition of Done (DoD) items.

---

## 3. Setting Up the Worker Daemon

If you want tasks to run in the background completely autonomously:

```bash
# Set your server configuration
export TASKDUO_API_URL="http://localhost:43000"
export TASKDUO_API_KEY="YOUR_API_KEY"
export TASKDUO_WORKER_NAME="Local-Agent"

# Start the worker
npx @taskduo/worker
```

Now, any task in TaskDuo with status `ai_todo` assigned to this worker or AI will be picked up, executed, and closed automatically.

---

## 4. Building from Source

If you want to contribute to TaskDuo Connect:

```bash
git clone https://github.com/kanji-shinohara/taskduo-connect.git
cd taskduo-connect
npm install
npm run build
```
