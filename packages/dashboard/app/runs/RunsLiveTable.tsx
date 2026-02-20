"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { RunSummary } from "../../lib/runs";

type LiveMode = "idle" | "sse" | "reconnecting" | "polling";

async function fetchRuns(): Promise<RunSummary[]> {
  const response = await fetch("/api/runs", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`runs fetch failed: ${response.status}`);
  }
  const data = (await response.json()) as { runs: RunSummary[] };
  return data.runs;
}

export default function RunsLiveTable({ initialRuns }: { initialRuns: RunSummary[] }) {
  const [runs, setRuns] = useState<RunSummary[]>(initialRuns);
  const [liveEnabled, setLiveEnabled] = useState(true);
  const [mode, setMode] = useState<LiveMode>("idle");

  const sourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const pollingTimerRef = useRef<number | null>(null);
  const attemptsRef = useRef(0);
  const hadSseConnectionRef = useRef(false);

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

    const startPolling = () => {
      stopPolling();
      setMode("polling");
      void fetchRuns().then((next) => {
        if (!cancelled) {
          setRuns(next);
        }
      });
      pollingTimerRef.current = window.setInterval(() => {
        void fetchRuns().then((next) => {
          if (!cancelled) {
            setRuns(next);
          }
        });
      }, 3000);
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

      const source = new EventSource("/api/runs/stream");
      sourceRef.current = source;

      source.onopen = () => {
        attemptsRef.current = 0;
        hadSseConnectionRef.current = true;
        stopPolling();
        setMode("sse");
      };

      source.addEventListener("runs_changed", () => {
        void fetchRuns().then((next) => {
          if (!cancelled) {
            setRuns(next);
          }
        });
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
  }, [liveEnabled]);

  return (
    <section className="panel">
      <div className="panel-toolbar">
        <div className="live-state">Live: {mode}</div>
        <button className="live-toggle" type="button" onClick={() => setLiveEnabled((current) => !current)}>
          {liveEnabled ? "Live On" : "Live Off"}
        </button>
      </div>

      <table className="runs-table">
        <thead>
          <tr>
            <th>Run</th>
            <th>Goal</th>
            <th>Status</th>
            <th>Cost</th>
            <th>Artifacts</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.runId}>
              <td>
                <Link href={`/runs/${run.runId}`}>{run.runId}</Link>
              </td>
              <td>{run.goal}</td>
              <td>{run.status}</td>
              <td>{run.estimatedCost}</td>
              <td>{run.artifacts.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
