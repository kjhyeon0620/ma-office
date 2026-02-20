import { mkdtemp, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import type { ProjectConfig } from "../src/types.js";
import { JsonlEventLogger } from "../src/events/jsonlLogger.js";
import { runDefaultPipeline } from "../src/workflow/defaultPipeline.js";

describe("retry policy", () => {
  it("retries failed stage up to configured limit", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "ma-office-retry-"));
    const runId = "run-retry";
    const runDir = join(projectPath, "runs", runId);
    await mkdir(runDir, { recursive: true });

    const logger = new JsonlEventLogger(join(runDir, "events.jsonl"));
    await logger.init();

    const config: ProjectConfig = {
      base_branch: "main",
      test_cmd: "bash -lc 'if [ -f .retry_once ]; then echo ok; else touch .retry_once; echo fail >&2; exit 1; fi'",
      lint_cmd: "true",
      format_cmd: "true",
      pr_template: ".github/pull_request_template.md",
      package_manager: "pnpm",
      policies: {
        forbidden_stages: ["GITHUB"],
        require_test_stage_before_github: true,
        max_retries_per_stage: 1
      }
    };

    await runDefaultPipeline({
      runId,
      runDir,
      projectPath,
      goal: "retry policy test",
      config,
      logger,
      codexMock: true
    });

    const events = await logger.readAll();
    const testStarts = events.filter(
      (event) => event.type === "tool_call_started" && event.stage === "TEST" && (event.payload as { tool?: string })?.tool === "test_cmd"
    );

    expect(testStarts).toHaveLength(2);
    expect(
      events.some(
        (event) =>
          event.type === "agent_status" &&
          event.stage === "TEST" &&
          String((event.payload as { message?: string })?.message ?? "").includes("retry 1/1")
      )
    ).toBe(true);
  });
});
