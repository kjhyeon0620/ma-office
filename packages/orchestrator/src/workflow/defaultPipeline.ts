import { exec as execCb } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { promisify } from "node:util";
import type { OfficePlugin, PolicyPlugin, RunEvent, StagePlugin } from "@ma-office/shared";
import { ArtifactWriter } from "../artifacts/writer.js";
import type { JsonlEventLogger } from "../events/jsonlLogger.js";
import { CodexMcpClient } from "../integrations/codexMcp.js";
import type { PluginRegistry } from "../plugins/registry.js";
import type { ProjectConfig } from "../types.js";

const exec = promisify(execCb);

const BASE_STAGES = ["SPEC", "IMPLEMENT", "TEST", "REVIEW", "GITHUB", "BLOG_FACTS"] as const;

type RunWorkflowArgs = {
  runId: string;
  runDir: string;
  projectPath: string;
  goal: string;
  config: ProjectConfig;
  logger: JsonlEventLogger;
  codexMock: boolean;
  registry?: PluginRegistry;
};

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

function asStagePlugins(plugins: OfficePlugin[]): StagePlugin[] {
  return plugins.filter((plugin): plugin is StagePlugin => plugin.kind === "stage");
}

function asPolicyPlugins(plugins: OfficePlugin[]): PolicyPlugin[] {
  return plugins.filter((plugin): plugin is PolicyPlugin => plugin.kind === "policy");
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

export async function runDefaultPipeline(args: RunWorkflowArgs): Promise<void> {
  const { runId, runDir, projectPath, goal, config, logger, codexMock, registry } = args;
  const artifactWriter = new ArtifactWriter(runDir);
  const codex = new CodexMcpClient({ mock: codexMock });
  const plugins = registry?.list() ?? [];
  const stagePlugins = asStagePlugins(plugins);
  const policyPlugins = asPolicyPlugins(plugins);
  const stages = resolvePipelineStages(stagePlugins);

  await logger.emit(event(runId, "run_started", { goal }));

  for (const stage of stages) {
    await logger.emit(event(runId, "stage_started", { stage }, { stage }));

    const priorEvents = await logger.readAll();
    for (const policy of policyPlugins) {
      const result = await policy.evaluate({ runId, stage, events: priorEvents, goal });
      if (!result.pass) {
        await emitBlocked(logger, runId, stage, `Policy blocked stage ${stage}: ${result.reason ?? policy.policyName}`, [
          "Review project policies and workflow plugins.",
          "Adjust .ma-office/plugins or built-in policy settings.",
          "Re-run the workflow after policy remediation."
        ]);
        await logger.emit(event(runId, "stage_finished", { stage, blockedBy: policy.policyName }, { stage, level: "warn" }));
        await logger.emit(event(runId, "run_finished", { goal, status: "blocked" }));
        return;
      }
    }

    const agentId = `${stage.toLowerCase()}-agent`;
    await logger.emit(event(runId, "agent_spawned", { agentId, role: stage.toLowerCase(), task: `${stage} stage` }, { stage, agentId }));
    await logger.emit(event(runId, "agent_status", { status: "working", message: `${stage} started` }, { stage, agentId }));

    try {
      if (stage === "IMPLEMENT") {
        await logger.emit(event(runId, "tool_call_started", { tool: "codex-mcp", summary: "implement changes" }, { stage, agentId }));
        const result = await codex.runTask(goal);
        await logger.emit(event(runId, "tool_call_finished", { tool: "codex-mcp", summary: result.summary }, { stage, agentId }));
      }

      if (stage === "TEST") {
        await logger.emit(event(runId, "tool_call_started", { tool: "test_cmd", summary: config.test_cmd }, { stage, agentId }));
        const { stdout, stderr } = await exec(config.test_cmd, { cwd: projectPath });
        const testSummaryPath = await artifactWriter.write("test_summary.txt", `${stdout}\n${stderr}`.trim());
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
        await logger.emit(event(runId, "tool_call_finished", { tool: "test_cmd", summary: "tests completed" }, { stage, agentId }));
      }

      if (stage === "GITHUB") {
        await logger.emit(event(runId, "tool_call_started", { tool: "git", summary: "generate blog diff patch" }, { stage, agentId }));
        const base = `origin/${config.base_branch}`;
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
      }

      if (stage === "BLOG_FACTS") {
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
      }

      for (const plugin of stagePlugins.filter((plugin) => plugin.stageName === stage)) {
        await plugin.run({
          runId,
          stageName: stage,
          goal,
          projectPath,
          config: config as unknown as Record<string, unknown>,
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
      await logger.emit(event(runId, "stage_finished", { stage }, { stage }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (stage === "GITHUB") {
        await emitBlocked(logger, runId, stage, "GitHub stage blocked.", [
          `Ensure branch ${config.base_branch} exists on origin.`,
          "Run: git fetch origin",
          `Run: git diff origin/${config.base_branch}...HEAD > runs/${runId}/artifacts/blog_diff.patch`
        ]);
      } else {
        await logger.emit(event(runId, "agent_status", { status: "error", message }, { stage, agentId, level: "error" }));
      }
      await logger.emit(event(runId, "stage_finished", { stage, error: message }, { stage, level: "error" }));
      break;
    }
  }

  await logger.emit(event(runId, "run_finished", { goal }));
}
