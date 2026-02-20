import type { RunEvent } from "./events.js";

export const PLUGIN_API_VERSION = "v1" as const;

export type PluginApiVersion = typeof PLUGIN_API_VERSION;

export type PluginBase = {
  name: string;
  apiVersion: PluginApiVersion;
};

export type RoleContext = {
  runId: string;
  goal: string;
  emit: (event: RunEvent) => Promise<void>;
};

export type RolePlugin = PluginBase & {
  kind: "role";
  roleName: string;
  createAgent: (context: RoleContext) => Promise<void>;
};

export type StageContext = {
  runId: string;
  stageName: string;
  goal: string;
};

export type StagePlugin = PluginBase & {
  kind: "stage";
  stageName: string;
  order?: {
    before?: string;
    after?: string;
  };
  run: (ctx: StageContext) => Promise<void>;
};

export type ToolPlugin = PluginBase & {
  kind: "tool";
  toolName: string;
  register: (registry: ToolRegistry) => Promise<void>;
};

export type PolicyPlugin = PluginBase & {
  kind: "policy";
  policyName: string;
  evaluate: (runState: RunState) => Promise<PolicyResult>;
};

export type WidgetPlugin = PluginBase & {
  kind: "widget";
  widgetName: string;
  compute: (events: RunEvent[], artifacts: string[]) => Promise<Record<string, unknown>>;
};

export type OfficePlugin = RolePlugin | StagePlugin | ToolPlugin | PolicyPlugin | WidgetPlugin;

export type ToolRegistry = {
  register: (toolName: string, metadata: Record<string, unknown>) => void;
};

export type RunState = {
  runId: string;
  stage: string;
  events: RunEvent[];
};

export type PolicyResult = {
  pass: boolean;
  reason?: string;
};
