import { access, constants } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type RuntimeMode = "mock" | "real";
export type RuntimeConfigErrorCode = "INVALID_MODE" | "INVALID_TRANSPORT" | "EMPTY_COMMAND" | "WORKDIR_UNSUPPORTED" | "AUTH_MISSING";

export class RuntimeConfigError extends Error {
  constructor(message: string, readonly code: RuntimeConfigErrorCode) {
    super(message);
  }
}

export type RuntimeConfig = {
  mode: RuntimeMode;
  mcpCommand: string;
  mcpTransport: "stdio";
  workdir: string;
  baseBranch?: string;
};

export type RuntimeConfigInput = {
  projectPath: string;
  codexMockFlag?: boolean;
  env?: NodeJS.ProcessEnv;
};

function parseMode(value: string | undefined): RuntimeMode | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "mock" || normalized === "real") {
    return normalized;
  }
  throw new RuntimeConfigError(`Invalid MA_OFFICE_MODE: ${value}. Expected mock|real.`, "INVALID_MODE");
}

function parseTransport(value: string | undefined): "stdio" {
  if (!value || value.trim() === "") {
    return "stdio";
  }
  const normalized = value.trim().toLowerCase();
  if (normalized !== "stdio") {
    throw new RuntimeConfigError(`Invalid MA_OFFICE_MCP_TRANSPORT: ${value}. Only stdio is supported.`, "INVALID_TRANSPORT");
  }
  return "stdio";
}

async function hasCodexAuth(env: NodeJS.ProcessEnv): Promise<boolean> {
  if (env.OPENAI_API_KEY && env.OPENAI_API_KEY.trim()) {
    return true;
  }

  const authPath = resolve(env.HOME ?? homedir(), ".codex", "auth.json");
  try {
    await access(authPath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export async function detectCodexMcpCommand(env: NodeJS.ProcessEnv = process.env): Promise<string> {
  try {
    const { stdout } = await execFileAsync("codex", ["--help"], {
      env,
      timeout: 8_000,
      maxBuffer: 1024 * 1024
    });

    if (stdout.includes("mcp-server")) {
      return "codex mcp-server";
    }

    if (stdout.includes(" mcp ")) {
      return "codex mcp";
    }
  } catch {
    // Ignore discovery errors and keep backward-compatible default.
  }

  return "codex mcp";
}

export async function resolveRuntimeConfig(input: RuntimeConfigInput): Promise<RuntimeConfig> {
  const env = input.env ?? process.env;
  const modeFromEnv = parseMode(env.MA_OFFICE_MODE);
  const mode = modeFromEnv ?? (input.codexMockFlag === false ? "real" : "mock");
  const mcpTransport = parseTransport(env.MA_OFFICE_MCP_TRANSPORT);
  const autoCommand = await detectCodexMcpCommand(env);
  const mcpCommand = (env.MA_OFFICE_MCP_COMMAND?.trim() || autoCommand).trim();
  const workdir = resolve(env.MA_OFFICE_WORKDIR?.trim() || input.projectPath);
  const baseBranch = env.MA_OFFICE_BASE_BRANCH?.trim() || undefined;

  if (!mcpCommand) {
    throw new RuntimeConfigError("MA_OFFICE_MCP_COMMAND resolved to an empty value.", "EMPTY_COMMAND");
  }

  if (mode === "real") {
    if (workdir.startsWith("/mnt/")) {
      throw new RuntimeConfigError(
        `Real mode requires Linux filesystem paths. MA_OFFICE_WORKDIR=${workdir} is under /mnt and is blocked due to known ACL/rename instability (pnpm/Next/file ops). Use a WSL path like ~/maOffice.`,
        "WORKDIR_UNSUPPORTED"
      );
    }

    const authConfigured = await hasCodexAuth(env);
    if (!authConfigured) {
      throw new RuntimeConfigError(
        "Real mode requires Codex auth. Set OPENAI_API_KEY or run codex login so ~/.codex/auth.json is available.",
        "AUTH_MISSING"
      );
    }
  }

  return {
    mode,
    mcpCommand,
    mcpTransport,
    workdir,
    baseBranch
  };
}
