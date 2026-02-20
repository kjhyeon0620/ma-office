# SECURITY

## Safe defaults
- Local file-based execution and logs only.
- Strict stage ordering to reduce accidental side effects.
- Blocked state handling emits manual commands instead of forcing privileged operations.

## Permissions model
- Plugins loaded from local `.ma-office/plugins/*` are executable code. Review before use.
- npm plugin loading is interface-only in PR1 (no remote execution path by default).

## Operational guidance
- Run in sandboxed environments for untrusted repositories.
- Keep `project.yaml` commands explicit and audited.
