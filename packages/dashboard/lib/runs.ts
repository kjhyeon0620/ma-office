import { readdir, readFile } from "node:fs/promises";
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
};

const ROOT = resolve(process.env.MA_OFFICE_PROJECT_ROOT ?? process.cwd(), "runs");

async function readEvents(runId: string): Promise<RunEvent[]> {
  const file = join(ROOT, runId, "events.jsonl");
  const raw = await readFile(file, "utf8").catch(() => "");
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => parseRunEvent(JSON.parse(line)));
}

async function readRegisteredTools(runId: string, artifactPath?: string): Promise<Record<string, Record<string, unknown>>> {
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

export async function getRunSummaries(): Promise<RunSummary[]> {
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

export async function getRunDetail(runId: string): Promise<RunDetail> {
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
  const registeredTools = await readRegisteredTools(runId, toolsArtifact?.path);
  const widgetPanels = await Promise.all(
    artifacts
      .filter((artifact) => artifact.artifactType === "widget")
      .map(async (artifact) => ({
        widgetName: artifact.path.split("/").pop()?.replace(/^widget_/, "").replace(/\.json$/, "") ?? "unknown",
        data: await readWidgetPanel(artifact.path)
      }))
  );

  return { runId, events, artifacts, registeredTools, widgetPanels };
}
