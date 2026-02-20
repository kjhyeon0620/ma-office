import { NextRequest, NextResponse } from "next/server";
import { getRunsRepository } from "../../../../../lib/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await context.params;
  const cursorParam = Number(request.nextUrl.searchParams.get("cursor") ?? "0");
  const cursor = Number.isFinite(cursorParam) ? Math.max(0, cursorParam) : 0;
  const delta = await getRunsRepository().readRunEventsSince(id, cursor);
  return NextResponse.json(delta);
}
