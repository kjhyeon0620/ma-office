import { NextRequest, NextResponse } from "next/server";
import { getRunDetail } from "../../../../lib/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await context.params;
  const run = await getRunDetail(id);
  return NextResponse.json({ run });
}
