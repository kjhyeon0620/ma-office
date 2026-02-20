export type CodexMcpClientOptions = {
  mock?: boolean;
};

export class CodexMcpClient {
  constructor(private readonly options: CodexMcpClientOptions = { mock: true }) {}

  async runTask(task: string): Promise<{ summary: string }> {
    if (this.options.mock !== false) {
      return { summary: `mocked Codex MCP result for: ${task}` };
    }

    // PR1 intentionally keeps a thin integration seam.
    throw new Error("Real Codex MCP integration is not wired in PR1. Use mock mode.");
  }
}
