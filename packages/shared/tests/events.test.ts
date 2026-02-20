import { describe, expect, it } from "vitest";
import { parseRunEvent } from "../src/events.js";

describe("RunEvent schema", () => {
  it("parses valid agent status event", () => {
    const parsed = parseRunEvent({
      id: "1",
      runId: "run-1",
      ts: new Date().toISOString(),
      level: "info",
      type: "agent_status",
      stage: "SPEC",
      payload: {
        status: "working",
        message: "started"
      }
    });

    expect(parsed.type).toBe("agent_status");
  });

  it("rejects invalid event type", () => {
    expect(() =>
      parseRunEvent({
        id: "1",
        runId: "run-1",
        ts: new Date().toISOString(),
        level: "info",
        type: "bad_type"
      })
    ).toThrow();
  });
});
