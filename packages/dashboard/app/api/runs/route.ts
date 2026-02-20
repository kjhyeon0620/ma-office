import { NextResponse } from "next/server";
import { getRunSummaries } from "../../../lib/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const runs = await getRunSummaries();
  return NextResponse.json({ runs });
}
