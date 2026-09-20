/**
 * @taskduo/sdk - TaskDuoClient
 * Copyright 2026 TaskDuo Authors
 * Licensed under the Apache License, Version 2.0
 */

import {
  ClientConfig,
  CreateTaskInput,
  Project,
  Task,
  UpdateTaskInput,
  WorkerPollPayload,
  WorkerPollResponse,
} from "./types.js";

export class TaskDuoClient {
  private baseUrl: string;
  private apiKey?: string;
  private token?: string;
  private timeoutMs: number;

  constructor(config: ClientConfig = {}) {
    const rawUrl =
      config.baseUrl ||
      (typeof process !== "undefined" && process.env?.TASKDUO_API_URL) ||
      (typeof process !== "undefined" && process.env?.TODO_API_URL) ||
      "http://localhost:43000";

    this.baseUrl = rawUrl.replace(/\/+$/, "");
    this.apiKey =
      config.apiKey ||
      (typeof process !== "undefined" && process.env?.TASKDUO_API_KEY) ||
      (typeof process !== "undefined" && process.env?.TODO_API_KEY) ||
      undefined;
    this.token = config.token;
    this.timeoutMs = config.timeoutMs || 10000;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (this.apiKey) {
      headers["x-api-key"] = this.apiKey;
    }
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    return headers;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          ...this.getHeaders(),
          ...(options.headers as Record<string, string>),
        },
      });

      if (!response.ok) {
        let errMessage = `HTTP ${response.status} ${response.statusText}`;
        try {
          const body = (await response.json()) as any;
          if (body?.message || body?.error) {
            errMessage = body.message || body.error;
          }
        } catch {
          // ignore json parse error
        }
        throw new Error(`[TaskDuoClient] ${errMessage} (${url})`);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Health ──────────────────────────────────────────────────────────────
  async checkHealth(): Promise<{ ok: boolean; status?: string }> {
    try {
      await this.request<{ status: string }>("/health");
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  // ── Tasks ───────────────────────────────────────────────────────────────
  async listTasks(params: {
    status?: string;
    projectId?: string;
    limit?: number;
  } = {}): Promise<Task[]> {
    const query = new URLSearchParams();
    if (params.status) query.set("status", params.status);
    if (params.projectId) query.set("projectId", params.projectId);
    if (params.limit) query.set("limit", String(params.limit));

    const qs = query.toString();
    const data = await this.request<{ tasks: Task[] } | Task[]>(
      `/api/tasks${qs ? `?${qs}` : ""}`
    );
    return Array.isArray(data) ? data : data.tasks || [];
  }

  async getTask(id: string): Promise<Task> {
    return this.request<Task>(`/api/tasks/${id}`);
  }

  async createTask(input: CreateTaskInput): Promise<Task> {
    return this.request<Task>("/api/tasks", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
    return this.request<Task>(`/api/tasks/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  async deleteTask(id: string): Promise<void> {
    await this.request<void>(`/api/tasks/${id}`, {
      method: "DELETE",
    });
  }

  async startTask(id: string, planSummary?: string): Promise<Task> {
    return this.updateTask(id, {
      status: "ai_in_progress",
      result: planSummary ? `## [Started]\n${planSummary}\n` : undefined,
    });
  }

  async completeTask(
    id: string,
    resultSummary: string,
    dods?: { text: string; completed: boolean }[]
  ): Promise<Task> {
    const task = await this.getTask(id);
    const updatedDods = dods || (task.dods || []).map((d) => ({ ...d, completed: true }));

    return this.updateTask(id, {
      status: "ai_done",
      result: resultSummary,
      dods: updatedDods,
    });
  }

  // ── Projects ────────────────────────────────────────────────────────────
  async listProjects(): Promise<Project[]> {
    const data = await this.request<{ projects: Project[] } | Project[]>("/api/projects");
    return Array.isArray(data) ? data : data.projects || [];
  }

  // ── Worker Long-Polling ─────────────────────────────────────────────────
  async pollWorkerTasks(payload: WorkerPollPayload): Promise<WorkerPollResponse> {
    return this.request<WorkerPollResponse>("/api/workers/tasks", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }
}
