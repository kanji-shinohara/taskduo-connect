/**
 * @taskduo/worker - AgentCommandBuilder
 * Copyright 2026 TaskDuo Authors
 * Licensed under the Apache License, Version 2.0
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SupportedAgent } from "./streamFormatter.js";

export interface AgentExecutionOptions {
  prompt: string;
  model?: string | null;
  effort?: "low" | "medium" | "high" | null;
  timeout?: string;
  project?: string | null;
  cwd?: string;
}

export interface AgentCommandConfig {
  cmd: string;
  args: string[];
  useShell: boolean;
  env: Record<string, string>;
}

export function getAgentSpawnEnv(extraEnv?: Record<string, string | undefined>): Record<string, string> {
  const isWin = process.platform === "win32";
  const pathSeparator = isWin ? ";" : ":";
  const userHome = os.homedir();

  const standardSearchDirs = isWin
    ? [
        path.dirname(process.execPath),
        path.join(userHome, "AppData", "Roaming", "npm"),
        path.join(userHome, ".local", "bin"),
        path.join(userHome, ".antigravity", "antigravity", "bin"),
        "C:\\Program Files\\nodejs",
      ]
    : [
        path.dirname(process.execPath),
        path.join(userHome, ".local", "bin"),
        path.join(userHome, ".antigravity", "antigravity", "bin"),
        "/opt/homebrew/bin",
        "/opt/homebrew/sbin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
      ];

  // Dynamic nvm detection
  if (!isWin) {
    const nvmDir = path.join(userHome, ".nvm", "versions", "node");
    if (fs.existsSync(nvmDir)) {
      try {
        const versions = fs.readdirSync(nvmDir).sort();
        if (versions.length > 0) {
          const latest = versions[versions.length - 1];
          standardSearchDirs.unshift(path.join(nvmDir, latest, "bin"));
        }
      } catch {
        // ignore
      }
    }
  }

  const currentPath = process.env.PATH || "";
  const combinedPath = [...standardSearchDirs, currentPath].filter(Boolean).join(pathSeparator);

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    PATH: combinedPath,
  };

  if (extraEnv) {
    for (const [k, v] of Object.entries(extraEnv)) {
      if (v !== undefined) {
        env[k] = v;
      }
    }
  }

  return env;
}

export function findExecutable(name: string, env: Record<string, string>): string | null {
  const isWin = process.platform === "win32";
  const pathSep = isWin ? ";" : ":";
  const dirs = (env.PATH || "").split(pathSep);
  const exts = isWin ? [".exe", ".cmd", ".bat", ""] : [""];

  for (const dir of dirs) {
    for (const ext of exts) {
      const fullPath = path.join(dir, `${name}${ext}`);
      if (fs.existsSync(fullPath)) {
        try {
          fs.accessSync(fullPath, fs.constants.X_OK);
          return fullPath;
        } catch {
          // not executable
        }
      }
    }
  }
  return null;
}

export function buildAgentCommand(
  agent: SupportedAgent,
  options: AgentExecutionOptions,
  extraEnv?: Record<string, string | undefined>
): AgentCommandConfig {
  const env = getAgentSpawnEnv(extraEnv);
  const isWin = process.platform === "win32";

  switch (agent) {
    case "claude": {
      const cmd = findExecutable("claude", env) || "claude";
      const args = ["-p", options.prompt];
      if (options.model) {
        args.push("--model", options.model);
      }
      return { cmd, args, useShell: isWin, env };
    }

    case "kiro": {
      const cmd = findExecutable("kiro-cli", env) || "kiro-cli";
      const args = ["--prompt", options.prompt];
      return { cmd, args, useShell: isWin, env };
    }

    case "antigravity":
    default: {
      const cmd = findExecutable("agy", env) || "agy";
      const args = ["run", options.prompt];
      if (options.model) {
        args.push("--model", options.model);
      }
      return { cmd, args, useShell: isWin, env };
    }
  }
}
