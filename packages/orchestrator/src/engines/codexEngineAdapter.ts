import { randomUUID } from "node:crypto";
import { McpStdioClient, McpStdioClientError } from "../integrations/mcpStdioClient.js";
import type { EngineAdapter, EngineAdapterContext, EngineActionError, EngineActionResult, McpTelemetry } from "./types.js";

type CodexEngineAdapterOptions = {
  command: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  retries?: number;
};

function coerceCodexText(output: unknown): string {
  if (typeof output === "string") {
    return output;
  }

  if (Array.isArray(output)) {
    const firstText = output
      .map((item) => {
        if (item && typeof item === "object" && "text" in item && typeof (item as { text?: unknown }).text === "string") {
          return (item as { text: string }).text;
        }
        return "";
      })
      .find(Boolean);
    if (firstText) {
      return firstText;
    }
  }

  if (output && typeof output === "object") {
    const obj = output as { content?: unknown };
    if (typeof obj.content === "string") {
      return obj.content;
    }
    return JSON.stringify(output);
  }

  return "";
}

function rerunCommand(goal: string, projectPath: string, workdir: string): string {
  const escapedGoal = goal.replace(/"/g, '\\"');
  return `MA_OFFICE_WORKDIR="${workdir}" pnpm --filter @ma-office/orchestrator dev -- run --goal "${escapedGoal}" --project "${projectPath}" --config project.yaml`;
}

function asActionError(
  error: unknown,
  context: EngineAdapterContext,
  commands: string[],
  requestId: string,
  tool: string,
  mcpCommand: string
): EngineActionError {
  const manual = {
    cwd: context.workdir,
    commands: [...commands, rerunCommand(context.goal, context.projectPath, context.workdir)],
    notes: `Apply ${context.stage} changes manually for goal "${context.goal}", then rerun the workflow.`
  };

  if (error instanceof McpStdioClientError) {
    const status = error.code === "MCP_TRANSPORT" ? "error" : "blocked";
    const mapped = new Error(error.message) as EngineActionError;
    mapped.status = status;
    mapped.errorCode = error.code;
    mapped.mcp = {
      requestId,
      tool,
      state: status === "blocked" ? "blocked" : "error",
      errorCode: error.code
    };
    mapped.manual = manual;
    if (error.code === "MCP_APPROVAL") {
      mapped.manual = {
        cwd: context.workdir,
        commands: [mcpCommand, "codex login", ...manual.commands],
        notes: `MCP approval/auth blocked ${context.stage}. Resolve approval/auth, then rerun.`
      };
    }
    return mapped;
  }

  const fallback = new Error(error instanceof Error ? error.message : String(error)) as EngineActionError;
  fallback.status = "error";
  fallback.errorCode = "MCP_TRANSPORT";
  fallback.mcp = {
    requestId,
    tool,
    state: "error",
    errorCode: "MCP_TRANSPORT"
  };
  fallback.manual = manual;
  return fallback;
}

export class CodexEngineAdapter implements EngineAdapter {
  readonly name = "codex";
  private readonly client: McpStdioClient;

  constructor(private readonly options: CodexEngineAdapterOptions) {
    this.client = new McpStdioClient({
      command: options.command,
      cwd: options.cwd,
      env: options.env,
      timeoutMs: options.timeoutMs,
      retries: options.retries
    });
  }

  async initialize(): Promise<{ tools: string[]; mcp: McpTelemetry }> {
    const requestId = randomUUID();
    const started = Date.now();
    await this.client.start();
    const tools = await this.client.listTools();
    return {
      tools: tools.map((tool) => tool.name),
      mcp: {
        requestId,
        tool: "tools/list",
        state: "ready",
        durationMs: Date.now() - started,
        tools: tools.map((tool) => tool.name)
      }
    };
  }

  async editFiles(context: EngineAdapterContext): Promise<EngineActionResult> {
    const requestId = randomUUID();
    const started = Date.now();
    const tool = "codex";

    const prompt = [
      `You are executing MA Office stage ${context.stage}.`,
      `Goal: ${context.goal}`,
      "Make the minimal set of file edits required to complete IMPLEMENT stage.",
      "Return a concise summary of what changed."
    ].join("\n");

    try {
      const output = await this.client.callTool(tool, {
        prompt,
        cwd: context.workdir,
        sandbox: "workspace-write",
        "approval-policy": "on-request"
      });
      const content = coerceCodexText(output);
      return {
        summary: content || "Codex IMPLEMENT execution completed.",
        output: content,
        mcp: {
          requestId,
          tool,
          state: "done",
          durationMs: Date.now() - started
        }
      };
    } catch (error) {
      throw asActionError(error, context, ["git status", "git diff"], requestId, tool, this.options.command);
    }
  }

  async runCommands(context: EngineAdapterContext): Promise<EngineActionResult> {
    const requestId = randomUUID();
    const started = Date.now();
    const tool = "codex";
    const testCommand = context.testCommand ?? "pnpm test";

    const prompt = [
      `You are executing MA Office stage ${context.stage}.`,
      `Goal: ${context.goal}`,
      `Run this test command: ${testCommand}`,
      "If tests fail, report failure reasons and suggested fixes.",
      "Return command output summary."
    ].join("\n");

    try {
      const output = await this.client.callTool(tool, {
        prompt,
        cwd: context.workdir,
        sandbox: "workspace-write",
        "approval-policy": "on-request"
      });
      const content = coerceCodexText(output);
      return {
        summary: content || "Codex TEST execution completed.",
        output: content,
        mcp: {
          requestId,
          tool,
          state: "done",
          durationMs: Date.now() - started
        }
      };
    } catch (error) {
      throw asActionError(error, context, [testCommand], requestId, tool, this.options.command);
    }
  }

  async shutdown(): Promise<void> {
    await this.client.shutdown();
  }
}
