import { open, readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseRunEvent, type RunEvent } from "@ma-office/shared";

export type RunSummary = {
  runId: string;
  goal: string;
  startedAt?: string;
  finishedAt?: string;
  status: "running" | "done" | "blocked" | "error";
  estimatedCost: number;
  artifacts: string[];
};

export type RunDetail = {
  runId: string;
  events: RunEvent[];
  artifacts: {
    path: string;
    artifactType: string;
    summary: string;
  }[];
  registeredTools: Record<string, Record<string, unknown>>;
  widgetPanels: {
    widgetName: string;
    data: Record<string, unknown>;
  }[];
  cursor: number;
};

export type TailRead = {
  events: RunEvent[];
  cursor: number;
  reset: boolean;
};

export interface RunsRepository {
  getRunSummaries(): Promise<RunSummary[]>;
  getRunDetail(runId: string): Promise<RunDetail>;
  readRunEventsSince(runId: string, cursor: number): Promise<TailRead>;
  getRunsFingerprint(): Promise<string>;
}

function findWorkspaceRoot(start: string): string {
  let current = resolve(start);
  while (true) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    const parent = resolve(current, "..");
    if (parent === current) {
      return start;
    }
    current = parent;
  }
}

function resolveProjectRoot(): string {
  const explicit = process.env.MA_OFFICE_PROJECT_ROOT;
  if (explicit) {
    return resolve(explicit);
  }

  const fromInit = process.env.INIT_CWD;
  if (fromInit) {
    return findWorkspaceRoot(fromInit);
  }

  return findWorkspaceRoot(process.cwd());
}

const ROOT = resolve(resolveProjectRoot(), "runs");

function toRunEvent(line: string): RunEvent | undefined {
  try {
    return parseRunEvent(JSON.parse(line));
  } catch {
    return undefined;
  }
}

async function readEvents(runId: string): Promise<RunEvent[]> {
  const file = join(ROOT, runId, "events.jsonl");
  const raw = await readFile(file, "utf8").catch(() => "");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => toRunEvent(line))
    .filter((event): event is RunEvent => Boolean(event));
}

async function readRegisteredTools(artifactPath?: string): Promise<Record<string, Record<string, unknown>>> {
  if (!artifactPath) {
    return {};
  }

  const full = resolve(ROOT, "..", artifactPath);
  const raw = await readFile(full, "utf8").catch(() => "");
  if (!raw) {
    return {};
  }

  const parsed = JSON.parse(raw) as unknown;
  return typeof parsed === "object" && parsed ? (parsed as Record<string, Record<string, unknown>>) : {};
}

async function readWidgetPanel(artifactPath: string): Promise<Record<string, unknown>> {
  const full = resolve(ROOT, "..", artifactPath);
  const raw = await readFile(full, "utf8").catch(() => "");
  if (!raw) {
    return {};
  }
  const parsed = JSON.parse(raw) as unknown;
  return typeof parsed === "object" && parsed ? (parsed as Record<string, unknown>) : {};
}

async function getCursor(runId: string): Promise<number> {
  const file = join(ROOT, runId, "events.jsonl");
  const fileStat = await stat(file).catch(() => undefined);
  return fileStat?.size ?? 0;
}

class JsonlRunsRepository implements RunsRepository {
  async getRunSummaries(): Promise<RunSummary[]> {
    const ids = await readdir(ROOT).catch(() => []);
    const summaries: RunSummary[] = [];

    for (const runId of ids) {
      const events = await readEvents(runId);
      if (!events.length) {
        continue;
      }

      const started = events.find((event) => event.type === "run_started");
      const finished = events.find((event) => event.type === "run_finished");
      const blocked = events.find((event) => event.type === "agent_status" && (event.payload as { status?: string })?.status === "blocked");
      const errored = events.find((event) => event.type === "agent_status" && (event.payload as { status?: string })?.status === "error");
      const cost = events
        .filter((event) => event.type === "cost_update")
        .reduce((sum, event) => sum + Number((event.payload as { estimatedCost?: number }).estimatedCost ?? 0), 0);
      const artifacts = events
        .filter((event) => event.type === "artifact_created")
        .map((event) => String((event.payload as { path: string }).path));

      summaries.push({
        runId,
        goal: String((started?.payload as { goal?: string })?.goal ?? "(unknown)"),
        startedAt: started?.ts,
        finishedAt: finished?.ts,
        status: blocked ? "blocked" : errored ? "error" : finished ? "done" : "running",
        estimatedCost: cost,
        artifacts
      });
    }

    return summaries.sort((a, b) => (a.startedAt && b.startedAt ? b.startedAt.localeCompare(a.startedAt) : 0));
  }

