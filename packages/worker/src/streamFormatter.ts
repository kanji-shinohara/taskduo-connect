/**
 * @taskduo/worker - AgentStreamFormatter
 * Copyright 2026 TaskDuo Authors
 * Licensed under the Apache License, Version 2.0
 */

export type SupportedAgent = "antigravity" | "claude" | "kiro" | "cursor" | "generic";

export class AgentStreamFormatter {
  private agent: SupportedAgent;
  private buffer: string = "";

  constructor(agent: SupportedAgent) {
    this.agent = agent;
  }

  format(chunk: string): string {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    const formattedLines = lines.map((line) => this.formatLine(line));
    return formattedLines.length > 0 ? formattedLines.join("\n") + "\n" : "";
  }

  flush(): string {
    if (!this.buffer) return "";
    const res = this.formatLine(this.buffer);
    this.buffer = "";
    return res;
  }

  private formatLine(line: string): string {
    const trimmed = line.trim();
    if (!trimmed) return line;

    // Filter noisy escape sequences or JSON events
    if (trimmed.startsWith("{\"event\":") || trimmed.startsWith("{\"type\":")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.step_update?.state) {
          return `[${new Date().toISOString().slice(11, 19)}] 🔄 State: ${parsed.step_update.state}`;
        }
      } catch {
        // not valid json, pass through
      }
    }

    return line;
  }
}
