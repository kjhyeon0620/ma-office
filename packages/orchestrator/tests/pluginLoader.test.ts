import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { loadPlugins } from "../src/plugins/loader.js";

describe("plugin loader", () => {
  it("loads local plugin from .ma-office/plugins", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "ma-office-plugin-"));
    const pluginsDir = join(projectDir, ".ma-office", "plugins");
    await mkdir(pluginsDir, { recursive: true });

    await writeFile(
      join(pluginsDir, "sample.mjs"),
      `export default {
        name: "sample-stage",
        apiVersion: "v1",
        kind: "stage",
        stageName: "SAMPLE",
        run: async () => {}
      };`,
      "utf8"
    );

    const registry = await loadPlugins({ projectPath: projectDir });
    expect(registry.list()).toHaveLength(2);
    expect(registry.list()[1]?.name).toBe("sample-stage");
  });
});
