import { describe, expect, it } from "vitest";
import type { StagePlugin } from "@ma-office/shared";
import { resolvePipelineStages } from "../src/workflow/defaultPipeline.js";

describe("resolvePipelineStages", () => {
  it("inserts stage with before/after ordering", () => {
    const plugins: StagePlugin[] = [
      {
        name: "security-gate",
        apiVersion: "v1",
        kind: "stage",
        stageName: "SECURITY",
        order: { before: "REVIEW" },
        run: async () => {}
      },
      {
        name: "docs-gate",
        apiVersion: "v1",
        kind: "stage",
        stageName: "DOCS",
        order: { after: "BLOG_FACTS" },
        run: async () => {}
      }
    ];

    const stages = resolvePipelineStages(plugins);

    expect(stages).toEqual(["SPEC", "IMPLEMENT", "TEST", "SECURITY", "REVIEW", "GITHUB", "BLOG_FACTS", "DOCS"]);
  });
});
