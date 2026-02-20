import { getRunDetail } from "../../../lib/runs";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await getRunDetail(id);

  const agents = run.events.filter((event) => event.type === "agent_status");
  const costs = run.events.filter((event) => event.type === "cost_update");
  const totalCost = costs.reduce((sum, event) => sum + Number((event.payload as { estimatedCost?: number }).estimatedCost ?? 0), 0);

  return (
    <main>
      <h1>Run {id}</h1>
      <p>Total cost: {totalCost}</p>

      <h2>Agent Status</h2>
      <ul>
        {agents.map((agent) => (
          <li key={agent.id}>
            [{agent.stage}] {String((agent.payload as { status?: string }).status ?? "unknown")} - {String((agent.payload as { message?: string }).message ?? "")}
          </li>
        ))}
      </ul>

      <h2>Timeline</h2>
      <ol>
        {run.events.map((event) => (
          <li key={event.id}>
            {event.ts} {event.type} {event.stage ? `(${event.stage})` : ""}
          </li>
        ))}
      </ol>
    </main>
  );
}
