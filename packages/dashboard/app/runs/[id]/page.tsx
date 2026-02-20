import { getRunDetail } from "../../../lib/runs";
import RunDetailLive from "./RunDetailLive";

export const dynamic = "force-dynamic";

type RunView = "office" | "console";

function normalizeView(value: string | undefined): RunView {
  return value === "console" ? "console" : "office";
}

export default async function RunDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { id } = await params;
  const { view } = await searchParams;
  const run = await getRunDetail(id);

  return (
    <main className="dashboard-root">
      <RunDetailLive initialRun={run} initialView={normalizeView(view)} />
    </main>
  );
}
