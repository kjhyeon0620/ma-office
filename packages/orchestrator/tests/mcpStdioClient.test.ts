import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { McpStdioClient, McpStdioClientError } from "../src/integrations/mcpStdioClient.js";

type FakeBehavior = "success" | "timeout-once" | "approval";

function createFakeSpawn(behavior: FakeBehavior): typeof import("node:child_process").spawn {
  let timeoutCount = 0;

  return (() => {
    const proc = new EventEmitter() as import("node:child_process").ChildProcessWithoutNullStreams;
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const stdin = new PassThrough();

    proc.stdout = stdout as import("node:child_process").ChildProcessWithoutNullStreams["stdout"];
    proc.stderr = stderr as import("node:child_process").ChildProcessWithoutNullStreams["stderr"];
    proc.stdin = stdin as import("node:child_process").ChildProcessWithoutNullStreams["stdin"];
    proc.kill = (() => {
      proc.emit("exit", 0, null);
      return true;
    }) as import("node:child_process").ChildProcessWithoutNullStreams["kill"];

    let buffer = "";
    stdin.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let idx = buffer.indexOf("\n");
      while (idx >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (line) {
          const req = JSON.parse(line) as { id?: string; method?: string };
          if (req.method === "initialize") {
            stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: req.id, result: { ok: true } })}\n`);
          } else if (req.method === "tools/list") {
            stdout.write(
              `${JSON.stringify({ jsonrpc: "2.0", id: req.id, result: { tools: [{ name: "codex" }, { name: "codex-reply" }] } })}\n`
            );
          } else if (req.method === "tools/call") {
            if (behavior === "timeout-once" && timeoutCount === 0) {
              timeoutCount += 1;
            } else if (behavior === "approval") {
              stdout.write(
                `${JSON.stringify({ jsonrpc: "2.0", id: req.id, error: { code: -32001, message: "approval required by policy" } })}\n`
              );
            } else {
              stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: req.id, result: { content: "fake-codex success" } })}\n`);
            }
          }
        }
        idx = buffer.indexOf("\n");
      }
    });

    return proc;
  }) as unknown as typeof import("node:child_process").spawn;
}

describe("McpStdioClient", () => {
  it("retries timeout and succeeds when next attempt responds", async () => {
    const client = new McpStdioClient({
      command: "node fake",
      cwd: "/tmp",
      timeoutMs: 30,
      retries: 1,
      spawnFn: createFakeSpawn("timeout-once")
    });

    await client.start();
    await client.listTools();
    const result = await client.callTool("codex", { prompt: "hello" });
    await client.shutdown();

    expect(String(result)).toContain("fake-codex");
  });

  it("maps approval error", async () => {
    const client = new McpStdioClient({
      command: "node fake",
      cwd: "/tmp",
      timeoutMs: 30,
      retries: 0,
      spawnFn: createFakeSpawn("approval")
    });

    await client.start();
    await client.listTools();

    await expect(client.callTool("codex", { prompt: "hello" })).rejects.toMatchObject<McpStdioClientError>({
      code: "MCP_APPROVAL",
      retryable: false
    });

    await client.shutdown();
  });
});
