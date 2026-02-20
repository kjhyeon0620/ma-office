# ma-office

Reusable, project-agnostic multi-agent office for software development.

## Packages
- `packages/orchestrator`: CLI and workflow runner
- `packages/shared`: Event schema and plugin API types
- `packages/dashboard`: Next.js dashboard for runs/events

## Commands
- `pnpm --filter @ma-office/orchestrator dev -- init --project .`
- `pnpm --filter @ma-office/orchestrator dev -- run --goal "Implement feature" --project . --config project.yaml`
- `pnpm --filter @ma-office/orchestrator dev -- dashboard --project . --port 3000`

## Dashboard UI Modes
- Office View: avatar/room-oriented realtime agent status view
- Table View: compact run list table

See `QUICKSTART.md` for a full setup.
For runtime mode and Codex MCP env configuration, see `.env.example`.
