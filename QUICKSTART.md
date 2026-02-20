# QUICKSTART

## 3-minute setup
1. Install Node.js 20+ and pnpm.
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Initialize presets in a target project:
   ```bash
   pnpm --filter @ma-office/orchestrator dev -- init --project .
   ```
4. Run a workflow:
   ```bash
   pnpm --filter @ma-office/orchestrator dev -- run --goal "PR1 bootstrap" --project . --config project.yaml
   ```
5. Start dashboard:
   ```bash
   pnpm --filter @ma-office/orchestrator dev -- dashboard --project . --port 3000
   ```

## Notes
- PR1 uses file-based JSONL events in `runs/<runId>/events.jsonl`.
- MCP/Codex integration is mockable via `--codex-mock`.
