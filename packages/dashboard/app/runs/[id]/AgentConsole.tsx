"use client";

import { useEffect, useMemo, useState } from "react";

type EventItem = {
  id: string;
  ts: string;
  type: string;
  stage?: string;
  agentId?: string;
  payload?: Record<string, unknown>;
};

type AgentItem = {
  id: string;
  role: string;
  stage: string;
  status: string;
};

function statusClass(status: string): string {
  if (status === "done") return "chip chip-done";
  if (status === "blocked") return "chip chip-blocked";
  if (status === "error") return "chip chip-error";
  return "chip chip-working";
}

function formatLog(log: EventItem): { label: string; message: string } {
  const payload = log.payload ?? {};

  if (log.type === "agent_note") {
    const noteType = String(payload.noteType ?? "note");
    return { label: `note:${noteType}`, message: String(payload.message ?? "") };
  }

  if (log.type === "agent_status") {
    return {
      label: `status:${String(payload.status ?? "unknown")}`,
      message: String(payload.message ?? "")
    };
  }

  if (log.type === "tool_call_started" || log.type === "tool_call_finished") {
    return {
      label: String(payload.tool ?? log.type),
      message: String(payload.summary ?? "")
    };
  }

  if (log.type === "stage_started" || log.type === "stage_finished") {
    return { label: log.type, message: String(log.stage ?? "") };
  }

  if (log.type === "artifact_created") {
    return {
      label: `artifact:${String(payload.artifactType ?? "unknown")}`,
      message: String(payload.summary ?? payload.path ?? "")
    };
  }

  return { label: log.type, message: JSON.stringify(payload) };
}

function renderNoteDetails(payload: Record<string, unknown>): string {
  const chunks: string[] = [];
  const problem = payload.problem ? `problem=${String(payload.problem)}` : "";
  const options = Array.isArray(payload.options) ? `options=[${payload.options.map(String).join(", ")}]` : "";
  const chosen = payload.chosen ? `chosen=${String(payload.chosen)}` : "";
  const why = payload.why ? `why=${String(payload.why)}` : "";
  const evidence = Array.isArray(payload.evidence) ? `evidence=[${payload.evidence.map(String).join(", ")}]` : "";

  for (const part of [problem, options, chosen, why, evidence]) {
    if (part) chunks.push(part);
  }
  return chunks.join(" | ");
}

export default function AgentConsole({ events }: { events: EventItem[] }) {
  const agents = useMemo<AgentItem[]>(() => {
    const map = new Map<string, AgentItem>();

    for (const event of events) {
      if (event.type === "agent_spawned") {
        const payload = event.payload ?? {};
        const id = String(payload.agentId ?? event.agentId ?? `agent-${map.size + 1}`);
        map.set(id, {
          id,
          role: String(payload.role ?? "unknown"),
          stage: String(event.stage ?? "unknown"),
          status: "working"
        });
      }

      if (event.type === "agent_status") {
        const id = event.agentId ?? `stage:${event.stage ?? "unknown"}`;
        const status = String((event.payload as { status?: string })?.status ?? "working");
        const prev = map.get(id);
        if (prev) {
          map.set(id, { ...prev, status });
        } else {
          map.set(id, {
            id,
            role: String(event.stage ?? "unknown").toLowerCase(),
            stage: String(event.stage ?? "unknown"),
            status
          });
        }
      }
    }

    return [...map.values()];
  }, [events]);

  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(agents[0]?.id);

  useEffect(() => {
    if (!agents.length) {
      setSelectedAgentId(undefined);
      return;
    }

    if (!selectedAgentId || !agents.some((agent) => agent.id === selectedAgentId)) {
      setSelectedAgentId(agents[0]?.id);
    }
  }, [agents, selectedAgentId]);

  const selectedLogs = useMemo(() => {
    if (!selectedAgentId) {
      return [] as EventItem[];
    }

    return events.filter((event) => {
      if (event.agentId && event.agentId === selectedAgentId) {
        return true;
      }
      if (!event.agentId) {
        const selected = agents.find((agent) => agent.id === selectedAgentId);
        return Boolean(
          selected &&
            selected.stage === event.stage &&
            ["stage_started", "stage_finished", "agent_note", "tool_call_started", "tool_call_finished", "artifact_created"].includes(event.type)
        );
      }
      return false;
    });
  }, [events, selectedAgentId, agents]);

  return (
    <section className="panel">
      <h2 className="panel-title">Agent Crew Deck</h2>
      <div className="crew-grid">
        {agents.map((agent) => (
          <button
            key={agent.id}
            className={`agent-card ${selectedAgentId === agent.id ? "agent-card-active" : ""}`}
            onClick={() => setSelectedAgentId(agent.id)}
            type="button"
          >
            <div className="agent-role">{agent.role}</div>
            <div className="agent-stage">{agent.stage}</div>
            <span className={statusClass(agent.status)}>{agent.status}</span>
          </button>
        ))}
      </div>

      <h3 className="panel-subtitle">Agent Console</h3>
      <div className="console">
        {selectedLogs.length === 0 ? (
          <div className="console-line">No logs for selected agent.</div>
        ) : (
          selectedLogs.map((log) => {
            const formatted = formatLog(log);
            const noteDetails = log.type === "agent_note" ? renderNoteDetails(log.payload ?? {}) : "";
            return (
              <div key={log.id} className="console-line">
                <span className="console-ts">{new Date(log.ts).toLocaleTimeString()}</span>
                <span className="console-type">{formatted.label}</span>
                <span className="console-msg">
                  {formatted.message}
                  {noteDetails ? <><br />{noteDetails}</> : null}
                </span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
