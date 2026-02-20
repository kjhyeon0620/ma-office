# Realtime Update Verification (SSE + Polling Fallback)

## Preconditions
- Node 20+
- Install deps at repo root: `pnpm install`

## Run Commands
1. Start dashboard:
`pnpm --filter @ma-office/dashboard dev`

2. In another terminal, generate a run/event stream:
`pnpm --filter @ma-office/orchestrator dev run --goal "realtime check"`

## Scenario A: SSE live update
1. Open `http://localhost:3000/runs`.
2. Confirm `Live On` is enabled and state becomes `sse`.
3. While orchestrator writes events, run list cost/status/artifact count updates without refresh.
4. Open run detail page (`/runs/<runId>`).
5. Confirm `Live On` state is `sse`.
6. Validate these update immediately on new events:
- Office Canvas agent tiles (status/task/last update/progress)
- Crew Deck cards
- Agent Room panel (recent events/artifacts)
- Console & Timeline panel

## Scenario B: Auto reconnect with backoff
1. Keep run detail page open with `Live On`.
2. Restart dashboard server (`Ctrl+C` then `pnpm --filter @ma-office/dashboard dev`).
3. Confirm UI state changes to `reconnecting`, then returns to `sse` automatically.

## Scenario C: Polling fallback
1. In browser devtools console, disable EventSource before loading page:
`window.EventSource = undefined`
2. Reload `/runs` or `/runs/<runId>`.
3. Confirm live state shows `polling`.
4. Confirm new events still appear within polling interval.

## Scenario D: Live mode off
1. Toggle to `Live Off`.
2. Confirm live state becomes `idle` and new events no longer auto-appear.
3. Toggle back to `Live On` and verify updates resume.

## Scenario E: Filters + raw toggle
1. On run detail, use filters by agent/stage/type and verify log list changes.
2. Confirm default message mode is human-readable.
3. Toggle `Raw` and confirm payload JSON appears.

## Scenario F: Mode indicator
1. Verify summary card includes `Run Mode`.
2. For current mock pipeline, expected value is `mock` (or `unknown` if no cost event yet).
