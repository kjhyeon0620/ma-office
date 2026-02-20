"use client";

import type { AgentViewModel, OfficeRole } from "../../../lib/agentViewModel";

const SEAT_ORDER: OfficeRole[] = ["SPEC", "IMPLEMENT", "TEST", "REVIEW", "GITHUB", "BLOG_FACTS"];

const SEAT_LAYOUT: Record<
  OfficeRole,
  { deskLeft: string; deskTop: string; chairLeft: string; chairTop: string; avatarLeft: string; avatarTop: string }
> = {
  SPEC: { deskLeft: "10%", deskTop: "18%", chairLeft: "17%", chairTop: "33%", avatarLeft: "14%", avatarTop: "38%" },
  IMPLEMENT: { deskLeft: "40%", deskTop: "18%", chairLeft: "47%", chairTop: "33%", avatarLeft: "44%", avatarTop: "37%" },
  TEST: { deskLeft: "70%", deskTop: "18%", chairLeft: "77%", chairTop: "33%", avatarLeft: "74%", avatarTop: "38%" },
  REVIEW: { deskLeft: "10%", deskTop: "58%", chairLeft: "17%", chairTop: "73%", avatarLeft: "14%", avatarTop: "78%" },
  GITHUB: { deskLeft: "40%", deskTop: "58%", chairLeft: "47%", chairTop: "73%", avatarLeft: "44%", avatarTop: "77%" },
  BLOG_FACTS: { deskLeft: "70%", deskTop: "58%", chairLeft: "77%", chairTop: "73%", avatarLeft: "74%", avatarTop: "78%" }
};

const ROLE_PALETTE: Record<OfficeRole, { shirt: string; hair: string; skin: string }> = {
  SPEC: { shirt: "#5aa6ff", hair: "#2f3a5f", skin: "#f5caa7" },
  IMPLEMENT: { shirt: "#f49f6b", hair: "#1f2e47", skin: "#f0c8ab" },
  TEST: { shirt: "#8e79ff", hair: "#20304a", skin: "#eabf9e" },
  REVIEW: { shirt: "#4dc59f", hair: "#2c2b52", skin: "#edc5a4" },
  GITHUB: { shirt: "#f26e8d", hair: "#293b59", skin: "#f3c7a7" },
  BLOG_FACTS: { shirt: "#ffd166", hair: "#38526f", skin: "#f0c09c" }
};

function roleShort(role: OfficeRole): string {
  return role === "BLOG_FACTS" ? "BLOG" : role;
}

