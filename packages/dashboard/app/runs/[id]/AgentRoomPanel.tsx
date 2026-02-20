"use client";

import type { AgentViewModel } from "../../../lib/agentViewModel";
import type { RunEvent } from "@ma-office/shared";
import Link from "next/link";
import { formatEventTime } from "../../../lib/time";
import { getReadableEventMessage } from "../../../lib/agentViewModel";

const ROOM_PALETTE: Record<string, { shirt: string; hair: string; skin: string }> = {
  SPEC: { shirt: "#5aa6ff", hair: "#2f3a5f", skin: "#f5caa7" },
  IMPLEMENT: { shirt: "#f49f6b", hair: "#1f2e47", skin: "#f0c8ab" },
  TEST: { shirt: "#8e79ff", hair: "#20304a", skin: "#eabf9e" },
  REVIEW: { shirt: "#4dc59f", hair: "#2c2b52", skin: "#edc5a4" },
  GITHUB: { shirt: "#f26e8d", hair: "#293b59", skin: "#f3c7a7" },
  BLOG_FACTS: { shirt: "#ffd166", hair: "#38526f", skin: "#f0c09c" }
};

function RoomAvatar({ role }: { role: string }) {
  const palette = ROOM_PALETTE[role] ?? ROOM_PALETTE.SPEC;
  return (
    <svg className="room-avatar-sprite" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="2" width="12" height="4" fill={palette.hair} />
      <rect x="5" y="5" width="14" height="8" fill={palette.skin} />
      <rect x="8" y="8" width="2" height="2" fill="#1b2438" />
      <rect x="14" y="8" width="2" height="2" fill="#1b2438" />
      <rect x="9" y="11" width="6" height="1" fill="#c38060" />
      <rect x="5" y="13" width="14" height="8" fill={palette.shirt} />
      <rect x="3" y="14" width="2" height="6" fill={palette.skin} />
      <rect x="19" y="14" width="2" height="6" fill={palette.skin} />
      <rect x="8" y="21" width="3" height="3" fill="#243149" />
      <rect x="13" y="21" width="3" height="3" fill="#243149" />
    </svg>
  );
}

export default function AgentRoomPanel({
  agent,
  events,
  onClose,
  focusHref
}: {
  agent?: AgentViewModel;
  events: RunEvent[];
  onClose: () => void;
  focusHref?: string;
}) {
  if (!agent) {
    return (
      <section className="panel room-panel">
        <h2 className="panel-title">Agent Room</h2>
        <p>Select an agent tile to open room details.</p>
      </section>
    );
  }

  const related = events
    .filter((event) => String(event.stage ?? "").toUpperCase() === agent.stage)
    .slice(-5)
    .reverse();

  return (
    <section className="panel room-panel">
      <div className="panel-toolbar">
        <h2 className="panel-title">Agent Room</h2>
        <div className="toolbar-actions">
          {focusHref ? (
            <Link className="live-toggle" href={focusHref}>
              Focus
            </Link>
          ) : null}
          <button type="button" className="live-toggle" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      <div className="room-header">
        <div className="room-avatar room-avatar-lg">
          <RoomAvatar role={agent.role} />
        </div>
        <div>
          <div className="room-role">{agent.role}</div>
          <div className="room-task">{agent.currentTask || "—"}</div>
          <div className="room-meta-line">Last updated: {formatEventTime(agent.lastUpdateTs)}</div>
          <span className={`chip chip-${agent.status}`}>{agent.status}</span>
          <div className="office-progress room-progress">
            <div className={`office-progress-bar ${agent.status === "working" ? "office-progress-indeterminate" : ""}`} style={{ width: `${agent.progress}%` }} />
          </div>
        </div>
      </div>
      <div className="room-section">
        <h3 className="panel-subtitle">Artifacts</h3>
        {agent.artifacts.length === 0 ? <p>—</p> : null}
        <ul className="room-list">
          {agent.artifacts.map((artifact) => (
            <li key={artifact}>{artifact}</li>
          ))}
        </ul>
      </div>
      <div className="room-section">
        <h3 className="panel-subtitle">Recent Events</h3>
        <ul className="room-list">
          {related.map((event) => (
            <li key={event.id}>
              <span className="timeline-ts">{formatEventTime(event.ts)}</span> {getReadableEventMessage(event)}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
