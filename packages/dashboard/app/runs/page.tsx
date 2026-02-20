import Link from "next/link";
import { getRunSummaries } from "../../lib/runs";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const runs = await getRunSummaries();

  return (
    <main>
      <h1>Runs</h1>
      <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th align="left">Run</th>
            <th align="left">Goal</th>
            <th align="left">Status</th>
            <th align="left">Cost</th>
            <th align="left">Artifacts</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.runId} style={{ borderTop: "1px solid #ccc" }}>
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
    </main>
  );
}
