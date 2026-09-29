# Task and Admin entry role UAT — 2026-09-30

Candidate: `4d8424ae27a387774f9153c29c2bbbdeba23f65c` (PR #128, merged main `9dc53a0`).
Target: dedicated [UAT](https://clientops-uat-20260930.vercel.app), empty-origin Neon project `polished-forest-15724329`, independent Auth and seven distinct sessions. Synthetic task `bd7f0281-3989-4641-a9d4-b3aa795fd679`. No production writes.

## Results

| Role | Task create control | Same-task status write | Admin People entry |
|---|---|---|---|
| super_admin | offered | allowed, persisted | allowed |
| admin | offered | allowed, persisted | allowed |
| manager | offered | allowed for direct-report owner | allowed |
| sales | offered | allowed, persisted | redirected to /; no People data |
| client_success | offered | allowed, persisted | redirected to /; no People data |
| accounting | absent | allowed, persisted | redirected to /; no People data |
| read_only | absent | direct POST denied; status/version unchanged | allowed |

Creation was separately exercised using sales and a text profile owner at source `6c7ecb0`. This table does not claim create execution for every role.

## Effective permissions

- Sales scoped task deny: mutation controls absent; same-origin POST Forbidden; no DB change.
- Read-only scoped task allow: controls offered, write persisted.
- Expired read-only scoped allow: controls absent; POST Forbidden; no DB change.
- Manager/unowned task: direct POST outside management scope; no DB change.
- Temporary overrides revoked and synthetic task owner restored. Role baselines unchanged.

[Raw sanitized observations](evidence/task-capabilities-2026-09-30.json). Seven screenshots: `evidence/task-<role>-2026-09-30.png`.
Private session files remain ignored at `.clientops-perf/uat/sessions/<role>.json`.

## UI review

| Severity | Location | Before | After | Why |
|---|---|---|---|---|
| HIGH | src/routes/tasks.tsx | read_only offered drag, keyboard and creation | effective create and per-task update checks | Controls reflect the server's actual permissions |
| HIGH | src/routes/tasks.tsx | 768px document widened to 1036px | tablet card layout under verification in next slice | Keep status and actions inside viewport |

Task authorization slice: **Approve**. Tablet layout: **Block pending browser recheck**.
Not verified: screen reader, touch hardware, animation playback at 10%, full empty/loading/error visual states.

## Limits

This is partial U02/U06/U10/U15 evidence. It does not certify full sales/quote/accounting workflows, 250-user actions, 100-item bulk recovery, 5,000-row import, 10k/100k runtime, provider delivery, legacy reconciliation or production release. Those cases retain their separate gates. Test harness corrections (browser same-origin replay, management-scope error and expected Admin redirect) are not product fixes.
