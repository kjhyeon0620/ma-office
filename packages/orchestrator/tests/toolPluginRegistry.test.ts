import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import type { ToolPlugin } from "@ma-office/shared";
import { JsonlEventLogger } from "../src/events/jsonlLogger.js";
import { registerToolPlugins } from "../src/workflow/defaultPipeline.js";

describe("registerToolPlugins", () => {
  it("registers tools and emits tool call events", async () => {
    const runId = "run-tools";
    const dir = await mkdtemp(join(tmpdir(), "ma-office-tools-"));
    const logger = new JsonlEventLogger(join(dir, "events.jsonl"));
    await logger.init();

    const plugins: ToolPlugin[] = [
      {
        name: "sample-tool-plugin",
        apiVersion: "v1",
        kind: "tool",
        toolName: "sample-tool",
        register: async (registry) => {
          registry.register("sample-tool", { transport: "mcp", timeoutMs: 1000 });
        }
      }
    ];

    const tools = await registerToolPlugins(runId, logger, plugins);
    const events = await logger.readAll();

    expect(tools["sample-tool"]).toEqual({ transport: "mcp", timeoutMs: 1000 });
    expect(events.some((event) => event.type === "tool_call_started")).toBe(true);
    expect(events.some((event) => event.type === "tool_call_finished")).toBe(true);
  });
});
