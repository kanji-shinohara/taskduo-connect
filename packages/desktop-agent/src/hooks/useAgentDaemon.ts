import { useEffect } from "react";
import { useAgentStore } from "../store/agentStore";
import { Command } from "@tauri-apps/plugin-shell";

export function useAgentDaemon() {
  const { isActive, serverUrl, apiKey, workerName } = useAgentStore();

  useEffect(() => {
    if (!isActive || !serverUrl || !apiKey) {
      return;
    }

    const pollTasks = async () => {
      const baseUrl = serverUrl.endsWith('/') ? serverUrl.slice(0, -1) : serverUrl;
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
          }),
        });

        if (!res.ok) {
          console.error("[AgentDaemon] Polling failed", await res.text());
          return;
        }

        const data = await res.json();
        const tasks = data.tasks || [];

        for (const task of tasks) {
          console.log("[AgentDaemon] Received task:", task.id);
          
          // Mark task as in progress
          await updateTaskStatus(task.id, "ai_in_progress");

          try {
            // Execute command locally
            console.log(`[AgentDaemon] Executing task ${task.id}...`);
            
            // agy-helper.py を直接呼び出すか、タスク側から指定されたコマンドを呼び出す
            // ここでは簡易的に task.content にプロンプトが入っている前提で agy コマンドを実行する想定
            // 実際にはタスクごとに実行コマンドを変えたりできるが、今回は固定
            const output = await executeCommand("agy", ["--prompt", task.title + "\\n" + (task.content || "")]);
            
            console.log(`[AgentDaemon] Task ${task.id} execution completed.`);
            await completeTask(task.id, "ai_confirming", `Execution completed.\\n\\n\`\`\`\\n${output}\\n\`\`\``);
          } catch (execError: any) {
            console.error(`[AgentDaemon] Task ${task.id} execution failed:`, execError);
            await completeTask(task.id, "ai_todo", `Execution failed: ${execError.message || execError}`);
          }
        }
      } catch (err) {
        console.error("[AgentDaemon] Error during polling loop:", err);
      }
    };

    const updateTaskStatus = async (taskId: string, status: string) => {
      const baseUrl = serverUrl.endsWith('/') ? serverUrl.slice(0, -1) : serverUrl;
      try {
        await fetch(`${baseUrl}/api/tasks/${taskId}`, {
          method: "PATCH",
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

    const completeTask = async (taskId: string, status: string, comment: string) => {
      const baseUrl = serverUrl.endsWith('/') ? serverUrl.slice(0, -1) : serverUrl;
      try {
        // Task status update
        await updateTaskStatus(taskId, status);
        // Add comment
        await fetch(`${baseUrl}/api/tasks/${taskId}/comments`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
          },
          body: JSON.stringify({ content: comment }),
        });
      } catch (err) {
        console.error("[AgentDaemon] Failed to complete task:", err);
      }
    };

    const executeCommand = async (command: string, args: string[]): Promise<string> => {
      return new Promise((resolve, reject) => {
        const cmd = Command.create(command, args);
        let output = "";
        let errorOutput = "";

        cmd.on("close", (data) => {
          if (data.code !== 0) {
            reject(new Error(`Command failed with code ${data.code}\\n${errorOutput}`));
          } else {
            resolve(output);
          }
        });

        cmd.on("error", (error) => {
          reject(error);
        });

        cmd.stdout.on("data", (line) => {
          output += line + "\\n";
        });

        cmd.stderr.on("data", (line) => {
          errorOutput += line + "\\n";
        });

        cmd.spawn().catch(reject);
      });
    };

    // Initial poll
    pollTasks();

    // Poll every 15 seconds
    const interval = setInterval(pollTasks, 15000);

    return () => clearInterval(interval);
  }, [isActive, serverUrl, apiKey, workerName]);
}
