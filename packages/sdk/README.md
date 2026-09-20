# @taskduo/sdk

Official TypeScript/JavaScript SDK for the **TaskDuo** task management platform.  
Allows developers and autonomous AI agents to interact with TaskDuo via REST API.

---

## Installation

```bash
npm install @taskduo/sdk
```

---

## Quickstart

```typescript
import { TaskDuoClient } from "@taskduo/sdk";

// Automatically picks up TASKDUO_API_URL and TASKDUO_API_KEY from environment
const client = new TaskDuoClient({
  baseUrl: process.env.TASKDUO_API_URL || "http://localhost:43000",
  apiKey: process.env.TASKDUO_API_KEY,
});

async function main() {
  // 1. List tasks
  const tasks = await client.listTasks({ status: "ai_todo" });
  console.log(`Found ${tasks.length} tasks ready for AI.`);

  // 2. Start a task
  if (tasks.length > 0) {
    const task = tasks[0];
    await client.startTask(task.id, "Starting implementation plan...");

    // 3. Complete task with DoD
    await client.completeTask(task.id, "Successfully implemented and verified.", [
      { text: "Passes automated tests", completed: true },
    ]);
  }
}

main().catch(console.error);
```

---

## License

[Apache-2.0](../../LICENSE) © TaskDuo Authors
