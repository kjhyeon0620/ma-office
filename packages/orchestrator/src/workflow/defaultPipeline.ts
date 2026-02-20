import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { relative } from "node:path";
import type { RunEvent } from "@ma-office/shared";
import { ArtifactWriter } from "../artifacts/writer.js";
import type { JsonlEventLogger } from "../events/jsonlLogger.js";
import { CodexMcpClient } from "../integrations/codexMcp.js";
import type { ProjectConfig } from "../types.js";

const exec = promisify(execCb);

const STAGES = ["SPEC", "IMPLEMENT", "TEST", "REVIEW", "GITHUB", "BLOG_FACTS"] as const;

type RunWorkflowArgs = {
  runId: string;
  runDir: string;
  projectPath: string;
  goal: string;
  config: ProjectConfig;
  logger: JsonlEventLogger;
  codexMock: boolean;
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

export async function runDefaultPipeline(args: RunWorkflowArgs): Promise<void> {
  const { runId, runDir, projectPath, goal, config, logger, codexMock } = args;
  const artifactWriter = new ArtifactWriter(runDir);
  const codex = new CodexMcpClient({ mock: codexMock });

  await logger.emit(event(runId, "run_started", { goal }));

  for (const stage of STAGES) {
    await logger.emit(event(runId, "stage_started", { stage }, { stage }));
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
        await logger.emit(event(runId, "artifact_created", {
          artifactType: "test_summary",
          path: relative(projectPath, testSummaryPath),
          summary: "Test output"
        }, { stage, agentId }));
        await logger.emit(event(runId, "tool_call_finished", { tool: "test_cmd", summary: "tests completed" }, { stage, agentId }));
      }

      if (stage === "GITHUB") {
        await logger.emit(event(runId, "tool_call_started", { tool: "git", summary: "generate blog diff patch" }, { stage, agentId }));
        const base = `origin/${config.base_branch}`;
        const diffCmd = `git diff ${base}...HEAD`;
        const { stdout } = await exec(diffCmd, { cwd: projectPath });
        const patchPath = await artifactWriter.write("blog_diff.patch", stdout);
        await logger.emit(event(runId, "artifact_created", {
          artifactType: "diff_patch",
          path: relative(projectPath, patchPath),
          summary: `Generated with ${diffCmd}`
        }, { stage, agentId }));
        await logger.emit(event(runId, "tool_call_finished", { tool: "git", summary: "blog diff generated" }, { stage, agentId }));
      }

      if (stage === "BLOG_FACTS") {
        const summary = {
          Context: "Reusable multi-agent office monorepo",
          Problem: "Need project-agnostic workflow + observability + plugin extensibility",
          Solution: "Implemented CLI/orchestrator/dashboard skeleton with strict stage gates and JSONL events",
          "Key Code": [
            "packages/shared/src/events.ts",
            "packages/orchestrator/src/workflow/defaultPipeline.ts",
            "packages/dashboard/lib/runs.ts"
          ],
          Lesson: "Keep integration seams stable and stub non-critical edges in PR1"
        };
        const blogFactsPath = await artifactWriter.write("blog_facts.json", JSON.stringify(summary, null, 2));
        await logger.emit(event(runId, "artifact_created", {
          artifactType: "blog_facts",
          path: relative(projectPath, blogFactsPath),
          summary: "Blog facts exported"
        }, { stage, agentId }));
      }

      await logger.emit(event(runId, "cost_update", {
        model: codexMock ? "mock" : "gpt-5",
        tokensIn: 0,
        tokensOut: 0,
        estimatedCost: 0
      }, { stage, agentId }));

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
