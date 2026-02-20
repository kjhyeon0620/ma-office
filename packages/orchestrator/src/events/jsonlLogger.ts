import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseRunEvent, type RunEvent } from "@ma-office/shared";

export class JsonlEventLogger {
  constructor(private readonly filePath: string) {}

  async init(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
  }

  async emit(event: RunEvent): Promise<void> {
    parseRunEvent(event);
    await appendFile(this.filePath, `${JSON.stringify(event)}\n`, "utf8");
  }

  async readAll(): Promise<RunEvent[]> {
    const content = await readFile(this.filePath, "utf8").catch(() => "");
    return content
      .split("\n")
      .filter(Boolean)
      .map((line) => parseRunEvent(JSON.parse(line)));
  }
}
