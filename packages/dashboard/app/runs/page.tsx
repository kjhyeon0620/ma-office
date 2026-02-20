import Link from "next/link";
import { getRunSummaries } from "../../lib/runs";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const runs = await getRunSummaries();

  return (
    <main className="dashboard-root">
      <section className="hero">
        <h1>Runs</h1>
        <p>Multi-agent execution history and observability feed.</p>
      </section>

      <section className="panel">
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
    </main>
  );
}
