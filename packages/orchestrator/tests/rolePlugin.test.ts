import { mkdtemp, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import type { ProjectConfig } from "../src/types.js";
import { JsonlEventLogger } from "../src/events/jsonlLogger.js";
import { PluginRegistry } from "../src/plugins/registry.js";
import { runDefaultPipeline } from "../src/workflow/defaultPipeline.js";

describe("role plugins", () => {
  it("can replace default stage behavior", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "ma-office-role-"));
    const runId = "run-role-plugin";
    const runDir = join(projectPath, "runs", runId);
    await mkdir(runDir, { recursive: true });

    const logger = new JsonlEventLogger(join(runDir, "events.jsonl"));
    await logger.init();

    const registry = new PluginRegistry();
    registry.add({
      name: "implement-replacer",
      apiVersion: "v1",
      kind: "role",
      roleName: "implement",
      replaceDefault: true,
      createAgent: async (ctx) => {
        await ctx.emit({
          id: randomUUID(),
          runId: ctx.runId,
          ts: new Date().toISOString(),
          level: "info",
          type: "agent_status",
          stage: ctx.stageName,
          payload: {
            status: "done",
            message: "custom implement role executed"
          }
        });
      }
    });

    const config: ProjectConfig = {
      base_branch: "main",
      test_cmd: "true",
      lint_cmd: "true",
      format_cmd: "true",
      pr_template: ".github/pull_request_template.md",
      package_manager: "pnpm"
    };

    await runDefaultPipeline({
      runId,
      runDir,
      projectPath,
      goal: "role plugin replacement test",
      config,
      logger,
      codexMock: true,
      registry
    });

    const events = await logger.readAll();
    const implementCodexCalls = events.filter(
      (event) =>
        event.type === "tool_call_started" &&
        event.stage === "IMPLEMENT" &&
        (event.payload as { tool?: string })?.tool === "codex-mcp"
    );

    expect(implementCodexCalls).toHaveLength(0);
    expect(
      events.some(
        (event) =>
          event.type === "agent_status" && (event.payload as { message?: string })?.message === "custom implement role executed"
      )
    ).toBe(true);
  });
});
