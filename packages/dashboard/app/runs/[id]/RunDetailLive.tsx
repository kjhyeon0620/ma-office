"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { RunEvent } from "@ma-office/shared";
import type { RunDetail } from "../../../lib/runs";
import AgentRoomPanel from "./AgentRoomPanel";
import CrewDeck from "./CrewDeck";
import LogConsolePanel from "./LogConsolePanel";
import OfficeCanvas from "./OfficeCanvas";
import SummaryWidgets from "./SummaryWidgets";
import { getAgentViewModels, getRunMode, getWarningCount } from "../../../lib/agentViewModel";

type LiveMode = "idle" | "sse" | "reconnecting" | "polling";
type RunView = "office" | "console";

type TailResponse = {
  events: RunEvent[];
  cursor: number;
  reset: boolean;
};

type EventsMessage = {
  events?: RunEvent[];
  cursor?: number;
};

type ResetMessage = {
  cursor?: number;
};

function mergeEvents(current: RunEvent[], incoming: RunEvent[]): RunEvent[] {
  if (!incoming.length) {
    return current;
  }

  const known = new Set(current.map((event) => event.id));
  const next = [...current];
  for (const event of incoming) {
    if (!known.has(event.id)) {
      next.push(event);
      known.add(event.id);
    }
  }

  return next;
}

async function fetchRunDetail(runId: string): Promise<RunDetail> {
  const response = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`run detail fetch failed: ${response.status}`);
  }
  const data = (await response.json()) as { run: RunDetail };
  return data.run;
}

