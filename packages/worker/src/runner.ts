/**
 * @taskduo/worker - WorkerRunner
 * Copyright 2026 TaskDuo Authors
 * Licensed under the Apache License, Version 2.0
 */

import { spawn } from "node:child_process";
import os from "node:os";
import { TaskDuoClient, Task } from "@taskduo/sdk";
import { buildAgentCommand } from "./commandBuilder.js";
import { AgentStreamFormatter, SupportedAgent } from "./streamFormatter.js";

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
  }

  async start(): Promise<void> {
    console.log("==================================================");
    console.log("🚀 TaskDuo Autonomous Worker Daemon");
    console.log(`💻 Worker Name  : ${this.workerName}`);
    console.log(`⏱️  Poll Interval: ${this.pollIntervalMs}ms`);
    console.log("==================================================");

    while (!this.shouldStop) {
      if (!this.isBusy) {
        try {
          const response = await this.client.pollWorkerTasks({
            name: this.workerName,
            status: "idle",
          });

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
      const prompt = task.content || task.title;

      const cmdConfig = buildAgentCommand(agentType, {
        prompt,
        model: task.aiModel,
      });

      console.log(`🤖 Invoking agent: ${agentType} (${cmdConfig.cmd})`);

      const proc = spawn(cmdConfig.cmd, cmdConfig.args, {
        shell: cmdConfig.useShell,
        env: cmdConfig.env,
      });

      const formatter = new AgentStreamFormatter(agentType);
      let outputLogs = "";

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
        proc.on("close", (code) => resolve(code ?? 0));
        proc.on("error", (err) => {
          console.error(`❌ Process error:`, err);
          resolve(1);
        });
      });

      outputLogs += formatter.flush();

      if (exitCode === 0) {
        console.log(`✅ Task completed successfully.`);
        await this.client.completeTask(task.id, outputLogs);
      } else {
        console.warn(`⚠️ Task ended with exit code ${exitCode}. Updating status...`);
        await this.client.updateTask(task.id, {
          status: "ai_pending",
          result: outputLogs,
        });
      }
    } catch (err: any) {
      console.error(`❌ Error executing task ${task.id}:`, err);
    } finally {
      this.isBusy = false;
    }
  }
}
