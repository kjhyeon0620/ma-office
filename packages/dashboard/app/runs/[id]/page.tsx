import { getRunDetail } from "../../../lib/runs";
import RunDetailLive from "./RunDetailLive";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await getRunDetail(id);

  return (
    <main className="dashboard-root">
      <RunDetailLive initialRun={run} />
    </main>
  );
}
