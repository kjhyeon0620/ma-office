import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { PLUGIN_API_VERSION, type OfficePlugin } from "@ma-office/shared";
import { PluginRegistry } from "./registry.js";

export type LoadPluginOptions = {
  projectPath: string;
  npmPlugins?: string[];
};

const builtInPlugins: OfficePlugin[] = [
  {
    name: "default-stage-order-policy",
    apiVersion: "v1",
    kind: "policy",
    policyName: "default-stage-order",
    evaluate: async () => ({ pass: true })
  }
];

function normalize(mod: unknown): OfficePlugin[] {
  const loaded = mod as { default?: unknown };
  const candidate = loaded.default ?? mod;
  return Array.isArray(candidate) ? (candidate as OfficePlugin[]) : [candidate as OfficePlugin];
}

function validate(plugin: OfficePlugin): void {
  if (!plugin || plugin.apiVersion !== PLUGIN_API_VERSION) {
    throw new Error(`Incompatible plugin: ${(plugin as { name?: string })?.name ?? "unknown"}`);
  }
}

function isPathLike(specifier: string): boolean {
  return specifier.startsWith(".") || specifier.startsWith("/") || specifier.endsWith(".js") || specifier.endsWith(".mjs");
}

async function importPluginModule(projectPath: string, specifier: string): Promise<unknown> {
  if (isPathLike(specifier)) {
    return import(pathToFileURL(resolve(projectPath, specifier)).href);
  }

  const requireFromProject = createRequire(join(projectPath, "package.json"));
  const resolved = requireFromProject.resolve(specifier);
  return import(pathToFileURL(resolved).href);
}

export async function loadPlugins(opts: LoadPluginOptions): Promise<PluginRegistry> {
  const registry = new PluginRegistry();
  for (const plugin of builtInPlugins) {
    registry.add(plugin);
  }

  const localDir = resolve(opts.projectPath, ".ma-office", "plugins");
  const files = await readdir(localDir).catch(() => []);

  for (const file of files.filter((item) => item.endsWith(".js") || item.endsWith(".mjs"))) {
    const mod = await import(pathToFileURL(join(localDir, file)).href);
    for (const plugin of normalize(mod)) {
      validate(plugin);
      registry.add(plugin);
    }
  }

  if (opts.npmPlugins?.length) {
    for (const specifier of opts.npmPlugins) {
      try {
        const mod = await importPluginModule(opts.projectPath, specifier);
        for (const plugin of normalize(mod)) {
          validate(plugin);
          registry.add(plugin);
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(
          `[ma-office] failed to load npm plugin '${specifier}'. Ensure it is installed in the target project. Reason: ${reason}`
        );
      }
    }
  }

  return registry;
}
