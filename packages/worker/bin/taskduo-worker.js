#!/usr/bin/env node
import { startWorker } from "../dist/index.js";

startWorker().catch((error) => {
  console.error("Fatal error running TaskDuo Worker:", error);
  process.exit(1);
});
