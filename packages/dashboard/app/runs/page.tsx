import { getRunSummaries } from "../../lib/runs";
import RunsLiveTable from "./RunsLiveTable";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const runs = await getRunSummaries();

  return (
    <main className="dashboard-root">
      <section className="hero">
        <h1>Runs</h1>
        <p>Multi-agent execution history and observability feed.</p>
      </section>

      <RunsLiveTable initialRuns={runs} />
    </main>
  );
}
