import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

function eventLine(id: string, runId: string): string {
  return `${JSON.stringify({
    id,
    runId,
    ts: new Date("2026-02-20T00:00:00.000Z").toISOString(),
    type: "run_started",
    payload: { goal: "live update" }
  })}\n`;
}

async function setupRunDir(): Promise<{ root: string; runId: string; file: string }> {
  const root = await mkdtemp(join(tmpdir(), "ma-office-dashboard-"));
  const runId = "run-1";
  const runDir = join(root, "runs", runId);
  await mkdir(runDir, { recursive: true });
  const file = join(runDir, "events.jsonl");
  await writeFile(file, "", "utf8");
  return { root, runId, file };
}

afterEach(() => {
  delete process.env.MA_OFFICE_PROJECT_ROOT;
  vi.resetModules();
});

describe("readRunEventsSince", () => {
  test("returns only appended lines after cursor", async () => {
    const { root, runId, file } = await setupRunDir();
    process.env.MA_OFFICE_PROJECT_ROOT = root;

    await writeFile(file, eventLine("evt-1", runId), "utf8");

    const { getRunsRepository } = await import("./runs");
    const repo = getRunsRepository();

    const first = await repo.readRunEventsSince(runId, 0);
    expect(first.events).toHaveLength(1);
    expect(first.events[0]?.id).toBe("evt-1");

    await writeFile(file, `${eventLine("evt-1", runId)}${eventLine("evt-2", runId)}`, "utf8");

    const second = await repo.readRunEventsSince(runId, first.cursor);
    expect(second.events).toHaveLength(1);
    expect(second.events[0]?.id).toBe("evt-2");
    expect(second.reset).toBe(false);
    expect(second.cursor).toBeGreaterThan(first.cursor);
  });

  test("resets when file is truncated", async () => {
    const { root, runId, file } = await setupRunDir();
    process.env.MA_OFFICE_PROJECT_ROOT = root;

    await writeFile(file, `${eventLine("evt-1", runId)}${eventLine("evt-2", runId)}`, "utf8");

    const { getRunsRepository } = await import("./runs");
    const repo = getRunsRepository();

    const before = await repo.readRunEventsSince(runId, 0);
    expect(before.events).toHaveLength(2);

    await writeFile(file, eventLine("evt-3", runId), "utf8");

    const after = await repo.readRunEventsSince(runId, before.cursor);
    expect(after.reset).toBe(true);
    expect(after.events).toHaveLength(1);
    expect(after.events[0]?.id).toBe("evt-3");
  });
});