  async getRunDetail(runId: string): Promise<RunDetail> {
    const events = await readEvents(runId);
    const artifacts = events
      .filter((event) => event.type === "artifact_created")
      .map((event) => {
        const payload = event.payload as { path?: string; artifactType?: string; summary?: string };
        return {
          path: String(payload.path ?? ""),
          artifactType: String(payload.artifactType ?? "unknown"),
          summary: String(payload.summary ?? "")
        };
      });

    const toolsArtifact = artifacts.find((artifact) => artifact.artifactType === "registered_tools");
    const registeredTools = await readRegisteredTools(toolsArtifact?.path);
    const widgetPanels = await Promise.all(
      artifacts
        .filter((artifact) => artifact.artifactType === "widget")
        .map(async (artifact) => ({
          widgetName: artifact.path.split("/").pop()?.replace(/^widget_/, "").replace(/\.json$/, "") ?? "unknown",
          data: await readWidgetPanel(artifact.path)
        }))
    );

    return { runId, events, artifacts, registeredTools, widgetPanels, cursor: await getCursor(runId) };
  }

  async readRunEventsSince(runId: string, cursor: number): Promise<TailRead> {
    const file = join(ROOT, runId, "events.jsonl");
    const fileStat = await stat(file).catch(() => undefined);
    if (!fileStat) {
      return { events: [], cursor: 0, reset: cursor > 0 };
    }

    let start = Number.isFinite(cursor) ? Math.max(0, cursor) : 0;
    let reset = false;
    if (start > fileStat.size) {
      start = 0;
      reset = true;
    }

    if (start === fileStat.size) {
      return { events: [], cursor: fileStat.size, reset };
    }

    const size = fileStat.size - start;
    const handle = await open(file, "r");
    const buffer = Buffer.alloc(size);
    try {
      await handle.read(buffer, 0, size, start);
    } finally {
      await handle.close();
    }

    const raw = buffer.toString("utf8");
    let consumable = raw;
    let nextCursor = fileStat.size;
    if (!raw.endsWith("\n")) {
      const lastBreak = raw.lastIndexOf("\n");
      if (lastBreak === -1) {
        consumable = "";
        nextCursor = start;
      } else {
        consumable = raw.slice(0, lastBreak);
        const pending = raw.slice(lastBreak + 1);
        nextCursor = fileStat.size - Buffer.byteLength(pending, "utf8");
      }
    }

    const events = consumable
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => toRunEvent(line))
      .filter((event): event is RunEvent => Boolean(event));

    return { events, cursor: nextCursor, reset };
  }

  async getRunsFingerprint(): Promise<string> {
    const entries = await readdir(ROOT, { withFileTypes: true }).catch(() => []);
    const parts: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const file = join(ROOT, entry.name, "events.jsonl");
      const fileStat = await stat(file).catch(() => undefined);
      if (!fileStat) {
        continue;
      }
      parts.push(`${entry.name}:${fileStat.size}:${fileStat.mtimeMs.toFixed(0)}`);
    }

    parts.sort();
    return parts.join("|");
  }
}

const repository: RunsRepository = new JsonlRunsRepository();

export function getRunsRepository(): RunsRepository {
  return repository;
}

export async function getRunSummaries(): Promise<RunSummary[]> {
  return repository.getRunSummaries();
}

export async function getRunDetail(runId: string): Promise<RunDetail> {
  return repository.getRunDetail(runId);
}
