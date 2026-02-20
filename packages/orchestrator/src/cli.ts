#!/usr/bin/env node
import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { Command } from "commander";
import YAML from "yaml";
import { JsonlEventLogger } from "./events/jsonlLogger.js";
import { loadPlugins } from "./plugins/loader.js";
import { installPresets } from "./presets.js";
import { DEFAULT_PROJECT_CONFIG, type ProjectConfig } from "./types.js";
import { runDefaultPipeline } from "./workflow/defaultPipeline.js";
import { resolveRuntimeConfig } from "./runtime/runtimeConfig.js";
import type { RuntimeConfig } from "./runtime/runtimeConfig.js";
import { RuntimeConfigError } from "./runtime/runtimeConfig.js";

const program = new Command();
const invocationCwd = process.env.INIT_CWD ?? process.cwd();

program.name("ma-office").description("Reusable multi-agent office").version("0.1.0");

program
  .command("init")
  .option("--project <path>", "Target project path", ".")
  .action(async (opts) => {
    const projectPath = resolve(invocationCwd, opts.project);
    await installPresets(projectPath);
    console.log(`Initialized ma-office presets in ${projectPath}`);
  });

program
  .command("run")
  .requiredOption("--goal <text>", "Goal for this run")
  .option("--project <path>", "Project root", ".")
  .option("--config <path>", "project config path", "project.yaml")
  .option("--run-id <id>", "optional run id")
  .option("--codex-mock", "Use mock Codex MCP integration", true)
  .action(async (opts) => {
    const projectPath = resolve(invocationCwd, opts.project);
    const configPath = resolve(projectPath, opts.config);
    const runId = opts.runId ?? `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;

    const configRaw = await readFile(configPath, "utf8").catch(() => "");
    const config = { ...DEFAULT_PROJECT_CONFIG, ...(YAML.parse(configRaw) ?? {}) } as ProjectConfig;

    const registry = await loadPlugins({ projectPath, npmPlugins: config.plugins?.npm });

    const runDir = join(projectPath, "runs", runId);
    await mkdir(runDir, { recursive: true });
    const logger = new JsonlEventLogger(join(runDir, "events.jsonl"));
    await logger.init();
    let runtimeConfig: RuntimeConfig;
    try {
      runtimeConfig = await resolveRuntimeConfig({
        projectPath,
        codexMockFlag: Boolean(opts.codexMock),
        env: process.env
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = error instanceof RuntimeConfigError ? error.code : "UNKNOWN";
      const now = new Date().toISOString();
      await logger.emit({
        id: randomUUID(),
        runId,
        ts: now,
        level: "error",
        type: "run_started",
        payload: { goal: opts.goal }
      });
      await logger.emit({
        id: randomUUID(),
        runId,
        ts: now,
        level: "error",
        type: "agent_status",
        payload: { status: "blocked", message: `Runtime configuration failed [${code}]: ${message}` }
      });
      await logger.emit({
        id: randomUUID(),
        runId,
        ts: now,
        level: "error",
        type: "run_finished",
        payload: { goal: opts.goal, status: "blocked" }
      });
      throw error;
    }

    await runDefaultPipeline({
      runId,
      runDir,
      projectPath,
      goal: opts.goal,
      config,
      logger,
      runtimeConfig,
      registry
    });

    console.log(`Run complete: ${runId}`);
  });

program
  .command("dashboard")
  .option("--project <path>", "Project root", ".")
  .option("--port <number>", "Port", "3000")
  .action(async (opts) => {
    const projectPath = resolve(invocationCwd, opts.project);
    const proc = spawn("pnpm", ["--filter", "@ma-office/dashboard", "dev", "-p", String(opts.port)], {
      cwd: projectPath,
      stdio: "inherit",
      env: {
        ...process.env,
        MA_OFFICE_PROJECT_ROOT: projectPath
      }
    });

    proc.on("exit", (code) => {
      process.exit(code ?? 0);
    });
  });

program.parseAsync(process.argv);
