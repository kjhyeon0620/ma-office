import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id?: string;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
};

export type McpStdioClientOptions = {
  command: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  retries?: number;
  spawnFn?: typeof spawn;
};

export class McpStdioClientError extends Error {
  constructor(
    message: string,
    readonly code: "MCP_TIMEOUT" | "MCP_TRANSPORT" | "MCP_APPROVAL" | "MCP_TOOL" | "MCP_CONFIG",
    readonly retryable: boolean
  ) {
    super(message);
  }
}

function splitCommand(input: string): { bin: string; args: string[] } {
  const parts = input
    .trim()
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    throw new McpStdioClientError("MCP command is empty.", "MCP_CONFIG", false);
  }

  return { bin: parts[0] as string, args: parts.slice(1) };
}

function classifyToolError(message: string, rpcCode?: number): "MCP_APPROVAL" | "MCP_TOOL" {
  if (rpcCode === -32001) {
    return "MCP_APPROVAL";
  }
  const normalized = message.toLowerCase();
  if (
    normalized.includes("approval") ||
    normalized.includes("permission") ||
    normalized.includes("blocked") ||
    normalized.includes("policy")
  ) {
    return "MCP_APPROVAL";
  }
  return "MCP_TOOL";
}

export class McpStdioClient {
  private readonly timeoutMs: number;
  private readonly retries: number;
  private proc?: ChildProcessWithoutNullStreams;
  private initialized = false;
  private lineBuffer = "";
  private pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();

  constructor(private readonly options: McpStdioClientOptions) {
    this.timeoutMs = options.timeoutMs ?? 45_000;
    this.retries = Math.max(0, options.retries ?? 1);
  }

  async start(): Promise<void> {
    if (this.proc) {
      return;
    }

    const { bin, args } = splitCommand(this.options.command);
    const child = (this.options.spawnFn ?? spawn)(bin, args, {
      cwd: this.options.cwd,
      env: this.options.env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"]
    });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => {
      this.lineBuffer += chunk;
      let idx = this.lineBuffer.indexOf("\n");
      while (idx >= 0) {
        const line = this.lineBuffer.slice(0, idx).trim();
        this.lineBuffer = this.lineBuffer.slice(idx + 1);
        if (line) {
          this.onLine(line);
        }
        idx = this.lineBuffer.indexOf("\n");
      }
    });

    child.on("error", (error) => {
      this.rejectAll(new McpStdioClientError(`MCP process error: ${error.message}`, "MCP_TRANSPORT", true));
    });

    child.on("exit", (code, signal) => {
      const msg = `MCP process exited (code=${code ?? "none"}, signal=${signal ?? "none"}).`;
      this.rejectAll(new McpStdioClientError(msg, "MCP_TRANSPORT", true));
      this.proc = undefined;
      this.initialized = false;
    });

    this.proc = child;

    try {
      await this.request("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "ma-office", version: "0.1.0" }
      });
      this.notify("notifications/initialized", {});
      this.initialized = true;
    } catch (error) {
      await this.shutdown();
      throw error;
    }
  }

  async listTools(): Promise<Array<{ name: string; description?: string }>> {
    const result = (await this.request("tools/list", {})) as { tools?: Array<{ name?: string; description?: string }> };
    return (result.tools ?? [])
      .filter((tool): tool is { name: string; description?: string } => typeof tool.name === "string" && tool.name.length > 0)
      .map((tool) => ({ name: tool.name, description: tool.description }));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const result = (await this.request("tools/call", {
      name,
      arguments: args
    })) as { isError?: boolean; content?: unknown; structuredContent?: unknown };

    if (result.isError) {
      const message = typeof result.content === "string" ? result.content : JSON.stringify(result.content ?? {});
      const code = classifyToolError(message);
      throw new McpStdioClientError(
        `MCP tool call failed for ${name}: ${message}`,
        code,
        code !== "MCP_APPROVAL"
      );
    }

    return result.structuredContent ?? result.content ?? result;
  }

  async shutdown(): Promise<void> {
    if (!this.proc) {
      return;
    }

    const child = this.proc;
    this.proc = undefined;
    this.initialized = false;

    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          resolve();
        }
      };
      child.once("exit", finish);
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!done) {
          child.kill("SIGKILL");
          finish();
        }
      }, 2_000);
    });
  }

  private onLine(line: string): void {
    let message: JsonRpcResponse;
    try {
      message = JSON.parse(line) as JsonRpcResponse;
    } catch {
      return;
    }

    if (!message.id) {
      return;
    }

    const entry = this.pending.get(message.id);
    if (!entry) {
      return;
    }

    clearTimeout(entry.timer);
    this.pending.delete(message.id);

    if (message.error) {
      const text = message.error.message || "Unknown MCP error";
      const code = classifyToolError(text, message.error.code);
      entry.reject(new McpStdioClientError(text, code, code !== "MCP_APPROVAL"));
      return;
    }

    entry.resolve(message.result);
  }

  private notify(method: string, params: Record<string, unknown>): void {
    if (!this.proc || !this.initialized && method !== "notifications/initialized") {
      return;
    }

    const msg = JSON.stringify({ jsonrpc: "2.0", method, params });
    this.proc.stdin.write(`${msg}\n`);
  }

  private async request(method: string, params: Record<string, unknown>): Promise<unknown> {
    let attempt = 0;
    while (true) {
      try {
        if (!this.proc) {
          throw new McpStdioClientError("MCP process is not running.", "MCP_TRANSPORT", true);
        }

        const req: JsonRpcRequest = {
          jsonrpc: "2.0",
          id: randomUUID(),
          method,
          params
        };

        const result = await new Promise<unknown>((resolve, reject) => {
          const timer = setTimeout(() => {
            this.pending.delete(req.id);
            reject(new McpStdioClientError(`MCP request timeout for ${method}`, "MCP_TIMEOUT", true));
          }, this.timeoutMs);

          this.pending.set(req.id, { resolve, reject, timer });
          this.proc?.stdin.write(`${JSON.stringify(req)}\n`);
        });

        return result;
      } catch (error) {
        const known = error instanceof McpStdioClientError ? error : new McpStdioClientError(String(error), "MCP_TRANSPORT", true);
        if (!known.retryable || attempt >= this.retries) {
          throw known;
        }

        attempt += 1;
      }
    }
  }

  private rejectAll(error: Error): void {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
