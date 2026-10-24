/**
 * @taskduo/worker - WorkerRunner
 * Copyright 2026 TaskDuo Authors
 * Licensed under the Apache License, Version 2.0
 */

import { spawn, exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { TaskDuoClient, Task } from "@taskduo/sdk";
import { buildAgentCommand, findExecutable, getAgentSpawnEnv } from "./commandBuilder.js";
import { AgentStreamFormatter, SupportedAgent } from "./streamFormatter.js";

const execAsync = promisify(exec);
const __filename = fileURLToPath((import.meta as any).url);
const __dirname = path.dirname(__filename);

export interface WorkerOptions {
  workerName?: string;
  pollIntervalMs?: number;
  client?: TaskDuoClient;
}

export class WorkerRunner {
  private client: TaskDuoClient;
  private workerName: string;
  private pollIntervalMs: number;
  private isBusy = false;
  private shouldStop = false;
  private isCheckingHealth = false;
  private isCheckingCredits = false;
  private healthInterval?: any;
  private creditInterval?: any;
  private cachedHealth: Record<string, { status: "ok" | "error"; message?: string }> = {
    agy: { status: "ok" },
    claude: { status: "ok" },
    kiro: { status: "ok" },
  };
  private cachedQuota?: Record<string, unknown>;

  constructor(options: WorkerOptions = {}) {
    this.client = options.client || new TaskDuoClient();
    this.workerName =
      options.workerName ||
      process.env.TASKDUO_WORKER_NAME ||
      `Worker-${os.hostname().replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    this.pollIntervalMs = options.pollIntervalMs || 5000;
  }

  stop(): void {
    this.shouldStop = true;
    if (this.healthInterval) clearInterval(this.healthInterval);
    if (this.creditInterval) clearInterval(this.creditInterval);
  }

  private resolveScriptPath(): string | null {
    const candidates = [
      path.resolve(__dirname, "../scripts/credit_monitor.py"),
      path.resolve(__dirname, "../../scripts/credit_monitor.py"),
      path.resolve(process.cwd(), "scripts/credit_monitor.py"),
      path.resolve(process.cwd(), "packages/worker/scripts/credit_monitor.py"),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  private async updateAgentHealth(): Promise<void> {
    if (this.isCheckingHealth) return;
    this.isCheckingHealth = true;
    try {
      const env = getAgentSpawnEnv();
      const isWin = process.platform === "win32";
      const probeBinary = (candidates: string[]): Promise<{ status: "ok" | "error"; message?: string }> => {
        return new Promise((resolve) => {
          let resolvedBin: string | null = null;
          for (const name of candidates) {
            resolvedBin = findExecutable(name, env);
            if (resolvedBin) break;
          }
          const cmd = resolvedBin || candidates[0];
          let settled = false;
          let stderr = "";
          const finish = (status: "ok" | "error", message?: string) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(message ? { status, message } : { status });
          };
          let child;
          try {
            child = spawn(cmd, ["--help"], {
              env,
              shell: isWin,
              stdio: ["ignore", "pipe", "pipe"],
            });
          } catch (err: any) {
            finish("error", err?.message || "Spawn failed");
            return;
          }
          const timer = setTimeout(() => {
            try {
              child.kill("SIGKILL");
            } catch {}
            finish("error", "Health check timed out");
          }, 8000);
          child.stderr?.on("data", (chunk: Buffer) => {
            stderr += chunk.toString();
          });
          child.on("error", (err: any) => {
            finish("error", err?.message || "Execution failed");
          });
          child.on("close", (code) => {
            if (code === 0) {
              finish("ok");
            } else {
              finish("error", stderr.trim() || `Exited with code ${code}`);
            }
          });
        });
      };

      const [agy, claude, kiro] = await Promise.all([
        probeBinary(["agy"]),
        probeBinary(["claude"]),
        probeBinary(["kiro-cli", "kiro"]),
      ]);

      this.cachedHealth = { agy, claude, kiro };
    } catch (err: any) {
      console.warn(`[Worker] Health check warning: ${err.message}`);
    } finally {
      this.isCheckingHealth = false;
    }
  }

  private async updateWorkerCredits(): Promise<void> {
    if (this.isCheckingCredits) return;
    this.isCheckingCredits = true;
    try {
      const scriptPath = this.resolveScriptPath();
      if (!scriptPath) return;
      const env = getAgentSpawnEnv();
      const pythonBin =
        findExecutable("python3", env) ||
        findExecutable("python", env) ||
        (process.platform === "win32" ? "python" : "python3");
      const { stdout } = await execAsync(`"${pythonBin}" "${scriptPath}"`, {
        env,
        timeout: 180000,
      });
      const parsed = JSON.parse(stdout);
      parsed.updatedAt = new Date().toISOString();
      this.cachedQuota = parsed;
      console.log(`[Worker] Quota updated: Local credits refreshed.`);
    } catch (err: any) {
      console.warn(`[Worker] Credit fetch warning: ${err.message}`);
    } finally {
      this.isCheckingCredits = false;
    }
  }

  async start(): Promise<void> {
    console.log("==================================================");
    console.log("🚀 TaskDuo Autonomous Worker Daemon");
    console.log(`💻 Worker Name  : ${this.workerName}`);
    console.log(`⏱️  Poll Interval: ${this.pollIntervalMs}ms`);
    console.log("==================================================");

    void this.updateAgentHealth();
    void this.updateWorkerCredits();
    this.healthInterval = setInterval(() => void this.updateAgentHealth(), 60000);
    this.creditInterval = setInterval(() => void this.updateWorkerCredits(), 150000);

    while (!this.shouldStop) {
      if (!this.isBusy) {
        try {
          const response = await this.client.pollWorkerTasks({
            name: this.workerName,
            status: "idle",
            healthStatus: this.cachedHealth,
            quota: this.cachedQuota,
          });

          if ((response as any).refreshQuota) {
            void this.updateWorkerCredits();
          }

          if (response.tasks && response.tasks.length > 0) {
            const task = response.tasks[0];
            await this.executeTask(task);
          }
        } catch (err: any) {
          // Log network or auth issues with backoff
          console.warn(`[Worker] Poll failed: ${err.message}`);
        }
      }

      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }
  }

  private async executeTask(task: Task): Promise<void> {
    this.isBusy = true;
    console.log(`\n🎯 Starting task: [${task.id}] ${task.title}`);

    try {
      await this.client.startTask(task.id, `Worker '${this.workerName}' started processing.`);

      const agentType = (task.aiAgent?.toLowerCase() || "antigravity") as SupportedAgent;
      let prompt = task.content || task.description || task.title;
      const rawDods = typeof task.dods === "string" ? JSON.parse(task.dods) : task.dods;
      if (Array.isArray(rawDods) && rawDods.length > 0) {
        const dodList = rawDods
          .map((d: any, i: number) => `${i + 1}. [${d?.completed ? "x" : " "}] ${d?.text || d}`)
          .join("\n");
        prompt += `\n\n## Definition of Done (DoD)\n${dodList}\n\nPlease complete all DoD items and call task_complete(id: "${task.id}") when finished.`;
      }

      const rawProject = task.project as any;
      const projectLocalPath =
        typeof rawProject === "object" && rawProject?.localPath
          ? String(rawProject.localPath).replace(/^~/, os.homedir())
          : undefined;
      const targetCwd =
        projectLocalPath && fs.existsSync(projectLocalPath)
          ? projectLocalPath
          : os.homedir();

      const cmdConfig = buildAgentCommand(
        agentType,
        {
          prompt,
          model: task.aiModel,
          cwd: targetCwd,
        },
        {
          TASKDUO_TASK_ID: task.id,
        },
      );

      console.log(`🤖 Invoking agent: ${agentType} (${cmdConfig.cmd}) in ${targetCwd}`);

      const proc = spawn(cmdConfig.cmd, cmdConfig.args, {
        cwd: targetCwd,
        shell: cmdConfig.useShell,
        env: cmdConfig.env,
      });

      const formatter = new AgentStreamFormatter(agentType);
      let outputLogs = "";

      const timeoutMs = 30 * 60 * 1000;
      const timeoutTimer = setTimeout(() => {
        console.warn(`⏱️ [Worker] Task ${task.id} timed out after 30m. Terminating child process...`);
        outputLogs += `\n[System] Worker execution timed out after 30 minutes.\n`;
        try {
          proc.kill("SIGKILL");
        } catch {}
      }, timeoutMs);

      proc.stdout?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        const formatted = formatter.format(text);
        if (formatted) {
          process.stdout.write(formatted);
          outputLogs += formatted;
        }
      });

      proc.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        process.stderr.write(text);
        outputLogs += text;
      });

      const exitCode = await new Promise<number>((resolve) => {
        proc.on("close", (code, signal) => {
          clearTimeout(timeoutTimer);
          if (code === null || signal) {
            resolve(1);
            return;
          }
          resolve(code);
        });
        proc.on("error", (err) => {
          clearTimeout(timeoutTimer);
          console.error(`❌ Process error:`, err);
          resolve(1);
        });
      });

      outputLogs += formatter.flush();

      const hasStreamErrorOrTimeout =
        /\[完了\] ステータス:\s*(?:ERROR|FAILURE|FAILED|TIMEOUT|ABORTED|CANCELLED)\b|\[agy\]\s*print timeout after\b|\[System\] Worker execution timed out/i.test(
          outputLogs,
        );

      if (exitCode === 0) {
        const latestTask = await this.client.getTask(task.id);
        if (
          latestTask.status === "ai_confirming" ||
          latestTask.status === "ai_done" ||
          latestTask.status === "ai_pending"
        ) {
          console.log(`✅ Task completed (${latestTask.status}).`);
          await this.client.updateTask(task.id, {
            result: latestTask.result || outputLogs,
          });
        } else if (hasStreamErrorOrTimeout) {
          console.warn(
            `⚠️ Task process exited with 0, but stream error/timeout was detected without task_complete. Setting to ai_confirming...`,
          );
          await this.client.updateTask(task.id, {
            status: "ai_confirming",
            result: `${outputLogs}\n[System] 実行エラーまたはタイムアウトが検出されたため、ステータスを ai_confirming (確認中) に設定しました。`,
          });
        } else {
          console.log(`✅ Task completed successfully.`);
          await this.client.completeTask(task.id, outputLogs, undefined, {
            requiresHumanReview: (latestTask as any).reportRequired ?? true,
          });
        }
      } else {
        console.warn(`⚠️ Task ended with exit code ${exitCode}. Setting status to ai_confirming...`);
        await this.client.updateTask(task.id, {
          status: "ai_confirming",
          result: `${outputLogs}\n[System] 実行エラー (Exit Code: ${exitCode}) により異常終了したため、ステータスを ai_confirming (確認中) に設定しました。`,
        });
      }
    } catch (err: any) {
      console.error(`❌ Error executing task ${task.id}:`, err);
    } finally {
      this.isBusy = false;
    }
  }
}
