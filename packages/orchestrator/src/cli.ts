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

const program = new Command();

program.name("ma-office").description("Reusable multi-agent office").version("0.1.0");

program
  .command("init")
  .option("--project <path>", "Target project path", ".")
  .action(async (opts) => {
    const projectPath = resolve(process.cwd(), opts.project);
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
    const projectPath = resolve(process.cwd(), opts.project);
    const configPath = resolve(projectPath, opts.config);
    const runId = opts.runId ?? `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;

    const configRaw = await readFile(configPath, "utf8").catch(() => "");
    const config = { ...DEFAULT_PROJECT_CONFIG, ...(YAML.parse(configRaw) ?? {}) } as ProjectConfig;

    const registry = await loadPlugins({ projectPath, npmPlugins: config.plugins?.npm });

    const runDir = join(projectPath, "runs", runId);
    await mkdir(runDir, { recursive: true });
    const logger = new JsonlEventLogger(join(runDir, "events.jsonl"));
    await logger.init();

    await runDefaultPipeline({
      runId,
      runDir,
      projectPath,
      goal: opts.goal,
      config,
      logger,
      codexMock: Boolean(opts.codexMock),
      registry
    });

    console.log(`Run complete: ${runId}`);
  });

program
  .command("dashboard")
  .option("--project <path>", "Project root", ".")
  .option("--port <number>", "Port", "3000")
  .action(async (opts) => {
    const projectPath = resolve(process.cwd(), opts.project);
    const proc = spawn("pnpm", ["--filter", "@ma-office/dashboard", "dev", "--", "-p", String(opts.port)], {
      cwd: projectPath,
      stdio: "inherit"
    });

    proc.on("exit", (code) => {
      process.exit(code ?? 0);
    });
  });

program.parseAsync(process.argv);
