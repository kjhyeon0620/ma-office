import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { JsonlEventLogger } from "../src/events/jsonlLogger.js";

describe("JsonlEventLogger", () => {
  it("appends and reads events", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ma-office-"));
    const file = join(dir, "events.jsonl");
    const logger = new JsonlEventLogger(file);

    await logger.init();
    await logger.emit({
      id: "1",
      runId: "run-1",
      ts: new Date().toISOString(),
      level: "info",
      type: "run_started",
      payload: { goal: "test" }
    });

    const content = await readFile(file, "utf8");
    expect(content).toContain("run_started");

    const events = await logger.readAll();
    expect(events).toHaveLength(1);
  });
});
