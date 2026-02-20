import { NextResponse } from "next/server";
import { getRunsRepository } from "../../../../lib/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sse(event: string, payload: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export async function GET(request: Request): Promise<Response> {
  const encoder = new TextEncoder();
  const repository = getRunsRepository();
  const signal = request.signal;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let fingerprint = await repository.getRunsFingerprint();
      controller.enqueue(encoder.encode(sse("connected", { fingerprint })));

      const interval = setInterval(async () => {
        if (signal.aborted) {
          clearInterval(interval);
          controller.close();
          return;
        }

        try {
          const next = await repository.getRunsFingerprint();
          if (next !== fingerprint) {
            fingerprint = next;
            controller.enqueue(encoder.encode(sse("runs_changed", { fingerprint })));
          } else {
            controller.enqueue(encoder.encode(sse("ping", { ts: Date.now() })));
          }
        } catch {
          controller.enqueue(encoder.encode(sse("error", { message: "stream_check_failed" })));
        }
      }, 1500);

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
