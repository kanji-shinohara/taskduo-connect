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

export function sanitizeModelName(
  agent: SupportedAgent,
  rawModel?: string | null,
): string | undefined {
  if (!rawModel) return undefined;
  let model = rawModel.trim();
  if (!model) return undefined;

  if (model.includes("\t")) {
    const parts = model.split("\t");
    const candidateId = parts[0].trim();
    model = candidateId || parts[parts.length - 1].trim();
  }

  const multiSpaceParts = model.split(/\s{2,}/);
  if (multiSpaceParts.length >= 2) {
    const firstPart = multiSpaceParts[0].trim();
    if (/^[a-zA-Z0-9._-]+$/.test(firstPart)) {
      model = firstPart;
    }
  }

  const parenMatch = model.match(/\(([^)]+)\)/);
  if (parenMatch && parenMatch[1].trim()) {
    const inside = parenMatch[1].trim();
    const isEffortOnly = /^(?:high|medium|low|xhigh|max)$/i.test(inside);
    if (!isEffortOnly && /^[a-zA-Z0-9._-]+$/.test(inside) && (inside.includes("-") || inside.includes("."))) {
      model = inside;
    }
  }

  if (agent === "antigravity") {
    const lower = model.toLowerCase();
    if (/^(?:gemini|claude|gpt)-[a-z0-9._-]+$/.test(lower)) {
      return lower;
    }

    const isHigh = lower.includes("high");
    const isLow = lower.includes("low");
    const suffix = isHigh ? "high" : isLow ? "low" : "medium";

    if (
      lower.includes("argon") ||
      lower.includes("gemini-4") ||
      lower.includes("gemini 4")
    ) {
      return `gemini-4-argon-${suffix}`;
    }
    if (lower.includes("opus")) {
      return `claude-opus-5-5-${suffix}`;
    }
    if (lower.includes("sonnet") || lower.includes("claude")) {
      return `claude-sonnet-5-5-${suffix}`;
    }
    if (
      lower.includes("flash") ||
      lower.includes("3.8") ||
      lower.includes("3.6") ||
      lower.includes("gemini")
    ) {
      return `gemini-3.8-flash-${suffix}`;
    }
  }

  return model;
}

export function buildAgentCommand(
  agent: SupportedAgent,
  options: AgentExecutionOptions,
  extraEnv?: Record<string, string | undefined>
): AgentCommandConfig {
  const env = getAgentSpawnEnv(extraEnv);
  const isWin = process.platform === "win32";
  const resolvedModel = sanitizeModelName(agent, options.model);

  switch (agent) {
    case "claude": {
      const cmd = findExecutable("claude", env) || "claude";
      const args = [
        "-p",
        options.prompt,
        "--output-format",
        "stream-json",
        "--dangerously-skip-permissions",
      ];
      if (resolvedModel) {
        args.push("--model", resolvedModel);
      }
      return { cmd, args, useShell: isWin, env };
    }

    case "kiro": {
      const cmd = findExecutable("kiro-cli", env) || findExecutable("kiro", env) || "kiro-cli";
      const args = ["-p", options.prompt, "--output-format", "stream-json"];
      if (resolvedModel) {
        args.push("--model", resolvedModel);
      }
      return { cmd, args, useShell: isWin, env };
    }

    case "antigravity":
    default: {
      const cmd = findExecutable("agy", env) || "agy";
      const args: string[] = [];
      if (options.cwd && fs.existsSync(options.cwd)) {
        const resolvedCwd = path.resolve(options.cwd);
        args.push("--log-file", path.join(resolvedCwd, "agy_cli.log"));
        if (resolvedCwd !== path.resolve(os.homedir())) {
          args.push("--add-dir", resolvedCwd);
        }
      }
      if (resolvedModel) {
        args.push("--model", resolvedModel);
      }
      const hasEffortInModel = Boolean(
        resolvedModel && /-(?:high|medium|low|xhigh|max)$/i.test(resolvedModel),
      );
      if (options.effort && !hasEffortInModel) {
        args.push("--effort", options.effort);
      }
      if (options.timeout) {
        args.push("--print-timeout", options.timeout);
      }
      args.push("--dangerously-skip-permissions");
      args.push("--output-format", "stream-json");
      args.push("--print", options.prompt);
      return { cmd, args, useShell: isWin, env };
    }
  }
}
