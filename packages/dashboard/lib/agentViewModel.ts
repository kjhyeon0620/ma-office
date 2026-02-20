import type { RunEvent } from "@ma-office/shared";

export type OfficeStatus = "idle" | "working" | "done" | "blocked" | "error";
export type RunMode = "mock" | "real" | "unknown";
export type ConnectionState = "idle" | "sse" | "reconnecting" | "polling" | "paused";
export type OfficeRole = (typeof OFFICE_ROLES)[number];

export type AgentViewModel = {
  id: string;
  role: OfficeRole;
  stage: OfficeRole;
  displayName: string;
  status: OfficeStatus;
  currentTask: string;
  lastUpdateTs?: string;
  connectionState: ConnectionState;
  progress: number;
  eventCount: number;
  artifacts: string[];
};

export const OFFICE_ROLES = ["SPEC", "IMPLEMENT", "TEST", "REVIEW", "GITHUB", "BLOG_FACTS"] as const;

function displayForRole(role: string): string {
  if (!role) return "Agent";
  return role.replace(/_/g, " ");
}

function normalizeStatus(input?: string): OfficeStatus {
  if (input === "working" || input === "done" || input === "blocked" || input === "error") {
    return input;
  }
  return "idle";
}

function taskFromEvent(event: RunEvent): string | undefined {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  if (event.type === "agent_note") {
    const message = String(payload.message ?? "").trim();
    return message || undefined;
  }
  if (event.type === "agent_status") {
    const message = String(payload.message ?? "").trim();
    return message || undefined;
  }
  if (event.type === "tool_call_started" || event.type === "tool_call_finished") {
    const summary = String(payload.summary ?? "").trim();
    if (summary) {
      return summary;
    }
    const tool = String(payload.tool ?? "").trim();
    return tool || undefined;
  }
  if (event.type === "stage_started" || event.type === "stage_finished") {
    return String(event.stage ?? "").trim() || undefined;
  }
  return undefined;
}

function roleFromEvent(event: RunEvent): string | undefined {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const fromStage = String(event.stage ?? "").toUpperCase();
  if (fromStage && OFFICE_ROLES.includes(fromStage as (typeof OFFICE_ROLES)[number])) {
    return fromStage;
  }

  if (event.type === "agent_spawned") {
    const fromRole = String(payload.role ?? "").toUpperCase();
    if (fromRole && OFFICE_ROLES.includes(fromRole as (typeof OFFICE_ROLES)[number])) {
      return fromRole;
    }
  }

  return undefined;
}

function asProgress(status: OfficeStatus): number {
  if (status === "done") return 100;
  if (status === "error" || status === "blocked") return 100;
  if (status === "working") return 60;
  return 8;
}

export function getRunMode(events: RunEvent[]): RunMode {
  const costs = events.filter((event) => event.type === "cost_update");
  if (!costs.length) {
    return "unknown";
  }

  const models = costs
    .map((event) => String(((event.payload ?? {}) as { model?: string }).model ?? ""))
    .filter(Boolean)
    .map((model) => model.toLowerCase());

  if (!models.length) {
    return "unknown";
  }

  if (models.every((model) => model === "mock")) {
    return "mock";
  }

  return "real";
}

export type RoleViewModelMap = Record<OfficeRole, AgentViewModel>;

export function getRoleViewModelMap(events: RunEvent[], connectionState: ConnectionState): RoleViewModelMap {
  const map = new Map<OfficeRole, AgentViewModel>(
    OFFICE_ROLES.map((role) => {
      const initial: AgentViewModel = {
        id: `stage:${role}`,
        role,
        stage: role,
        displayName: displayForRole(role),
        status: "idle",
        currentTask: "—",
        connectionState,
        progress: 8,
        eventCount: 0,
        artifacts: []
      };
      return [role, initial];
    })
  );

  for (const event of events) {
    const role = roleFromEvent(event);
    if (!role) {
      continue;
    }
    const officeRole = role as OfficeRole;

    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const prev = map.get(officeRole);
    if (!prev) {
      continue;
    }

    const next: AgentViewModel = {
      id: prev.id,
      role: officeRole,
      stage: officeRole,
      displayName: displayForRole(officeRole),
      status: prev?.status ?? "idle",
      currentTask: prev?.currentTask ?? "—",
      lastUpdateTs: event.ts,
      connectionState,
      progress: prev?.progress ?? 8,
      eventCount: (prev?.eventCount ?? 0) + 1,
      artifacts: [...(prev?.artifacts ?? [])]
    };

    if (event.type === "agent_status") {
      next.status = normalizeStatus(String(payload.status ?? next.status));
      next.progress = asProgress(next.status);
    }

    if (event.type === "stage_started" && next.status === "idle") {
      next.status = "working";
      next.progress = asProgress(next.status);
    }

    if (event.type === "stage_finished" && next.status !== "blocked" && next.status !== "error") {
      next.status = "done";
      next.progress = asProgress(next.status);
    }

    const task = taskFromEvent(event);
    if (task) {
      next.currentTask = task;
    }

    if (event.type === "artifact_created") {
      const artifactPath = String(payload.path ?? "").trim();
      if (artifactPath) {
        next.artifacts.push(artifactPath);
      }
    }

    map.set(officeRole, next);
  }

  return Object.fromEntries(OFFICE_ROLES.map((role) => [role, map.get(role) as AgentViewModel])) as RoleViewModelMap;
}

export function getAgentViewModels(events: RunEvent[], connectionState: ConnectionState = "idle"): AgentViewModel[] {
  const roleMap = getRoleViewModelMap(events, connectionState);
  return OFFICE_ROLES.map((role) => roleMap[role]);
}

export function getReadableEventMessage(event: RunEvent): string {
  const payload = (event.payload ?? {}) as Record<string, unknown>;

  switch (event.type) {
    case "run_started":
      return `Run started: ${String(payload.goal ?? "")}`;
    case "run_finished":
      return "Run finished";
    case "agent_spawned":
      return `${String(payload.role ?? "agent")} spawned`;
    case "agent_status":
      return String(payload.message ?? payload.status ?? "status update");
    case "agent_note":
      return `${String(payload.noteType ?? "note")}: ${String(payload.message ?? "")}`;
    case "stage_started":
      return `Stage started: ${String(event.stage ?? "")}`;
    case "stage_finished":
      return `Stage finished: ${String(event.stage ?? "")}`;
    case "tool_call_started":
      return `Tool start: ${String(payload.tool ?? "")}`;
    case "tool_call_finished":
      return `Tool done: ${String(payload.summary ?? payload.tool ?? "")}`;
    case "artifact_created":
      return `Artifact: ${String(payload.artifactType ?? "unknown")} · ${String(payload.summary ?? payload.path ?? "")}`;
    case "cost_update":
      return `Cost update: ${String(payload.estimatedCost ?? 0)}`;
    default:
      return "event";
  }
}

export function getWarningCount(events: RunEvent[]): number {
  return events.filter((event) => {
    if (event.level === "warn" || event.level === "error") {
      return true;
    }
    if (event.type === "agent_status") {
      const status = String(((event.payload ?? {}) as { status?: string }).status ?? "");
      return status === "blocked" || status === "error";
    }
    return false;
  }).length;
}
