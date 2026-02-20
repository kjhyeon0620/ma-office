"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RunEvent } from "@ma-office/shared";
import type { RunDetail } from "../../../lib/runs";
import AgentConsole from "./AgentConsole";

type LiveMode = "idle" | "sse" | "reconnecting" | "polling";

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

export default function RunDetailLive({ initialRun }: { initialRun: RunDetail }) {
  const runId = initialRun.runId;
  const [run, setRun] = useState<RunDetail>(initialRun);
  const [liveEnabled, setLiveEnabled] = useState(true);
  const [mode, setMode] = useState<LiveMode>("idle");

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

  const costs = useMemo(() => run.events.filter((event: RunEvent) => event.type === "cost_update"), [run.events]);
  const totalCost = useMemo(
    () => costs.reduce((sum: number, event: RunEvent) => sum + Number((event.payload as { estimatedCost?: number }).estimatedCost ?? 0), 0),
    [costs]
  );
  const stages = useMemo(
    () => run.events.filter((event: RunEvent) => event.type === "stage_started" || event.type === "stage_finished"),
    [run.events]
  );
  const goal = useMemo(
    () => String((run.events.find((event: RunEvent) => event.type === "run_started")?.payload as { goal?: string })?.goal ?? "(unknown)"),
    [run.events]
  );

  return (
    <>
      <section className="hero">
        <div className="hero-toolbar">
          <div>
            <h1>Run {runId}</h1>
            <p>Goal: {goal}</p>
            <p>Total cost: {totalCost}</p>
          </div>
          <div className="live-controls">
            <div className="live-state">Live: {mode}</div>
            <button className="live-toggle" type="button" onClick={() => setLiveEnabled((current) => !current)}>
              {liveEnabled ? "Live On" : "Live Off"}
            </button>
          </div>
        </div>
      </section>

      <AgentConsole
        events={run.events.map((event: RunEvent) => ({
          id: event.id,
          ts: event.ts,
          type: event.type,
          stage: event.stage,
          agentId: event.agentId,
          payload: (event.payload ?? {}) as Record<string, unknown>
        }))}
      />

      <section className="panel">
        <h2 className="panel-title">Stage Timeline</h2>
        <div className="timeline">
          {stages.map((event: RunEvent) => (
            <div key={event.id} className="timeline-item">
              <span className="timeline-ts">{new Date(event.ts).toLocaleTimeString()}</span>
              <span className="timeline-type">{event.type}</span>
              <span className="timeline-stage">{event.stage}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel panel-grid">
        <div>
          <h2 className="panel-title">Registered Tools</h2>
          <pre className="json-block">{JSON.stringify(run.registeredTools, null, 2)}</pre>
        </div>
        <div>
          <h2 className="panel-title">Widget Panels</h2>
          <pre className="json-block">{JSON.stringify(run.widgetPanels, null, 2)}</pre>
        </div>
      </section>
    </>
  );
}
