"use client";

import type { RunMode } from "../../../lib/agentViewModel";

type LiveMode = "idle" | "sse" | "reconnecting" | "polling";

export default function SummaryWidgets({
  totalEvents,
  totalArtifacts,
  totalCost,
  warnings,
  mode,
  liveMode,
  liveEnabled
}: {
  totalEvents: number;
  totalArtifacts: number;
  totalCost: number;
  warnings: number;
  mode: RunMode;
  liveMode: LiveMode;
  liveEnabled: boolean;
}) {
  const connection = liveEnabled ? liveMode : "paused";
  const items = [
    { label: "Events", value: String(totalEvents) },
    { label: "Artifacts", value: String(totalArtifacts) },
    { label: "Cost", value: String(totalCost) },
    { label: "Warnings", value: String(warnings) },
    { label: "Run Mode", value: mode },
    { label: "Connection", value: connection }
  ];

  return (
    <section className="panel summary-grid">
      {items.map((item) => (
        <div key={item.label} className="summary-card">
          <div className="summary-label">{item.label}</div>
          <div className="summary-value">
            {item.label === "Connection" ? <span className={`summary-led summary-led-${connection}`} aria-hidden="true" /> : null}
            {item.value}
          </div>
        </div>
      ))}
    </section>
  );
}
