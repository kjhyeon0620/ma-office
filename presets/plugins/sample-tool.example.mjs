/**
 * Rename to sample-tool.mjs to enable this plugin.
 */
export default {
  name: "sample-mcp-tool",
  apiVersion: "v1",
  kind: "tool",
  toolName: "sample-mcp",
  async register(registry) {
    registry.register("sample-mcp", {
      transport: "mcp",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
      summary: "Example MCP tool registration"
    });
  }
};
