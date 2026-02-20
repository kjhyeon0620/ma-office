import { exec as execCb } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { promisify } from "node:util";
import type { OfficePlugin, PolicyPlugin, RolePlugin, RunEvent, StagePlugin, ToolPlugin, ToolRegistry, WidgetPlugin } from "@ma-office/shared";
import { ArtifactWriter } from "../artifacts/writer.js";
import type { JsonlEventLogger } from "../events/jsonlLogger.js";
import { CodexEngineAdapter } from "../engines/codexEngineAdapter.js";
import type { EngineActionError, EngineAdapter } from "../engines/types.js";
import type { PluginRegistry } from "../plugins/registry.js";
import type { ProjectConfig } from "../types.js";
import type { RuntimeConfig } from "../runtime/runtimeConfig.js";

const exec = promisify(execCb);

const BASE_STAGES = ["SPEC", "IMPLEMENT", "TEST", "REVIEW", "GITHUB", "BLOG_FACTS"] as const;

type RunWorkflowArgs = {
  runId: string;
  runDir: string;
  projectPath: string;
  goal: string;
  config: ProjectConfig;
  logger: JsonlEventLogger;
  codexMock?: boolean;
  runtimeConfig?: RuntimeConfig;
  engineAdapter?: EngineAdapter;
  registry?: PluginRegistry;
};

type PolicyDecision = {
  stage: string;
  source: string;
  pass: boolean;
  reason?: string;
};

function normalizeFinalStatus(status: unknown): "blocked" | "error" {
  return status === "blocked" ? "blocked" : "error";
}

function truncateSummary(summary: string, limit = 200): string {
  if (summary.length <= limit) {
    return summary;
  }
  return `${summary.slice(0, limit - 3)}...`;
}

function toArtifactEventPath(projectPath: string, outputPath: string): string {
  const rel = relative(projectPath, outputPath);
  if (!rel || rel.startsWith("..")) {
    return outputPath;
  }
  return rel;
}

