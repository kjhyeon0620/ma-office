# ARCHITECTURE

## Components
- `@ma-office/shared`: event schema v1 and plugin API v1 types.
- `@ma-office/orchestrator`: CLI, strict gated workflow runner, plugin loader, JSONL logger.
- `@ma-office/dashboard`: reads JSONL runs and renders list/detail views.

## Plugin model
- `apiVersion: v1` is required.
- Plugin kinds: `role`, `stage`, `tool`, `policy`, `widget`.
- Loading order: built-in defaults, `.ma-office/plugins/*`, npm references (resolved from target project dependencies).
- Role plugins can replace default stage behavior with `replaceDefault: true` when `roleName` matches the stage (case-insensitive).

## Event schema v1
- `run_started`, `run_finished`
- `agent_spawned`, `agent_status`, `agent_note`
- `stage_started`, `stage_finished`
- `tool_call_started`, `tool_call_finished`
- `artifact_created`
- `cost_update`

Stored as append-only JSONL for easy migration to SQLite/Postgres later.
Policy evaluations are exported as `artifacts/policy_report.json`.
