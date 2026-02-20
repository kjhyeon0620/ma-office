import AgentConsole from "./AgentConsole";
import { getRunDetail } from "../../../lib/runs";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await getRunDetail(id);

  const costs = run.events.filter((event) => event.type === "cost_update");
  const totalCost = costs.reduce((sum, event) => sum + Number((event.payload as { estimatedCost?: number }).estimatedCost ?? 0), 0);
  const stages = run.events.filter((event) => event.type === "stage_started" || event.type === "stage_finished");

  return (
    <main className="dashboard-root">
      <section className="hero">
        <h1>Run {id}</h1>
        <p>Goal: {String((run.events.find((event) => event.type === "run_started")?.payload as { goal?: string })?.goal ?? "(unknown)")}</p>
        <p>Total cost: {totalCost}</p>
      </section>

      <AgentConsole
        events={run.events.map((event) => ({
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
          {stages.map((event) => (
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
    </main>
  );
}
