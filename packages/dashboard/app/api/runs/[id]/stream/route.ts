import { NextRequest, NextResponse } from "next/server";
import { getRunsRepository } from "../../../../../lib/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sse(event: string, payload: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const cursorParam = Number(request.nextUrl.searchParams.get("cursor") ?? "0");
  let cursor = Number.isFinite(cursorParam) ? Math.max(0, cursorParam) : 0;

  const encoder = new TextEncoder();
  const repository = getRunsRepository();
  const signal = request.signal;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(sse("connected", { runId: id, cursor })));

      const interval = setInterval(async () => {
        if (signal.aborted) {
          clearInterval(interval);
          controller.close();
          return;
        }

        try {
          const delta = await repository.readRunEventsSince(id, cursor);
          cursor = delta.cursor;
          if (delta.reset) {
            controller.enqueue(encoder.encode(sse("reset", { cursor })));
          }
          if (delta.events.length > 0) {
            controller.enqueue(encoder.encode(sse("events", { events: delta.events, cursor })));
          } else {
            controller.enqueue(encoder.encode(sse("ping", { ts: Date.now(), cursor })));
          }
        } catch {
          controller.enqueue(encoder.encode(sse("error", { message: "tail_failed" })));
        }
      }, 1000);

      signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    }
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
