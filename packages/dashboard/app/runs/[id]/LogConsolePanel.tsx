"use client";

import { useMemo, useState } from "react";
import type { RunEvent } from "@ma-office/shared";
import type { AgentViewModel } from "../../../lib/agentViewModel";
import { getReadableEventMessage } from "../../../lib/agentViewModel";
import { formatEventTime } from "../../../lib/time";

export default function LogConsolePanel({
  events,
  agents,
  selectedAgentId
}: {
  events: RunEvent[];
  agents: AgentViewModel[];
  selectedAgentId?: string;
}) {
  const [agentFilter, setAgentFilter] = useState<string>(selectedAgentId ?? "all");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [raw, setRaw] = useState(false);

  const eventTypes = useMemo(() => [...new Set(events.map((event) => event.type))], [events]);
  const stageTypes = useMemo(() => [...new Set(events.map((event) => event.stage).filter(Boolean) as string[])], [events]);

  const filtered = useMemo(() => {
    return events.filter((event) => {
      if (agentFilter !== "all") {
        const matchedAgent = event.agentId === agentFilter;
        const matchedStage =
          !event.agentId &&
          String(event.stage ?? "").toUpperCase() === (agents.find((agent) => agent.id === agentFilter)?.stage ?? "");
        if (!matchedAgent && !matchedStage) {
          return false;
        }
      }
      if (stageFilter !== "all" && event.stage !== stageFilter) {
        return false;
      }
      if (typeFilter !== "all" && event.type !== typeFilter) {
        return false;
      }
      return true;
    });
  }, [events, agentFilter, stageFilter, typeFilter, agents]);

  const timeline = filtered.filter((event) => event.type === "stage_started" || event.type === "stage_finished");

  return (
    <section className="panel">
      <div className="panel-toolbar">
        <h2 className="panel-title">Console & Timeline</h2>
        <button type="button" className="live-toggle" onClick={() => setRaw((current) => !current)}>
          {raw ? "Readable" : "Raw"}
        </button>
      </div>

      <div className="filter-row">
        <select value={agentFilter} onChange={(event) => setAgentFilter(event.target.value)}>
          <option value="all">All agents</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.role}
            </option>
          ))}
        </select>
        <select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
          <option value="all">All stages</option>
          {stageTypes.map((stage) => (
            <option key={stage} value={stage}>
              {stage}
            </option>
          ))}
        </select>
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
          <option value="all">All events</option>
          {eventTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      <div className="console">
        {filtered.slice(-120).map((event) => (
          <div className="console-line" key={event.id}>
            <span className="console-ts">{formatEventTime(event.ts)}</span>
            <span className="console-type">{event.type}</span>
            <span className="console-msg">
              {raw ? JSON.stringify(event.payload ?? {}) : getReadableEventMessage(event)}
            </span>
          </div>
        ))}
      </div>

      <h3 className="panel-subtitle">Timeline</h3>
      <div className="timeline">
        {timeline.slice(-30).map((event) => (
          <div key={event.id} className="timeline-item">
            <span className="timeline-ts">{formatEventTime(event.ts)}</span>
            <span className="timeline-type">{event.type}</span>
            <span className="timeline-stage">{event.stage}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
