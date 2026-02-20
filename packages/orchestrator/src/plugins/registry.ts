import type { OfficePlugin } from "@ma-office/shared";

export class PluginRegistry {
  private readonly plugins: OfficePlugin[] = [];

  add(plugin: OfficePlugin): void {
    this.plugins.push(plugin);
  }

  list(): OfficePlugin[] {
    return [...this.plugins];
  }
}
