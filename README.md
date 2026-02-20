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

See `QUICKSTART.md` for a full setup.
