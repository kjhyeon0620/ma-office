import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { DEFAULT_PROJECT_CONFIG } from "./types.js";

export async function installPresets(targetProject: string): Promise<void> {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const root = resolve(currentDir, "../../../");
  const presetsDir = join(root, "presets");
  const targetPresetDir = join(targetProject, ".ma-office");
  await mkdir(targetPresetDir, { recursive: true });
  await cp(presetsDir, targetPresetDir, { recursive: true });

  const projectConfigPath = join(targetProject, "project.yaml");
  if (!existsSync(projectConfigPath)) {
    await writeFile(projectConfigPath, YAML.stringify(DEFAULT_PROJECT_CONFIG), "utf8");
  } else {
    const existing = await readFile(projectConfigPath, "utf8");
    const parsed = YAML.parse(existing) ?? {};
    await writeFile(projectConfigPath, YAML.stringify({ ...DEFAULT_PROJECT_CONFIG, ...parsed }), "utf8");
  }
}
