#!/usr/bin/env node
import { startServer } from "../dist/index.js";

startServer().catch((error) => {
  console.error("Fatal error running TaskDuo MCP Server:", error);
  process.exit(1);
});
