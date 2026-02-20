import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import type { ProjectConfig } from "../src/types.js";
import { JsonlEventLogger } from "../src/events/jsonlLogger.js";
import { PluginRegistry } from "../src/plugins/registry.js";
import { runDefaultPipeline } from "../src/workflow/defaultPipeline.js";

describe("widget plugins", () => {
  it("writes widget artifacts after pipeline run", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "ma-office-widget-"));
    const runId = "run-widget-plugin";
    const runDir = join(projectPath, "runs", runId);
    await mkdir(runDir, { recursive: true });

    const logger = new JsonlEventLogger(join(runDir, "events.jsonl"));
    await logger.init();

    const registry = new PluginRegistry();
    registry.add({
      name: "events-widget",
      apiVersion: "v1",
      kind: "widget",
      widgetName: "events",
      compute: async (events, artifacts) => ({
        eventCount: events.length,
        artifactCount: artifacts.length
      })
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
      goal: "widget plugin test",
      config,
      logger,
      codexMock: true,
      registry
    });

    const widgetPath = join(runDir, "artifacts", "widget_events.json");
    const widgetRaw = await readFile(widgetPath, "utf8");
    const widget = JSON.parse(widgetRaw) as { eventCount?: number };

    expect(widget.eventCount).toBeGreaterThan(0);

    const events = await logger.readAll();
    expect(
      events.some(
        (event) =>
          event.type === "artifact_created" &&
          (event.payload as { artifactType?: string })?.artifactType === "widget"
      )
    ).toBe(true);
  });
});
