import { mkdtemp, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import type { ProjectConfig } from "../src/types.js";
import { JsonlEventLogger } from "../src/events/jsonlLogger.js";
import { runDefaultPipeline } from "../src/workflow/defaultPipeline.js";

describe("built-in policy guardrails", () => {
  it("blocks forbidden stage from project policy", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "ma-office-policy-"));
    const runId = "run-policy-forbidden";
    const runDir = join(projectPath, "runs", runId);
    await mkdir(runDir, { recursive: true });

    const logger = new JsonlEventLogger(join(runDir, "events.jsonl"));
    await logger.init();

    const config: ProjectConfig = {
      base_branch: "main",
      test_cmd: "true",
      lint_cmd: "true",
      format_cmd: "true",
      pr_template: ".github/pull_request_template.md",
      package_manager: "pnpm",
      policies: {
        forbidden_stages: ["REVIEW"],
        require_test_stage_before_github: true
      }
    };

    await runDefaultPipeline({
      runId,
      runDir,
      projectPath,
      goal: "policy guardrail test",
      config,
      logger,
      codexMock: true
    });

    const events = await logger.readAll();
    expect(
      events.some(
        (event) =>
          event.type === "agent_status" &&
          event.stage === "REVIEW" &&
          (event.payload as { status?: string })?.status === "blocked"
      )
    ).toBe(true);
    expect(events.some((event) => event.type === "run_finished")).toBe(true);
  });
});
