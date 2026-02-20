export type ManualFallback = {
  cwd: string;
  commands: string[];
  notes: string;
};

export type McpTelemetry = {
  requestId: string;
  tool: string;
  state: "starting" | "ready" | "running" | "done" | "blocked" | "error";
  durationMs?: number;
  errorCode?: string;
  tools?: string[];
};

export type EngineActionResult = {
  summary: string;
  output?: string;
  mcp?: McpTelemetry;
};

export type EngineActionError = Error & {
  status?: "blocked" | "error";
  errorCode?: string;
  mcp?: McpTelemetry;
  manual?: ManualFallback;
};

export type EngineAdapterContext = {
  runId: string;
  goal: string;
  projectPath: string;
  workdir: string;
  stage: string;
  testCommand?: string;
};

export interface EngineAdapter {
  readonly name: string;
  initialize(): Promise<{ tools: string[]; mcp: McpTelemetry }>;
  planSpec?(context: EngineAdapterContext): Promise<EngineActionResult>;
  editFiles(context: EngineAdapterContext): Promise<EngineActionResult>;
  runCommands(context: EngineAdapterContext): Promise<EngineActionResult>;
  review?(context: EngineAdapterContext): Promise<EngineActionResult>;
  gitOps?(context: EngineAdapterContext): Promise<EngineActionResult>;
  shutdown(): Promise<void>;
}
