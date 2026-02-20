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
- To enable a sample tool plugin, copy:
  `cp .ma-office/plugins/sample-tool.example.mjs .ma-office/plugins/sample-tool.mjs`
- To load npm plugins, add package names in `project.yaml`:
  `plugins: { npm: ["@your-scope/ma-office-plugin"] }`
- To enable a sample widget plugin, copy:
  `cp .ma-office/plugins/sample-widget.example.mjs .ma-office/plugins/sample-widget.mjs`
- Policy guardrails can be set in `project.yaml`:
  `policies: { forbidden_stages: ["REVIEW"], require_test_stage_before_github: true }`
- Retry per stage can be set with:
  `policies: { max_retries_per_stage: 1 }`
