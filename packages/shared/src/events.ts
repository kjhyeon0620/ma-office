import { z } from "zod";

export const EventTypeSchema = z.enum([
  "run_started",
  "run_finished",
  "agent_spawned",
  "agent_status",
  "stage_started",
  "stage_finished",
  "tool_call_started",
  "tool_call_finished",
  "artifact_created",
  "cost_update"
]);

export const AgentStatusSchema = z.enum(["working", "done", "blocked", "error"]);

const EventBaseSchema = z.object({
  id: z.string(),
  runId: z.string(),
  ts: z.string(),
  level: z.enum(["info", "warn", "error"]).default("info"),
  type: EventTypeSchema,
  stage: z.string().optional(),
  agentId: z.string().optional()
});

const AgentSpawnedSchema = EventBaseSchema.extend({
  type: z.literal("agent_spawned"),
  payload: z.object({
    agentId: z.string(),
    role: z.string(),
    task: z.string()
  })
});

const AgentStatusEventSchema = EventBaseSchema.extend({
  type: z.literal("agent_status"),
  payload: z.object({
    status: AgentStatusSchema,
    message: z.string().optional()
  })
});

const ToolCallEventSchema = EventBaseSchema.extend({
  type: z.union([z.literal("tool_call_started"), z.literal("tool_call_finished")]),
  payload: z.object({
    tool: z.string(),
    summary: z.string()
  })
});

const ArtifactEventSchema = EventBaseSchema.extend({
  type: z.literal("artifact_created"),
  payload: z.object({
    artifactType: z.string(),
    path: z.string(),
    summary: z.string(),
    url: z.string().optional()
  })
});

const CostEventSchema = EventBaseSchema.extend({
  type: z.literal("cost_update"),
  payload: z.object({
    model: z.string(),
    tokensIn: z.number().int().nonnegative(),
    tokensOut: z.number().int().nonnegative(),
    estimatedCost: z.number().nonnegative().optional()
  })
});

const GenericEventSchema = EventBaseSchema.extend({
  type: z.union([
    z.literal("run_started"),
    z.literal("run_finished"),
    z.literal("stage_started"),
    z.literal("stage_finished")
  ]),
  payload: z.record(z.string(), z.unknown()).optional()
});

export const RunEventSchema = z.union([
  GenericEventSchema,
  AgentSpawnedSchema,
  AgentStatusEventSchema,
  ToolCallEventSchema,
  ArtifactEventSchema,
  CostEventSchema
]);

export type EventType = z.infer<typeof EventTypeSchema>;
export type AgentStatus = z.infer<typeof AgentStatusSchema>;
export type RunEvent = z.infer<typeof RunEventSchema>;

export function parseRunEvent(input: unknown): RunEvent {
  return RunEventSchema.parse(input);
}
