import { useEffect } from "react";
import { useAgentStore } from "../store/agentStore";

interface TauriShellExecuteResult {
  code: number | null;
  signal: number | null;
  stdout: string;
  stderr: string;
}

async function runShellCommand(
  program: string,
  args: string[],
): Promise<string> {
  const w = window as unknown as {
    __TAURI_INTERNALS__?: {
      invoke: (
        cmd: string,
        payload?: Record<string, unknown>,
      ) => Promise<TauriShellExecuteResult>;
    };
  };
  if (!w.__TAURI_INTERNALS__?.invoke) {
    throw new Error("Tauri shell plugin IPC is not available");
  }
  const result = await w.__TAURI_INTERNALS__.invoke("plugin:shell|execute", {
    program,
    args,
    options: {},
  });
  if (result.code !== 0) {
    throw new Error(
      `Command failed with code ${result.code}\n${result.stderr || ""}`,
    );
  }
  return result.stdout || "";
}

export function useAgentDaemon() {
  const { isActive, serverUrl, apiKey, workerName } = useAgentStore();

  useEffect(() => {
    if (!isActive || !serverUrl || !apiKey || !workerName) {
      return;
    }

    let isRunningTask = false;

    const pollTasks = async () => {
      if (isRunningTask) return;
      const baseUrl = serverUrl.endsWith("/") ? serverUrl.slice(0, -1) : serverUrl;
      try {
        // Heartbeat & task fetch
        const res = await fetch(`${baseUrl}/api/workers/tasks`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
          },
          body: JSON.stringify({
            name: workerName,
            status: "idle",
          }),
        });

        if (!res.ok) {
          console.error("[AgentDaemon] Polling failed", await res.text());
          return;
        }

        const data = await res.json();
        const tasks = data.tasks || [];

        for (const task of tasks) {
          isRunningTask = true;
          console.log("[AgentDaemon] Received task:", task.id);

          // Mark task as in progress
          await updateTaskStatus(task.id, "ai_in_progress");

          try {
            console.log(`[AgentDaemon] Executing task ${task.id}...`);
            const promptText = `${task.title}\n${task.content || task.description || ""}`;
            const output = await executeCommand("agy", [
              "--dangerously-skip-permissions",
              "--print",
              promptText,
            ]);

            console.log(`[AgentDaemon] Task ${task.id} execution completed.`);
            await completeTask(
              task.id,
              "ai_confirming",
              `Execution completed.\n\n\`\`\`\n${output}\n\`\`\``,
            );
          } catch (execError: any) {
            console.error(`[AgentDaemon] Task ${task.id} execution failed:`, execError);
            await completeTask(
              task.id,
              "ai_todo",
              `Execution failed: ${execError.message || execError}`,
            );
          } finally {
            isRunningTask = false;
          }
        }
      } catch (err) {
        console.error("[AgentDaemon] Error during polling loop:", err);
      }
    };

    const updateTaskStatus = async (taskId: string, status: string) => {
      const baseUrl = serverUrl.endsWith("/") ? serverUrl.slice(0, -1) : serverUrl;
      try {
        await fetch(`${baseUrl}/api/tasks/${taskId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
          },
          body: JSON.stringify({ status }),
        });
      } catch (err) {
        console.error("[AgentDaemon] Failed to update task status:", err);
      }
    };

    const completeTask = async (taskId: string, status: string, resultText: string) => {
      const baseUrl = serverUrl.endsWith("/") ? serverUrl.slice(0, -1) : serverUrl;
      try {
        await fetch(`${baseUrl}/api/tasks/${taskId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
          },
          body: JSON.stringify({
            status,
            result: resultText,
          }),
        });
      } catch (err) {
        console.error("[AgentDaemon] Failed to complete task:", err);
      }
    };

    const executeCommand = async (command: string, args: string[]): Promise<string> => {
      return runShellCommand(command, args);
    };

    // Initial poll
    pollTasks();

    // Poll every 15 seconds
    const interval = setInterval(pollTasks, 15000);

    return () => clearInterval(interval);
  }, [isActive, serverUrl, apiKey, workerName]);
}
