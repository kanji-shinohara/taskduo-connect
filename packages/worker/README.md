# @taskduo/worker

Autonomous background worker daemon for [TaskDuo](https://taskduo.app).  
Polls assigned AI tasks from TaskDuo and executes them locally using autonomous agents such as **Antigravity** (`agy`), **Claude Code** (`claude`), or **Kiro** (`kiro-cli`).

---

## Installation & Usage

### Direct Run via npx

```bash
export TASKDUO_API_URL="http://localhost:43000"
export TASKDUO_API_KEY="sk_your_api_key"

npx @taskduo/worker
```

### Global Installation

```bash
npm install -g @taskduo/worker
taskduo-worker
```

---

## Environment Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `TASKDUO_API_URL` | TaskDuo server URL | `http://localhost:43000` |
| `TASKDUO_API_KEY` | Worker API key (from Settings) | *(Required)* |
| `TASKDUO_WORKER_NAME` | Custom name for this worker node | `Worker-<hostname>` |
| `POLL_INTERVAL_MS` | Polling frequency in milliseconds | `5000` |

---

## How It Works

1. The daemon polls TaskDuo's `/api/workers/tasks` endpoint with node health status.
2. When a task assigned to this worker or AI is received, the worker changes the status to `ai_in_progress`.
3. Invokes the appropriate CLI (`agy`, `claude`, or `kiro-cli`) with safe environment isolation.
4. Streams logs in real time to TaskDuo.
5. On completion, validates the Definition of Done (DoD) and closes the task.

---

## License

[Apache-2.0](../../LICENSE) © TaskDuo Authors