function buildManualFallback(
  goal: string,
  projectPath: string,
  workdir: string,
  commands: string[],
  notes: string
): { cwd: string; commands: string[]; notes: string } {
  const escapedGoal = goal.replace(/"/g, '\\"');
  const rerun = `MA_OFFICE_WORKDIR="${workdir}" pnpm --filter @ma-office/orchestrator dev -- run --goal "${escapedGoal}" --project "${projectPath}" --config project.yaml`;
  return {
    cwd: workdir,
    commands: [...commands, rerun],
    notes
  };
}

function event(runId: string, type: RunEvent["type"], payload?: Record<string, unknown>, extras?: Partial<RunEvent>): RunEvent {
  return {
    id: randomUUID(),
    runId,
    ts: new Date().toISOString(),
    level: "info",
    type,
    ...(payload ? { payload } : {}),
    ...(extras ?? {})
  } as RunEvent;
}

async function emitAgentNote(
  logger: JsonlEventLogger,
  runId: string,
  stage: string,
  agentId: string,
  noteType: "hypothesis" | "plan" | "decision" | "result" | "context" | "action",
  message: string,
  details?: {
    problem?: string;
    options?: string[];
    chosen?: string;
    why?: string;
    evidence?: string[];
    mcp?: Record<string, unknown>;
    manual?: {
      cwd: string;
      commands: string[];
      notes: string;
    };
  }
): Promise<void> {
  await logger.emit(
    event(
      runId,
      "agent_note",
      {
        noteType,
        message,
        ...(details ?? {})
      },
      { stage, agentId }
    )
  );
}

function asStagePlugins(plugins: OfficePlugin[]): StagePlugin[] {
  return plugins.filter((plugin): plugin is StagePlugin => plugin.kind === "stage");
}

function asPolicyPlugins(plugins: OfficePlugin[]): PolicyPlugin[] {
  return plugins.filter((plugin): plugin is PolicyPlugin => plugin.kind === "policy");
}

function asRolePlugins(plugins: OfficePlugin[]): RolePlugin[] {
  return plugins.filter((plugin): plugin is RolePlugin => plugin.kind === "role");
}

function asToolPlugins(plugins: OfficePlugin[]): ToolPlugin[] {
  return plugins.filter((plugin): plugin is ToolPlugin => plugin.kind === "tool");
}

function asWidgetPlugins(plugins: OfficePlugin[]): WidgetPlugin[] {
  return plugins.filter((plugin): plugin is WidgetPlugin => plugin.kind === "widget");
}

export function resolvePipelineStages(stagePlugins: StagePlugin[]): string[] {
  const stages = [...BASE_STAGES];

  for (const plugin of stagePlugins) {
    const stageName = plugin.stageName;
    if (!stages.includes(stageName)) {
      if (plugin.order?.before) {
        const idx = stages.indexOf(plugin.order.before);
        if (idx >= 0) {
          stages.splice(idx, 0, stageName);
          continue;
        }
      }
      if (plugin.order?.after) {
        const idx = stages.indexOf(plugin.order.after);
        if (idx >= 0) {
          stages.splice(idx + 1, 0, stageName);
          continue;
        }
      }
      stages.push(stageName);
    }
  }

  return stages;
}

async function emitBlocked(logger: JsonlEventLogger, runId: string, stage: string, message: string, manualSteps: string[]): Promise<void> {
  await logger.emit(
    event(
      runId,
      "agent_status",
      {
        status: "blocked",
        message: `${message}\nManual steps:\n${manualSteps.map((item) => `- ${item}`).join("\n")}`
      },
      { stage }
    )
  );
  console.error(message);
  for (const step of manualSteps) {
    console.error(`- ${step}`);
  }
}

async function writePolicyReport(
  runId: string,
  projectPath: string,
  logger: JsonlEventLogger,
  artifactWriter: ArtifactWriter,
  decisions: PolicyDecision[]
): Promise<void> {
  const policyPath = await artifactWriter.write("policy_report.json", JSON.stringify({ decisions }, null, 2));
  await logger.emit(
    event(runId, "artifact_created", {
      artifactType: "policy_report",
      path: relative(projectPath, policyPath),
      summary: `Policy evaluations: ${decisions.length}`
    })
  );
}

function builtInPolicyBlockReason(stage: string, config: ProjectConfig, priorEvents: RunEvent[]): string | undefined {
  const forbidden = config.policies?.forbidden_stages ?? [];
  if (forbidden.map((item) => item.toUpperCase()).includes(stage.toUpperCase())) {
    return `Stage ${stage} is forbidden by project policy.`;
  }

  const requireTest = config.policies?.require_test_stage_before_github ?? true;
  if (requireTest && stage === "GITHUB") {
    const testFinished = priorEvents.find(
      (event) =>
        event.type === "stage_finished" &&
        event.stage === "TEST" &&
        !((event.payload as { error?: unknown } | undefined)?.error)
    );
    if (!testFinished) {
      return "TEST stage must finish successfully before GITHUB stage.";
    }
  }

  return undefined;
}

function buildBlogFacts(goal: string, patch: string): Record<string, unknown> {
  const added = patch.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++ ")).length;
  const removed = patch.split("\n").filter((line) => line.startsWith("-") && !line.startsWith("--- ")).length;
  const files = patch
    .split("\n")
    .filter((line) => line.startsWith("diff --git "))
    .map((line) => line.split(" ")[2]?.replace("a/", ""))
    .filter((line): line is string => Boolean(line));

  return {
    Context: `Goal: ${goal}`,
    Problem: "Need reproducible summary material directly from code diff.",
    Solution: "Generated structured facts from git patch metadata (files changed and line churn).",
    "Key Code": files.slice(0, 5),
    Lesson: `Track objective signals in CI artifacts (files=${files.length}, +${added}/-${removed}).`
  };
}

export async function registerToolPlugins(
  runId: string,
  logger: JsonlEventLogger,
  toolPlugins: ToolPlugin[]
): Promise<Record<string, Record<string, unknown>>> {
  const tools: Record<string, Record<string, unknown>> = {};
  const registry: ToolRegistry = {
    register: (toolName, metadata) => {
      tools[toolName] = metadata;
    }
  };

  for (const plugin of toolPlugins) {
    await logger.emit(event(runId, "tool_call_started", { tool: plugin.toolName, summary: `register tool plugin: ${plugin.name}` }));
    await plugin.register(registry);
    await logger.emit(event(runId, "tool_call_finished", { tool: plugin.toolName, summary: "tool plugin registered" }));
  }

  return tools;
}

async function executeWidgetPlugins(
  runId: string,
  projectPath: string,
  logger: JsonlEventLogger,
  artifactWriter: ArtifactWriter,
  widgetPlugins: WidgetPlugin[]
): Promise<void> {
  if (widgetPlugins.length === 0) {
    return;
  }

  const events = await logger.readAll();
  const artifacts = events
    .filter((event) => event.type === "artifact_created")
    .map((event) => String((event.payload as { path?: string })?.path ?? ""))
    .filter(Boolean);

  for (const widget of widgetPlugins) {
    await logger.emit(event(runId, "tool_call_started", { tool: `widget:${widget.widgetName}`, summary: `compute widget: ${widget.name}` }));
    const model = await widget.compute(events, artifacts);
    const widgetPath = await artifactWriter.write(`widget_${widget.widgetName}.json`, JSON.stringify(model, null, 2));
    await logger.emit(
      event(runId, "artifact_created", {
        artifactType: "widget",
        path: relative(projectPath, widgetPath),
        summary: `Widget panel computed: ${widget.widgetName}`
      })
    );
    await logger.emit(event(runId, "tool_call_finished", { tool: `widget:${widget.widgetName}`, summary: "widget computed" }));
  }
}

export async function runDefaultPipeline(args: RunWorkflowArgs): Promise<void> {
  const { runId, runDir, projectPath, goal, config, logger, runtimeConfig, registry } = args;
  const codexMock = runtimeConfig ? runtimeConfig.mode === "mock" : args.codexMock !== false;
  const artifactWriter = new ArtifactWriter(runDir);
  const effectiveConfig: ProjectConfig = runtimeConfig?.baseBranch
    ? { ...config, base_branch: runtimeConfig.baseBranch }
    : config;
  const codexAdapter =
    args.engineAdapter ??
    (runtimeConfig?.mode === "real"
      ? new CodexEngineAdapter({
          command: runtimeConfig.mcpCommand,
          cwd: runtimeConfig.workdir,
          env: process.env
        })
      : undefined);
  const plugins = registry?.list() ?? [];
  const stagePlugins = asStagePlugins(plugins);
  const policyPlugins = asPolicyPlugins(plugins);
  const rolePlugins = asRolePlugins(plugins);
  const toolPlugins = asToolPlugins(plugins);
  const widgetPlugins = asWidgetPlugins(plugins);
  const stages = resolvePipelineStages(stagePlugins);
  const policyDecisions: PolicyDecision[] = [];
  let adapterShutdown = false;
  const finalizeRun = async (status?: "blocked" | "error"): Promise<void> => {
    if (codexAdapter && !adapterShutdown) {
      adapterShutdown = true;
      await codexAdapter.shutdown().catch(() => undefined);
    }
    await writePolicyReport(runId, projectPath, logger, artifactWriter, policyDecisions);
    await executeWidgetPlugins(runId, projectPath, logger, artifactWriter, widgetPlugins);
    await logger.emit(event(runId, "run_finished", status ? { goal, status } : { goal }));
  };

  await logger.emit(event(runId, "run_started", { goal }));
  const tools = await registerToolPlugins(runId, logger, toolPlugins);
  if (Object.keys(tools).length > 0) {
    const toolsPath = await artifactWriter.write("registered_tools.json", JSON.stringify(tools, null, 2));
    await logger.emit(
      event(runId, "artifact_created", {
        artifactType: "registered_tools",
        path: relative(projectPath, toolsPath),
        summary: `Registered ${Object.keys(tools).length} tool(s)`
      })
    );
  }

  if (codexAdapter) {
    try {
      const init = await codexAdapter.initialize();
      await logger.emit(
        event(runId, "agent_note", {
          noteType: "context",
          message: `Codex MCP connected; discovered ${init.tools.length} tools.`,
          mcp: init.mcp
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const details = error as EngineActionError;
      await logger.emit(
        event(runId, "agent_status", {
          status: details.status ?? "blocked",
          message: `Real mode startup failed: ${message}`
        })
      );
      await logger.emit(
        event(runId, "agent_note", {
          noteType: "action",
          message: "Codex MCP initialization failed; use manual fallback.",
          mcp: details.mcp ?? { requestId: "startup", tool: "initialize", state: "error", errorCode: details.errorCode ?? "MCP_TRANSPORT" },
          manual: details.manual ?? {
            cwd: runtimeConfig.workdir,
            commands: [runtimeConfig.mcpCommand, "codex login"],
            notes: "Verify MCP command/auth, then rerun."
          }
        })
      );
      await finalizeRun(normalizeFinalStatus(details.status));
      return;
    }
  }

  for (const stage of stages) {
    await logger.emit(event(runId, "stage_started", { stage }, { stage }));

    const priorEvents = await logger.readAll();
    const builtInBlocked = builtInPolicyBlockReason(stage, effectiveConfig, priorEvents);
    if (builtInBlocked) {
      policyDecisions.push({ stage, source: "built-in-policy", pass: false, reason: builtInBlocked });
      await emitBlocked(logger, runId, stage, `Policy blocked stage ${stage}: ${builtInBlocked}`, [
        "Update project.yaml policies section if this stage should be allowed.",
        "Re-run workflow after policy update."
      ]);
      await logger.emit(event(runId, "stage_finished", { stage, blockedBy: "built-in-policy" }, { stage, level: "warn" }));
      await finalizeRun("blocked");
      return;
    }
    policyDecisions.push({ stage, source: "built-in-policy", pass: true });

    for (const policy of policyPlugins) {
      const result = await policy.evaluate({ runId, stage, events: priorEvents, goal });
      if (!result.pass) {
        policyDecisions.push({ stage, source: policy.policyName, pass: false, reason: result.reason });
        await emitBlocked(logger, runId, stage, `Policy blocked stage ${stage}: ${result.reason ?? policy.policyName}`, [
          "Review project policies and workflow plugins.",
          "Adjust .ma-office/plugins or built-in policy settings.",
          "Re-run the workflow after policy remediation."
        ]);
        await logger.emit(event(runId, "stage_finished", { stage, blockedBy: policy.policyName }, { stage, level: "warn" }));
        await finalizeRun("blocked");
        return;
      }
      policyDecisions.push({ stage, source: policy.policyName, pass: true });
    }

    const agentId = `${stage.toLowerCase()}-agent`;
    await logger.emit(event(runId, "agent_spawned", { agentId, role: stage.toLowerCase(), task: `${stage} stage` }, { stage, agentId }));
    await logger.emit(event(runId, "agent_status", { status: "working", message: `${stage} started` }, { stage, agentId }));
    await emitAgentNote(logger, runId, stage, agentId, "context", `Received stage ${stage} with goal: ${goal}`);
    await emitAgentNote(logger, runId, stage, agentId, "plan", `Execute ${stage} responsibilities and emit artifacts/events.`, {
      options: ["Built-in stage flow", "Role plugin override", "Stage plugin extension"],
      chosen: "Dynamic selection based on installed plugins",
      why: "Keeps defaults stable while allowing per-project extension."
    });

    const maxRetries = Math.max(0, effectiveConfig.policies?.max_retries_per_stage ?? 0);
    let attempt = 0;
    let stageComplete = false;
    while (!stageComplete) {
      try {
      const matchedRoles = rolePlugins.filter((plugin) => plugin.roleName.toLowerCase() === stage.toLowerCase());
      for (const plugin of matchedRoles) {
        await plugin.createAgent({
          runId,
          stageName: stage,
          goal,
          projectPath,
          config: effectiveConfig as unknown as Record<string, unknown>,
          tools,
          emit: (e) => logger.emit(e)
        });
      }
      const replacedByRole = matchedRoles.some((plugin) => plugin.replaceDefault);
      if (replacedByRole) {
        await emitAgentNote(logger, runId, stage, agentId, "decision", "Role plugin requested replaceDefault=true; skipping built-in stage logic.", {
          problem: "Avoid duplicate execution when custom role fully owns stage behavior.",
          chosen: "Skip built-in branch",
          why: "Prevents conflicting side effects and duplicate artifacts."
        });
      }

      if (!replacedByRole && stage === "IMPLEMENT") {
        await emitAgentNote(logger, runId, stage, agentId, "hypothesis", "Primary path is Codex MCP implementation for the current goal.", {
          problem: "Need code changes with minimal manual orchestration.",
          options: ["Codex MCP", "No-op mock", "Role override"],
          chosen: "Codex MCP",
          why: "Default implementation channel in the pipeline."
        });
        await logger.emit(event(runId, "tool_call_started", { tool: "codex-mcp", summary: "implement changes" }, { stage, agentId }));
        if (codexAdapter) {
          try {
            const result = await codexAdapter.editFiles({
              runId,
              goal,
              stage,
              projectPath,
              workdir: runtimeConfig?.workdir ?? projectPath
            });
            await logger.emit(event(runId, "tool_call_finished", { tool: "codex-mcp", summary: truncateSummary(result.summary) }, { stage, agentId }));
            const implementOutput = (result.output ?? result.summary).trim();
            if (implementOutput.length > 200) {
              const outputPath = await artifactWriter.write("mcp_implement_output.txt", implementOutput);
              await logger.emit(
                event(
                  runId,
                  "artifact_created",
                  {
                    artifactType: "mcp_output",
                    path: toArtifactEventPath(projectPath, outputPath),
                    summary: "Raw MCP IMPLEMENT output"
                  },
                  { stage, agentId }
                )
              );
            }
            await emitAgentNote(logger, runId, stage, agentId, "result", `Implementation response: ${result.summary}`, {
              evidence: [result.summary],
              mcp: result.mcp
            });
          } catch (error) {
            const details = error as EngineActionError;
            const status = normalizeFinalStatus(details.status);
            await emitAgentNote(logger, runId, stage, agentId, "action", `IMPLEMENT blocked/error: ${details.message}`, {
              chosen: "manual fallback",
              why: "MCP request could not complete within policy constraints.",
              mcp: details.mcp ?? { requestId: "implement", tool: "codex", state: status, errorCode: details.errorCode },
              manual:
                details.manual ??
                buildManualFallback(
                  goal,
                  projectPath,
                  runtimeConfig?.workdir ?? projectPath,
                  ["git status", "git diff"],
                  `Apply IMPLEMENT changes manually for goal "${goal}", then rerun.`
                )
            });
            throw error;
          }
        } else {
          const summary = `mocked Codex MCP result for: ${goal}`;
          await logger.emit(event(runId, "tool_call_finished", { tool: "codex-mcp", summary }, { stage, agentId }));
          await emitAgentNote(logger, runId, stage, agentId, "result", `Implementation response: ${summary}`, {
            evidence: [summary]
          });
        }
      }

      if (!replacedByRole && stage === "TEST") {
        await emitAgentNote(logger, runId, stage, agentId, "action", `Run configured tests: ${effectiveConfig.test_cmd}`, {
          chosen: effectiveConfig.test_cmd,
          why: "Project-level reproducible verification command."
        });
        await logger.emit(
          event(
            runId,
            "tool_call_started",
            {
              tool: codexAdapter ? "codex-mcp" : "test_cmd",
              summary: codexAdapter ? `run test via MCP: ${effectiveConfig.test_cmd}` : effectiveConfig.test_cmd
            },
            { stage, agentId }
          )
        );
        let testOutput = "";
        if (codexAdapter) {
          try {
            const result = await codexAdapter.runCommands({
              runId,
              goal,
              stage,
              projectPath,
              workdir: runtimeConfig?.workdir ?? projectPath,
              testCommand: effectiveConfig.test_cmd
            });
            testOutput = result.output ?? result.summary;
            const testRawOutput = testOutput.trim();
            if (testRawOutput.length > 200) {
              const outputPath = await artifactWriter.write("mcp_test_output.txt", testRawOutput);
              await logger.emit(
                event(
                  runId,
                  "artifact_created",
                  {
                    artifactType: "mcp_output",
                    path: toArtifactEventPath(projectPath, outputPath),
                    summary: "Raw MCP TEST output"
                  },
                  { stage, agentId }
                )
              );
            }
            await emitAgentNote(logger, runId, stage, agentId, "result", "Codex executed TEST stage command(s).", {
              evidence: [result.summary],
              mcp: result.mcp
            });
          } catch (error) {
            const details = error as EngineActionError;
            const status = normalizeFinalStatus(details.status);
            await emitAgentNote(logger, runId, stage, agentId, "action", `TEST blocked/error: ${details.message}`, {
              chosen: "manual fallback",
              why: "MCP request could not complete within policy constraints.",
              mcp: details.mcp ?? { requestId: "test", tool: "codex", state: status, errorCode: details.errorCode },
              manual:
                details.manual ??
                buildManualFallback(
                  goal,
                  projectPath,
                  runtimeConfig?.workdir ?? projectPath,
                  [effectiveConfig.test_cmd],
                  `Run TEST command manually for goal "${goal}", then rerun.`
                )
            });
            throw error;
          }
        } else {
          const { stdout, stderr } = await exec(effectiveConfig.test_cmd, { cwd: projectPath });
          testOutput = `${stdout}\n${stderr}`.trim();
        }
        const testSummaryPath = await artifactWriter.write("test_summary.txt", testOutput.trim());
        await logger.emit(
          event(
            runId,
            "artifact_created",
            {
              artifactType: "test_summary",
              path: relative(projectPath, testSummaryPath),
              summary: "Test output"
            },
            { stage, agentId }
          )
        );
        await logger.emit(
          event(
            runId,
            "tool_call_finished",
            {
              tool: codexAdapter ? "codex-mcp" : "test_cmd",
              summary: codexAdapter ? truncateSummary(`tests completed via MCP (${effectiveConfig.test_cmd})`) : "tests completed"
            },
            { stage, agentId }
          )
        );
        await emitAgentNote(logger, runId, stage, agentId, "result", "Test command completed and summary artifact was generated.", {
          evidence: ["artifacts/test_summary.txt"]
        });
      }

      if (!replacedByRole && stage === "GITHUB") {
        await emitAgentNote(logger, runId, stage, agentId, "plan", "Generate diff patch for downstream blog facts.", {
          chosen: `git diff origin/${effectiveConfig.base_branch}...HEAD`,
          why: "Patch is the handoff artifact for blog extraction."
        });
        await logger.emit(event(runId, "tool_call_started", { tool: "git", summary: "generate blog diff patch" }, { stage, agentId }));
        const base = `origin/${effectiveConfig.base_branch}`;
        const diffCmd = `git diff ${base}...HEAD`;
        const { stdout } = await exec(diffCmd, { cwd: projectPath });
        const patchPath = await artifactWriter.write("blog_diff.patch", stdout);
        await logger.emit(
          event(
            runId,
            "artifact_created",
            {
              artifactType: "diff_patch",
              path: relative(projectPath, patchPath),
              summary: `Generated with ${diffCmd}`
            },
            { stage, agentId }
          )
        );
        await logger.emit(event(runId, "tool_call_finished", { tool: "git", summary: "blog diff generated" }, { stage, agentId }));
        await emitAgentNote(logger, runId, stage, agentId, "result", "Patch artifact blog_diff.patch generated.", {
          evidence: ["artifacts/blog_diff.patch"]
        });
      }

      if (!replacedByRole && stage === "BLOG_FACTS") {
        await emitAgentNote(logger, runId, stage, agentId, "action", "Read patch and extract blog-ready facts.", {
          chosen: "Patch metadata extraction",
          why: "Deterministic summary from verifiable diff signals."
        });
        const patchPath = `${runDir}/artifacts/blog_diff.patch`;
        const patch = await readFile(patchPath, "utf8").catch(() => "");
        const summary = buildBlogFacts(goal, patch);
        const blogFactsPath = await artifactWriter.write("blog_facts.json", JSON.stringify(summary, null, 2));
        await logger.emit(
          event(
            runId,
            "artifact_created",
            {
              artifactType: "blog_facts",
              path: relative(projectPath, blogFactsPath),
              summary: "Blog facts exported"
            },
            { stage, agentId }
          )
        );
        await emitAgentNote(logger, runId, stage, agentId, "result", "blog_facts.json generated from patch metadata.", {
          evidence: ["artifacts/blog_facts.json"]
        });
      }

      for (const plugin of stagePlugins.filter((plugin) => plugin.stageName === stage)) {
        await plugin.run({
          runId,
          stageName: stage,
          goal,
          projectPath,
          config: effectiveConfig as unknown as Record<string, unknown>,
          tools,
          emit: (e) => logger.emit(e)
        });
      }

      await logger.emit(
        event(
          runId,
          "cost_update",
          {
            model: codexMock ? "mock" : "gpt-5",
            tokensIn: 0,
            tokensOut: 0,
            estimatedCost: 0
          },
          { stage, agentId }
        )
      );

      await logger.emit(event(runId, "agent_status", { status: "done", message: `${stage} complete` }, { stage, agentId }));
      await emitAgentNote(logger, runId, stage, agentId, "result", `Stage ${stage} completed successfully.`);
      await logger.emit(event(runId, "stage_finished", { stage }, { stage }));
      stageComplete = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const details = error as EngineActionError;
        const status = normalizeFinalStatus(details.status);
        if (stage === "GITHUB") {
          await emitBlocked(logger, runId, stage, "GitHub stage blocked.", [
            `Ensure branch ${effectiveConfig.base_branch} exists on origin.`,
            "Run: git fetch origin",
            `Run: git diff origin/${effectiveConfig.base_branch}...HEAD > runs/${runId}/artifacts/blog_diff.patch`
          ]);
          await logger.emit(event(runId, "stage_finished", { stage, error: message }, { stage, level: "error" }));
          await finalizeRun("blocked");
          return;
        }

        if (status === "blocked") {
          await logger.emit(event(runId, "agent_status", { status: "blocked", message }, { stage, agentId, level: "warn" }));
          await emitAgentNote(logger, runId, stage, agentId, "decision", `Stage blocked and will not retry: ${message}`, {
            chosen: "fail-fast",
            why: "Blocked errors (policy/approval/timeout) require manual remediation.",
            mcp: details.mcp,
            manual: details.manual
          });
          await logger.emit(event(runId, "stage_finished", { stage, error: message }, { stage, level: "warn" }));
          await finalizeRun("blocked");
          return;
        }

        if (attempt < maxRetries) {
          attempt += 1;
          await logger.emit(event(runId, "agent_status", { status: "working", message: `${stage} retry ${attempt}/${maxRetries}` }, { stage, agentId, level: "warn" }));
          await emitAgentNote(logger, runId, stage, agentId, "decision", `Stage failed and will retry (${attempt}/${maxRetries}): ${message}`, {
            chosen: "retry",
            why: "Configured stage retry policy."
          });
          continue;
        }

        await logger.emit(event(runId, "agent_status", { status, message }, { stage, agentId, level: status === "blocked" ? "warn" : "error" }));
        await emitAgentNote(logger, runId, stage, agentId, "decision", `Stage failed with error: ${message}`, {
          chosen: "fail",
          why: "Retry budget exhausted.",
          mcp: details.mcp,
          manual: details.manual
        });
        await logger.emit(event(runId, "stage_finished", { stage, error: message }, { stage, level: status === "blocked" ? "warn" : "error" }));
        await finalizeRun("error");
        return;
      }
    }
  }

  await finalizeRun();
}