function AvatarSprite({ role }: { role: OfficeRole }) {
  const palette = ROLE_PALETTE[role];
  return (
    <svg className="avatar-sprite" viewBox="0 0 24 24" aria-hidden="true">
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

function WindowProp() {
  return (
    <svg className="office-prop-svg" viewBox="0 0 140 92" aria-hidden="true">
      <rect x="2" y="2" width="136" height="88" rx="3" fill="#6c7fa4" stroke="#2f4367" strokeWidth="4" />
      <rect x="10" y="10" width="120" height="72" fill="#b9e6ff" />
      <rect x="69" y="10" width="4" height="72" fill="#3a4f76" />
      <g opacity="0.35">
        <rect x="10" y="15" width="120" height="2" fill="#ffffff" />
        <rect x="10" y="23" width="120" height="2" fill="#ffffff" />
        <rect x="10" y="31" width="120" height="2" fill="#ffffff" />
        <rect x="10" y="39" width="120" height="2" fill="#ffffff" />
      </g>
      <rect x="2" y="82" width="136" height="8" fill="#35486e" />
    </svg>
  );
}

function DoorProp() {
  return (
    <svg className="office-prop-svg" viewBox="0 0 72 130" aria-hidden="true">
      <rect x="1" y="1" width="70" height="128" rx="2" fill="#2e3f5e" />
      <rect x="6" y="6" width="60" height="118" fill="#5f7398" />
      <rect x="14" y="18" width="44" height="36" fill="#6f84a7" stroke="#3d4f73" strokeWidth="2" />
      <rect x="14" y="64" width="44" height="48" fill="#6b7fa2" stroke="#3d4f73" strokeWidth="2" />
      <circle cx="56" cy="67" r="4" fill="#f0d48c" />
      <rect x="3" y="124" width="66" height="5" fill="#233454" />
    </svg>
  );
}

function PlantProp() {
  return (
    <svg className="office-prop-svg" viewBox="0 0 52 84" aria-hidden="true">
      <rect x="7" y="34" width="38" height="46" fill="#6d5848" />
      <rect x="7" y="34" width="38" height="4" fill="#826652" />
      <ellipse cx="26" cy="26" rx="18" ry="12" fill="#5ec790" />
      <ellipse cx="16" cy="23" rx="10" ry="8" fill="#49b37f" />
      <ellipse cx="36" cy="23" rx="10" ry="8" fill="#49b37f" />
      <rect x="23" y="20" width="6" height="16" fill="#3f966b" />
    </svg>
  );
}

function DeskTopProp({ status }: { status: AgentViewModel["status"] }) {
  return (
    <svg className="office-desk-svg" viewBox="0 0 210 88" aria-hidden="true">
      <rect x="2" y="2" width="206" height="84" rx="4" fill="#d0b090" stroke="#2e3a57" strokeWidth="4" />
      <rect x="2" y="65" width="206" height="10" fill="#b38d67" />
      <rect x="12" y="10" width="40" height="28" fill="#1f2f4a" />
      <rect x="16" y="14" width="32" height="20" fill="#8bc2ff" />
      <rect x="14" y="38" width="36" height="4" fill="#1f2f4a" />
      <rect x="149" y="11" width="22" height="14" fill="#f1ecdd" stroke="#6e6453" strokeWidth="2" />
      <rect x="177" y="11" width="16" height="14" fill="#80b4f0" stroke="#384c74" strokeWidth="2" />
      <rect x="56" y="10" width="18" height="18" rx="2" fill={status === "done" ? "#6ef7c8" : status === "working" ? "#69b7ff" : status === "blocked" || status === "error" ? "#ff6b7d" : "#9fb2d6"} />
      <rect x="58" y="12" width="14" height="14" rx="1" fill="rgba(0,0,0,0.2)" />
    </svg>
  );
}

function DeskFrontProp({ role }: { role: OfficeRole }) {
  return (
    <svg className="office-desk-svg" viewBox="0 0 210 70" aria-hidden="true">
      <rect x="2" y="2" width="206" height="66" rx="4" fill="#a88360" stroke="#2e3a57" strokeWidth="4" />
      <rect x="2" y="56" width="206" height="12" fill="#846246" />
      <text x="12" y="44" fill="#1f2f4d" fontSize="16" fontFamily="JetBrains Mono, monospace" fontWeight="700">
        {roleShort(role)}
      </text>
    </svg>
  );
}

function ChairProp() {
  return (
    <svg className="office-chair-svg" viewBox="0 0 64 52" aria-hidden="true">
      <rect x="14" y="0" width="36" height="18" rx="3" fill="#3d5988" stroke="#253856" strokeWidth="3" />
      <rect x="6" y="16" width="52" height="30" rx="4" fill="#395684" stroke="#253856" strokeWidth="3" />
      <rect x="28" y="46" width="8" height="6" fill="#253856" />
    </svg>
  );
}

function statusIcon(status: AgentViewModel["status"]): string {
  if (status === "working") return "...";
  if (status === "done") return "✓";
  if (status === "blocked" || status === "error") return "!";
  return "•";
}

export default function OfficeCanvas({
  agents,
  selectedAgentId,
  onSelect
}: {
  agents: AgentViewModel[];
  selectedAgentId?: string;
  onSelect: (id: string) => void;
}) {
  const byRole = new Map(agents.map((agent) => [agent.role as OfficeRole, agent]));

  return (
    <section className="panel office-scene-wrap">
      <div className="office-scene-head">
        <h2 className="panel-title">Office View</h2>
      </div>
      <div className="office-scene-room">
        <div className="office-room-wall" />
        <div className="office-room-floor" />
        <div className="office-prop office-window office-window-left">
          <WindowProp />
        </div>
        <div className="office-prop office-window office-window-right">
          <WindowProp />
        </div>
        <div className="office-prop office-door">
          <DoorProp />
        </div>
        <div className="office-prop office-plant office-plant-left">
          <PlantProp />
        </div>
        <div className="office-prop office-plant office-plant-right">
          <PlantProp />
        </div>

        {SEAT_ORDER.map((role) => {
          const agent = byRole.get(role);
          if (!agent) {
            return null;
          }
          const layout = SEAT_LAYOUT[role];
          const isActive = selectedAgentId === agent.id;

          return (
            <div key={role} className="desk-cluster">
              <div className="office-desk office-desk-top" style={{ left: layout.deskLeft, top: layout.deskTop }}>
                <DeskTopProp status={agent.status} />
                <div className={`desk-status desk-status-${agent.status}`}>{statusIcon(agent.status)}</div>
              </div>
              <button
                type="button"
                className={`office-avatar-scene avatar-${agent.status} ${isActive ? "avatar-selected" : ""}`}
                style={{ left: layout.avatarLeft, top: layout.avatarTop }}
                onClick={() => onSelect(agent.id)}
                title={`${agent.role}: ${agent.currentTask || "—"}`}
                aria-label={`${agent.role} agent`}
              >
                <AvatarSprite role={role} />
                <span className={`avatar-head-icon avatar-head-icon-${agent.status}`}>{statusIcon(agent.status)}</span>
              </button>
              <div className="office-chair" style={{ left: layout.chairLeft, top: layout.chairTop }}>
                <ChairProp />
              </div>
              <div className="office-desk office-desk-front" style={{ left: layout.deskLeft, top: layout.deskTop }}>
                <DeskFrontProp role={role} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
