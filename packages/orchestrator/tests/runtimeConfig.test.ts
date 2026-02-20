import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { detectCodexMcpCommand, resolveRuntimeConfig, RuntimeConfigError } from "../src/runtime/runtimeConfig.js";

describe("runtime config", () => {
  it("defaults to mock mode", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "ma-office-runtime-"));
    const cfg = await resolveRuntimeConfig({
      projectPath,
      env: {
        MA_OFFICE_MCP_COMMAND: "node fake",
        HOME: projectPath
      }
    });

    expect(cfg.mode).toBe("mock");
    expect(cfg.mcpTransport).toBe("stdio");
  });

  it("fails fast for invalid mode", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "ma-office-runtime-"));

    await expect(
      resolveRuntimeConfig({
        projectPath,
        env: {
          MA_OFFICE_MODE: "realtime",
          MA_OFFICE_MCP_COMMAND: "node fake",
          HOME: projectPath
        }
      })
    ).rejects.toThrow(/Invalid MA_OFFICE_MODE/);
  });

  it("fails fast in real mode when auth is missing", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "ma-office-runtime-"));

    await expect(
      resolveRuntimeConfig({
        projectPath,
        env: {
          MA_OFFICE_MODE: "real",
          MA_OFFICE_MCP_COMMAND: "node fake",
          MA_OFFICE_WORKDIR: "/home/test/maOffice",
          HOME: projectPath
        }
      })
    ).rejects.toThrow(/requires Codex auth/);
  });

  it("fails fast with stable code when workdir is under /mnt", async () => {
    const projectPath = await mkdtemp(join(tmpdir(), "ma-office-runtime-"));
    await expect(
      resolveRuntimeConfig({
        projectPath,
        env: {
          MA_OFFICE_MODE: "real",
          MA_OFFICE_MCP_COMMAND: "node fake",
          MA_OFFICE_WORKDIR: "/mnt/c/maOffice",
          OPENAI_API_KEY: "test-key",
          HOME: projectPath
        }
      })
    ).rejects.toMatchObject<RuntimeConfigError>({
      code: "WORKDIR_UNSUPPORTED"
    });
  });

  it("accepts real mode when auth file exists", async () => {
    const home = await mkdtemp(join(tmpdir(), "ma-office-runtime-home-"));
    await mkdir(join(home, ".codex"), { recursive: true });
    await writeFile(join(home, ".codex", "auth.json"), "{}", "utf8");

    const cfg = await resolveRuntimeConfig({
      projectPath: "/home/test/maOffice",
      env: {
        MA_OFFICE_MODE: "real",
        MA_OFFICE_MCP_COMMAND: "node fake",
        MA_OFFICE_WORKDIR: "/home/test/maOffice",
        HOME: home
      }
    });

    expect(cfg.mode).toBe("real");
    expect(cfg.mcpCommand).toBe("node fake");
  });

  it("detects mcp-server command when available", async () => {
    const cmd = await detectCodexMcpCommand(process.env);
    expect(cmd === "codex mcp-server" || cmd === "codex mcp").toBe(true);
  });
});