async function fetchTail(runId: string, cursor: number): Promise<TailResponse> {
  const response = await fetch(`/api/runs/${runId}/tail?cursor=${cursor}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`tail fetch failed: ${response.status}`);
  }
  return (await response.json()) as TailResponse;
}

export default function RunDetailLive({ initialRun, initialView }: { initialRun: RunDetail; initialView: RunView }) {
  const runId = initialRun.runId;
  const [run, setRun] = useState<RunDetail>(initialRun);
  const [liveEnabled, setLiveEnabled] = useState(true);
  const [mode, setMode] = useState<LiveMode>("idle");
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(undefined);

  const cursorRef = useRef(initialRun.cursor);
  const sourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const pollingTimerRef = useRef<number | null>(null);
  const attemptsRef = useRef(0);
  const hadSseConnectionRef = useRef(false);

  const refreshRun = async (): Promise<void> => {
    const next = await fetchRunDetail(runId);
    cursorRef.current = next.cursor;
    setRun(next);
  };

  useEffect(() => {
    return () => {
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      if (pollingTimerRef.current) {
        window.clearInterval(pollingTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!liveEnabled) {
      setMode("idle");
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (pollingTimerRef.current) {
        window.clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const stopPolling = () => {
      if (pollingTimerRef.current) {
        window.clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };

    const applyDelta = async (delta: TailResponse): Promise<void> => {
      cursorRef.current = delta.cursor;
      if (delta.reset) {
        await refreshRun();
        return;
      }

      if (!delta.events.length) {
        return;
      }

      setRun((current: RunDetail) => ({
        ...current,
        events: mergeEvents(current.events, delta.events)
      }));

      if (delta.events.some((event) => event.type === "artifact_created")) {
        await refreshRun();
      }
    };

    const startPolling = () => {
      stopPolling();
      setMode("polling");
      pollingTimerRef.current = window.setInterval(() => {
        void fetchTail(runId, cursorRef.current).then((delta) => {
          if (!cancelled) {
            void applyDelta(delta);
          }
        });
      }, 2500);
    };

    const scheduleReconnect = () => {
      attemptsRef.current += 1;
      if (!hadSseConnectionRef.current && attemptsRef.current >= 3) {
        startPolling();
        return;
      }

      setMode("reconnecting");
      const delay = Math.min(15000, 1000 * 2 ** (attemptsRef.current - 1));
      reconnectTimerRef.current = window.setTimeout(connectSse, delay);
    };

    const connectSse = () => {
      if (cancelled || !liveEnabled) {
        return;
      }

      if (sourceRef.current) {
        sourceRef.current.close();
      }

      const source = new EventSource(`/api/runs/${runId}/stream?cursor=${cursorRef.current}`);
      sourceRef.current = source;

      source.onopen = () => {
        attemptsRef.current = 0;
        hadSseConnectionRef.current = true;
        stopPolling();
        setMode("sse");
      };

      source.addEventListener("events", (event: MessageEvent<string>) => {
        const payload = JSON.parse(event.data) as EventsMessage;
        const delta: TailResponse = {
          events: payload.events ?? [],
          cursor: Number.isFinite(payload.cursor) ? Number(payload.cursor) : cursorRef.current,
          reset: false
        };
        void applyDelta(delta);
      });

      source.addEventListener("reset", (event: MessageEvent<string>) => {
        const payload = JSON.parse(event.data) as ResetMessage;
        const cursor = Number.isFinite(payload.cursor) ? Number(payload.cursor) : 0;
        void applyDelta({ events: [], cursor, reset: true });
      });

      source.onerror = () => {
        source.close();
        sourceRef.current = null;
        if (!cancelled && liveEnabled) {
          scheduleReconnect();
        }
      };
    };

    if (typeof window === "undefined" || typeof window.EventSource === "undefined") {
      startPolling();
      return () => {
        cancelled = true;
        stopPolling();
      };
    }

    connectSse();

    return () => {
      cancelled = true;
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      stopPolling();
    };
  }, [liveEnabled, runId]);

  const goal = useMemo(
    () => String((run.events.find((event: RunEvent) => event.type === "run_started")?.payload as { goal?: string })?.goal ?? "(unknown)"),
    [run.events]
  );
  const totalCost = useMemo(
    () =>
      run.events
        .filter((event: RunEvent) => event.type === "cost_update")
        .reduce((sum: number, event: RunEvent) => sum + Number((event.payload as { estimatedCost?: number }).estimatedCost ?? 0), 0),
    [run.events]
  );

  const connectionState = useMemo(() => (liveEnabled ? mode : "paused"), [liveEnabled, mode]);
  const agents = useMemo(() => getAgentViewModels(run.events, connectionState), [run.events, connectionState]);
  const modeLabel = useMemo(() => getRunMode(run.events), [run.events]);
  const warningCount = useMemo(() => getWarningCount(run.events), [run.events]);
  const artifactCount = useMemo(() => run.events.filter((event) => event.type === "artifact_created").length, [run.events]);
  const view = initialView;

  const selectedAgent = useMemo(() => agents.find((agent) => agent.id === selectedAgentId), [agents, selectedAgentId]);

  return (
    <>
      <section className="hero">
        <div className="hero-toolbar">
          <div>
            <h1>Agent Office · Run {runId}</h1>
            <p>Goal: {goal}</p>
            <p>Mode: {modeLabel}</p>
          </div>
          <div className="live-controls">
            <div className="live-state">Connection: {liveEnabled ? mode : "paused"}</div>
            <button className="live-toggle" type="button" onClick={() => setLiveEnabled((current) => !current)}>
              {liveEnabled ? "Live On" : "Live Off"}
            </button>
          </div>
        </div>
      </section>

      <section className="view-tabs" aria-label="Run views">
        <Link href={`/runs/${runId}?view=office`} className={`view-tab ${view === "office" ? "view-tab-active" : ""}`}>
          Office View
        </Link>
        <Link href={`/runs/${runId}?view=console`} className={`view-tab ${view === "console" ? "view-tab-active" : ""}`}>
          Console View
        </Link>
      </section>

      <SummaryWidgets
        totalEvents={run.events.length}
        totalArtifacts={artifactCount}
        totalCost={totalCost}
        warnings={warningCount}
        mode={modeLabel}
        liveMode={mode}
        liveEnabled={liveEnabled}
      />

      {view === "office" ? (
        <>
          <OfficeCanvas agents={agents} selectedAgentId={selectedAgentId} onSelect={setSelectedAgentId} />
          {selectedAgent ? (
            <div className="room-modal-backdrop" onClick={() => setSelectedAgentId(undefined)}>
              <div className="room-modal-shell" onClick={(event) => event.stopPropagation()}>
                <AgentRoomPanel
                  agent={selectedAgent}
                  events={run.events}
                  onClose={() => setSelectedAgentId(undefined)}
                  focusHref={`/runs/${runId}?view=console`}
                />
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <section className="detail-grid">
          <div>
            <CrewDeck agents={agents} selectedAgentId={selectedAgentId} onSelect={setSelectedAgentId} />
            <LogConsolePanel events={run.events} agents={agents} selectedAgentId={selectedAgentId} />
          </div>
          <div>
            <AgentRoomPanel agent={selectedAgent} events={run.events} onClose={() => setSelectedAgentId(undefined)} focusHref={`/runs/${runId}?view=console`} />
          </div>
        </section>
      )}
    </>
  );
}
