import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import type { ProjectConfig } from "../src/types.js";
import { JsonlEventLogger } from "../src/events/jsonlLogger.js";
import { runDefaultPipeline } from "../src/workflow/defaultPipeline.js";
import type { EngineAdapter, EngineAdapterContext, EngineActionResult, McpTelemetry } from "../src/engines/types.js";
import type { RuntimeConfig } from "../src/runtime/runtimeConfig.js";

function baseConfig(): ProjectConfig {
  return {
    base_branch: "main",
    test_cmd: "pnpm test",
    lint_cmd: "true",
    format_cmd: "true",
    pr_template: ".github/pull_request_template.md",
    package_manager: "pnpm",
    policies: {
      forbidden_stages: ["REVIEW"],
      require_test_stage_before_github: true,
      max_retries_per_stage: 0
    }
  };
}

function runtimeConfig(projectPath: string): RuntimeConfig {
  return {
    mode: "real",
    mcpTransport: "stdio",
    mcpCommand: "codex mcp-server",
    workdir: projectPath,
    baseBranch: "main"
  };
}

class SuccessEngineAdapter implements EngineAdapter {
  readonly name = "codex";

  async initialize(): Promise<{ tools: string[]; mcp: McpTelemetry }> {
    return {
      tools: ["codex", "codex-reply"],
      mcp: {
        requestId: "init-1",
        tool: "tools/list",
        state: "ready",
        tools: ["codex", "codex-reply"]
      }
    };
  }

  async editFiles(_context: EngineAdapterContext): Promise<EngineActionResult> {
    return {
      summary: "IMPLEMENT via codex adapter",
      output: "edited files",
      mcp: { requestId: "impl-1", tool: "codex", state: "done", durationMs: 100 }
    };
  }

  async runCommands(context: EngineAdapterContext): Promise<EngineActionResult> {
    return {
      summary: `TEST via codex adapter: ${context.testCommand}`,
      output: "tests passed",
      mcp: { requestId: "test-1", tool: "codex", state: "done", durationMs: 110 }
    };
  }

  async shutdown(): Promise<void> {
    return;
  }
}

class TimeoutEngineAdapter extends SuccessEngineAdapter {
  override async editFiles(_context: EngineAdapterContext): Promise<EngineActionResult> {
    const err = new Error("MCP request timeout for tools/call") as Error & {
      status?: "blocked";
      errorCode?: string;
      mcp?: McpTelemetry;
    };
    err.status = "blocked";
    err.errorCode = "MCP_TIMEOUT";
    err.mcp = {
      requestId: "impl-timeout",
      tool: "codex",
      state: "blocked",
      errorCode: "MCP_TIMEOUT"
    };
    throw err;
  }
}

describe("real mode pipeline", () => {
  it("routes IMPLEMENT and TEST through Codex adapter", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "ma-office-real-success-"));
    const runId = "run-real-success";
    const runDir = join(projectPath, "runs", runId);
    await mkdir(runDir, { recursive: true });

    const logger = new JsonlEventLogger(join(runDir, "events.jsonl"));
    await logger.init();

    await runDefaultPipeline({
      runId,
      runDir,
      projectPath,
      goal: "real mode implement/test",
      config: baseConfig(),
      logger,
      runtimeConfig: runtimeConfig(projectPath),
      engineAdapter: new SuccessEngineAdapter()
    });

    const events = await logger.readAll();
    const implementCall = events.find(
      (event) => event.type === "tool_call_finished" && event.stage === "IMPLEMENT" && (event.payload as { tool?: string })?.tool === "codex-mcp"
    );
    const testCall = events.find(
      (event) => event.type === "tool_call_finished" && event.stage === "TEST" && (event.payload as { tool?: string })?.tool === "codex-mcp"
    );
    const testArtifact = events.find(
      (event) => event.type === "artifact_created" && event.stage === "TEST" && (event.payload as { artifactType?: string })?.artifactType === "test_summary"
    );
    const startupNote = events.find((event) => event.type === "agent_note" && String((event.payload as { message?: string })?.message).includes("Codex MCP connected"));

    expect(implementCall).toBeTruthy();
    expect(testCall).toBeTruthy();
    expect(testArtifact).toBeTruthy();
    expect(startupNote).toBeTruthy();
  });

  it("maps MCP timeout to blocked status with fallback note", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "ma-office-real-timeout-"));
    const runId = "run-real-timeout";
    const runDir = join(projectPath, "runs", runId);
    await mkdir(runDir, { recursive: true });

    const logger = new JsonlEventLogger(join(runDir, "events.jsonl"));
    await logger.init();

    await runDefaultPipeline({
      runId,
      runDir,
      projectPath,
      goal: "timeout mapping",
      config: baseConfig(),
      logger,
      runtimeConfig: runtimeConfig(projectPath),
      engineAdapter: new TimeoutEngineAdapter()
    });

    const events = await logger.readAll();
    expect(
      events.some(
        (event) =>
          event.type === "agent_status" &&
          event.stage === "IMPLEMENT" &&
          (event.payload as { status?: string })?.status === "blocked"
      )
    ).toBe(true);

    expect(
      events.some(
        (event) =>
          event.type === "agent_note" &&
          event.stage === "IMPLEMENT" &&
          String((event.payload as { message?: string })?.message).includes("IMPLEMENT blocked/error")
      )
    ).toBe(true);

    const raw = await readFile(join(runDir, "events.jsonl"), "utf8");
    expect(raw).toContain("\"mcp\"");
    expect(raw).toContain("\"manual\"");
    expect(raw).toContain(`--project \\\"${projectPath}\\\"`);
    expect(raw).toContain("MA_OFFICE_WORKDIR=");
  });
});
