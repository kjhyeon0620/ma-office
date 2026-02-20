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
- Runtime mode defaults to mock and can be switched with `MA_OFFICE_MODE=real`.
- Codex MCP server command is auto-detected from `codex --help`.
  In this environment it resolves to `codex mcp-server` (not `codex mcp`).
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

## Runtime env vars
- `MA_OFFICE_MODE=mock|real`
- `MA_OFFICE_MCP_COMMAND` (auto-detected; currently `codex mcp-server`)
- `MA_OFFICE_MCP_TRANSPORT=stdio`
- `MA_OFFICE_WORKDIR` (optional; defaults to project root)
- `MA_OFFICE_BASE_BRANCH` (optional)
- `OPENAI_API_KEY` (if required by your Codex auth setup)

See `.env.example` for copy/paste defaults.
If real mode is started on `/mnt/*`, runtime fails fast with `WORKDIR_UNSUPPORTED`.

## Run commands
Mock mode (default):
```bash
pnpm --filter @ma-office/orchestrator dev -- run --goal "mock run" --project . --config project.yaml
```

Real mode:
```bash
MA_OFFICE_MODE=real \
MA_OFFICE_MCP_TRANSPORT=stdio \
MA_OFFICE_MCP_COMMAND="codex mcp-server" \
MA_OFFICE_WORKDIR="$HOME/maOffice" \
pnpm --filter @ma-office/orchestrator dev -- run --goal "real run" --project "$HOME/maOffice" --config project.yaml
```

## Real-mode smoke test (manual)
1. Start dashboard:
   ```bash
   pnpm --filter @ma-office/orchestrator dev -- dashboard --project "$HOME/maOffice" --port 3000
   ```
2. Run orchestrator in real mode with a goal that requests:
   - one small file edit
   - one trivial test add/update + execution
3. Verify live updates in Office/Console views:
   - stage progress streams without refresh (SSE)
   - fallback polling still works if stream reconnects
4. Verify completion:
   - `IMPLEMENT` and `TEST` show Codex-backed tool activity
   - `runs/<runId>/artifacts/test_summary.txt` exists
   - run reaches `run_finished`

## Current real-mode scope
- Real adapter is implemented for `IMPLEMENT` and `TEST` only.
- `SPEC`, `REVIEW`, `GITHUB`, `BLOG_FACTS` continue on existing pipeline paths.
- MCP failures (timeout/transport/approval/policy) map to existing `blocked/error` statuses with manual fallback notes.
- Approval detection currently maps JSON-RPC error code `-32001` to `MCP_APPROVAL` in this environment (server-implementation dependent).
