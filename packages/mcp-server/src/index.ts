/**
 * @taskduo/mcp-server
 * Official Model Context Protocol (MCP) server for TaskDuo
 * Copyright 2026 TaskDuo Authors
 * Licensed under the Apache License, Version 2.0
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TaskDuoClient, TaskDoD } from "@taskduo/sdk";
import { z } from "zod";

export async function startServer(): Promise<void> {
  const client = new TaskDuoClient();

  const server = new McpServer({
    name: "TaskDuo",
    version: "1.0.0",
  });

  // ── task_list ───────────────────────────────────────────────────────────
  server.tool(
    "task_list",
    "List tasks from TaskDuo with optional filtering by status and project.",
    {
      status: z.enum([
        "ai_todo",
        "ai_in_progress",
        "ai_pending",
        "ai_confirming",
        "ai_done",
        "human_todo",
        "human_done",
      ]).optional().describe("Filter by task status"),
      projectId: z.string().optional().describe("Filter by project ID"),
      limit: z.number().optional().describe("Limit number of tasks returned"),
    },
    async (args) => {
      try {
        const tasks = await client.listTasks(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(tasks, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to list tasks: ${err.message}` }],
        };
      }
    }
  );

  // ── task_get ────────────────────────────────────────────────────────────
  server.tool(
    "task_get",
    "Get detailed information of a specific task by its ID.",
    {
      id: z.string().describe("Task UUID"),
    },
    async (args) => {
      try {
        const task = await client.getTask(args.id);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(task, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to get task ${args.id}: ${err.message}` }],
        };
      }
    }
  );

  // ── task_create ─────────────────────────────────────────────────────────
  server.tool(
    "task_create",
    "Create a new task in TaskDuo. Definition of Done (DoD) is required.",
    {
      title: z.string().describe("Task title"),
      content: z.string().optional().describe("Detailed markdown description"),
      priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
      projectId: z.string().optional().describe("Project UUID"),
      category: z.string().optional().describe("Category name or ID"),
      dods: z.array(
        z.object({
          text: z.string().describe("Definition of done criteria"),
          completed: z.boolean().default(false),
        })
      ).describe("Structured Definition of Done criteria"),
    },
    async (args) => {
      try {
        const task = await client.createTask({
          title: args.title,
          content: args.content,
          priority: args.priority,
          projectId: args.projectId,
          category: args.category,
          status: "ai_todo",
          dods: args.dods,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(task, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to create task: ${err.message}` }],
        };
      }
    }
  );

  // ── task_start ──────────────────────────────────────────────────────────
  server.tool(
    "task_start",
    "Declare starting work on a task. Transitions status to 'ai_in_progress' and records execution plan.",
    {
      id: z.string().describe("Task UUID"),
      summary: z.string().describe("Summary of the implementation plan before starting work"),
    },
    async (args) => {
      try {
        const task = await client.startTask(args.id, args.summary);
        return {
          content: [
            {
              type: "text",
              text: `Task marked as 'ai_in_progress'. You may now proceed with work.\n\n${JSON.stringify(task, null, 2)}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to start task: ${err.message}` }],
        };
      }
    }
  );

  // ── task_complete ───────────────────────────────────────────────────────
  server.tool(
    "task_complete",
    "Declare completion of a task. Sets status to 'ai_done' and closes all Definition of Done items.",
    {
      id: z.string().describe("Task UUID"),
      summary: z.string().describe("Brief summary of accomplishments and verification"),
      result: z.string().optional().describe("Detailed execution result markdown"),
      dods: z.array(
        z.object({
          text: z.string(),
          completed: z.boolean(),
        })
      ).optional().describe("Updated DoD list with completed items"),
    },
    async (args) => {
      try {
        const resultText = args.result || args.summary;
        const task = await client.completeTask(args.id, resultText, args.dods);
        return {
          content: [
            {
              type: "text",
              text: `Task successfully marked as 'ai_done'.\n\n${JSON.stringify(task, null, 2)}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to complete task: ${err.message}` }],
        };
      }
    }
  );

  // ── task_update ─────────────────────────────────────────────────────────
  server.tool(
    "task_update",
    "Update an existing task in TaskDuo.",
    {
      id: z.string().describe("Task UUID"),
      title: z.string().optional(),
      content: z.string().optional(),
      status: z.enum([
        "ai_todo",
        "ai_in_progress",
        "ai_pending",
        "ai_confirming",
        "ai_done",
        "human_todo",
        "human_done",
      ]).optional(),
      priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
      result: z.string().optional(),
      dods: z.array(
        z.object({
          text: z.string(),
          completed: z.boolean(),
        })
      ).optional(),
    },
    async (args) => {
      try {
        const { id, ...updateData } = args;
        const task = await client.updateTask(id, updateData);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(task, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to update task: ${err.message}` }],
        };
      }
    }
  );

  // ── task_delete ─────────────────────────────────────────────────────────
  server.tool(
    "task_delete",
    "Delete a task by ID.",
    {
      id: z.string().describe("Task UUID"),
    },
    async (args) => {
      try {
        await client.deleteTask(args.id);
        return {
          content: [{ type: "text", text: `Task ${args.id} deleted successfully.` }],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to delete task: ${err.message}` }],
        };
      }
    }
  );

  // ── project_list ────────────────────────────────────────────────────────
  server.tool(
    "project_list",
    "List all accessible projects in TaskDuo.",
    {},
    async () => {
      try {
        const projects = await client.listProjects();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(projects, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to list projects: ${err.message}` }],
        };
      }
    }
  );

  // ── Start Transport ─────────────────────────────────────────────────────
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
