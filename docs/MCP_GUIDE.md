# TaskDuo MCP Integration Guide

This document details the tools provided by the `@taskduo/mcp-server` package and best practices for integrating it with LLM development environments.

---

## Available MCP Tools

| Tool Name | Purpose | Required Arguments |
| :--- | :--- | :--- |
| `task_list` | List tasks with filtering by status or project | None (optional: `status`, `projectId`, `limit`) |
| `task_get` | Fetch detailed task content, DoD list, and execution history | `id` |
| `task_create` | Create a new task in TaskDuo | `title`, `dods` (array of DoD items) |
| `task_start` | Declare start of implementation and record execution plan | `id`, `summary` |
| `task_complete` | Mark task as `ai_done` and close DoD items | `id`, `summary` |
| `task_update` | Modify task title, status, or content | `id` |
| `task_delete` | Permanently remove a task | `id` |
| `project_list` | List all accessible projects | None |

---

## Integration Examples

### 1. Cline / Roo Code (VS Code Extension)

In Cline Settings > **MCP Servers**:

```json
{
  "mcpServers": {
    "TaskDuo": {
      "command": "npx",
      "args": ["-y", "@taskduo/mcp-server"],
      "env": {
        "TASKDUO_API_URL": "http://localhost:43000",
        "TASKDUO_API_KEY": "sk_..."
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

### 2. Cursor (AI Rules Integration)

You can add a `.cursorrules` or `.cursor/rules/taskduo.mdc` file in your repository:

```markdown
# TaskDuo Execution Rule
Before implementing changes, query TaskDuo via MCP `task_list` to identify open tasks.
Call `task_start` before beginning work.
Call `task_complete` once tests pass and DoD criteria are satisfied.
```

---

## Definition of Done (DoD) Workflow

In TaskDuo, high-quality autonomous engineering relies on structured Definition of Done (DoD) items rather than vague markdown bullet points:

```json
{
  "title": "Add password reset endpoint",
  "dods": [
    { "text": "POST /api/auth/reset-password endpoint implemented", "completed": false },
    { "text": "Unit tests pass with 90%+ coverage", "completed": false },
    { "text": "Rate limiting applied to prevent abuse", "completed": false }
  ]
}
```

When calling `task_complete`, mark each DoD item as `completed: true`.
