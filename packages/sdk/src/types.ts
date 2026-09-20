/**
 * @taskduo/sdk - Core Type Definitions
 * Copyright 2026 TaskDuo Authors
 * Licensed under the Apache License, Version 2.0
 */

export type TaskStatus =
  | "ai_todo"
  | "ai_in_progress"
  | "ai_pending"
  | "ai_confirming"
  | "ai_done"
  | "human_todo"
  | "human_done";

export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface TaskDoD {
  id?: string;
  text: string;
  completed: boolean;
}

export interface TaskArtifact {
  title: string;
  type: string;
  content: string;
}

export interface HumanConfirmation {
  question: string;
  options?: string[];
  response?: string;
  confirmedAt?: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  content?: string;
  status: TaskStatus;
  priority: TaskPriority;
  category?: string;
  projectId?: string;
  project?: string;
  stepId?: string;
  step?: {
    id: string;
    name: string;
    color?: string;
  };
  aiAgent?: string;
  aiModel?: string;
  worker?: string;
  dods?: TaskDoD[];
  artifacts?: TaskArtifact[];
  humanConfirmations?: HumanConfirmation[] | null;
  result?: string;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  content?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  category?: string;
  projectId?: string;
  stepId?: string;
  aiAgent?: string;
  aiModel?: string;
  dods?: TaskDoD[];
  dueDate?: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  content?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  category?: string;
  projectId?: string;
  stepId?: string;
  aiAgent?: string;
  aiModel?: string;
  dods?: TaskDoD[];
  artifacts?: TaskArtifact[];
  humanConfirmations?: HumanConfirmation[] | null;
  result?: string;
  dueDate?: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  color?: string;
  projectId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Step {
  id: string;
  name: string;
  description?: string;
  color?: string;
  projectId: string;
  dependsOnId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkerPollPayload {
  name: string;
  status: "idle" | "busy";
  healthStatus?: Record<string, { status: "ok" | "error"; message?: string }>;
  quota?: Record<string, unknown>;
}

export interface WorkerPollResponse {
  tasks: Task[];
  command?: "stop" | "restart" | "noop";
}

export interface ClientConfig {
  baseUrl?: string;
  apiKey?: string;
  token?: string;
  timeoutMs?: number;
}
