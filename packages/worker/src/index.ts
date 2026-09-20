/**
 * @taskduo/worker
 * Autonomous AI Agent Worker Daemon for TaskDuo
 * Copyright 2026 TaskDuo Authors
 * Licensed under the Apache License, Version 2.0
 */

import { WorkerRunner } from "./runner.js";

export * from "./runner.js";
export * from "./commandBuilder.js";
export * from "./streamFormatter.js";

export async function startWorker(): Promise<void> {
  const runner = new WorkerRunner();

  process.on("SIGINT", () => {
    console.log("\nReceived SIGINT. Gracefully shutting down worker...");
    runner.stop();
  });

  process.on("SIGTERM", () => {
    console.log("\nReceived SIGTERM. Gracefully shutting down worker...");
    runner.stop();
  });

  await runner.start();
}
