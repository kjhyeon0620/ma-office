"use client";

import type { AgentViewModel } from "../../../lib/agentViewModel";

export default function CrewDeck({
  agents,
  selectedAgentId,
  onSelect
}: {
  agents: AgentViewModel[];
  selectedAgentId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="panel">
      <h2 className="panel-title">Crew Deck</h2>
      <div className="crew-row">
        {agents.map((agent) => (
          <button
            key={agent.id}
            type="button"
            className={`crew-card ${selectedAgentId === agent.id ? "crew-card-active" : ""}`}
            onClick={() => onSelect(agent.id)}
          >
            <div className="crew-role">{agent.role}</div>
            <div className="crew-task one-line">{agent.currentTask || "—"}</div>
            <span className={`chip chip-${agent.status}`}>{agent.status}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
