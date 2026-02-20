import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export class ArtifactWriter {
  constructor(private readonly runDir: string) {}

  async write(name: string, content: string): Promise<string> {
    const path = join(this.runDir, "artifacts", name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf8");
    return path;
  }
}
