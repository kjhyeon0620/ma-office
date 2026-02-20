import { describe, expect, test } from "vitest";
import { getAgentViewModels, getReadableEventMessage, getRunMode, getWarningCount } from "./agentViewModel";
import type { RunEvent } from "@ma-office/shared";

function event(input: Partial<RunEvent> & Pick<RunEvent, "id" | "runId" | "ts" | "type">): RunEvent {
  return {
    level: "info",
    ...input
  } as RunEvent;
}

describe("agent view model", () => {
  test("derives status/task/last update", () => {
    const events: RunEvent[] = [
      event({ id: "1", runId: "r", ts: "2026-02-20T00:00:00.000Z", type: "stage_started", stage: "IMPLEMENT" }),
      event({
        id: "2",
        runId: "r",
        ts: "2026-02-20T00:00:01.000Z",
        type: "agent_note",
        stage: "IMPLEMENT",
        payload: { noteType: "plan", message: "apply patch" }
      }),
      event({
        id: "3",
        runId: "r",
        ts: "2026-02-20T00:00:02.000Z",
        type: "agent_status",
        stage: "IMPLEMENT",
        payload: { status: "done", message: "finished" }
      })
    ];

    const models = getAgentViewModels(events);
    const implement = models.find((agent) => agent.stage === "IMPLEMENT");
    expect(implement).toBeDefined();
    expect(implement?.status).toBe("done");
    expect(implement?.currentTask).toBe("finished");
    expect(implement?.lastUpdateTs).toBe("2026-02-20T00:00:02.000Z");
  });

  test("derives mock vs real mode", () => {
    const mockMode = getRunMode([
      event({
        id: "1",
        runId: "r",
        ts: "2026-02-20T00:00:00.000Z",
        type: "cost_update",
        payload: { model: "mock", tokensIn: 1, tokensOut: 1, estimatedCost: 0 }
      })
    ]);
    expect(mockMode).toBe("mock");

    const realMode = getRunMode([
      event({
        id: "2",
        runId: "r",
        ts: "2026-02-20T00:00:00.000Z",
        type: "cost_update",
        payload: { model: "gpt-5", tokensIn: 1, tokensOut: 1, estimatedCost: 1 }
      })
    ]);
    expect(realMode).toBe("real");
  });

  test("generates readable message and warning count", () => {
    const warningEvent = event({
      id: "w",
      runId: "r",
      ts: "2026-02-20T00:00:00.000Z",
      type: "agent_status",
      stage: "TEST",
      payload: { status: "blocked", message: "awaiting permission" }
    });

    expect(getReadableEventMessage(warningEvent)).toContain("awaiting permission");
    expect(getWarningCount([warningEvent])).toBe(1);
  });
});
