# U06 actual cross-entry denial — 2026-10-01 HKT

## Exact source and actor

Source `8691421`, detached dedicated UAT, actual own accounting identity matching its independent Auth ID. Synthetic new Task/Approval/restricted Lead and the completed U04 B Job Sheet. Existing role baselines and mutation policy remain unchanged; no production DB connection, provider send or source change. [Five cases plus raw-home recapture](evidence/cross-entry-accounting-8691421-2026-10-01.json).

## Executed boundaries

- Baseline Task is visible in the actual task list and global search; its captured server GET contains the allowed detail. Accounting's global search cannot match the restricted Lead-only title/email.
- Matching `tasks.view` deny removes the actual Task title and confidential detail from list, global search and replayed direct GETs. No standalone Task detail route exists; the list response supplies that detail.
- Matching `approvals.view` deny removes the pending approval from its actual queue. Replaying the captured selected-detail GET returns an error without its confidential payload.
- Matching `job_sheets.view` deny removes B from Today, list, row selection and downloaded selection export; replayed real detail GET denies without ID/number. Original A remains selectable and actually exports, proving permitted content stays available.
- Actual Task/report CSV and review-workload/report CSV totals each drop by **exactly1**. The denied fixture is not merely hidden in the rendered table.
- The authenticated **baseline homepage SSR contains all three fixture IDs**. After the three denies, actual authenticated SSR contains none. Accounting's rendered Today currently lists applicable Job Sheets and queue links; no fictional home Task/Approval row is claimed.

Each active deny is also paired with a matching already-expired allow; it cannot restore access. This tests that combination, not every expiry/grant path. Full state/version/snapshot readback is unchanged. Six initial and three home-recapture overrides were revoked. The first private setup attempt referenced a nonexistent Task created_by column; the corrected fixture uses the real schema, with no product/schema change.

[Allowed Task](evidence/cross-before-task-8691421-2026-10-01.png), [denied search](evidence/cross-denied-task-search-8691421-2026-10-01.png), [denied approval](evidence/cross-denied-approval-8691421-2026-10-01.png), [denied home](evidence/cross-denied-home-all-resources-8691421-2026-10-01.png), [permitted selection/export](evidence/cross-denied-sheet-list-export-8691421-2026-10-01.png), [report](evidence/cross-denied-review-report-8691421-2026-10-01.png). Exact downloaded BOM CSVs are archived with hashes. Credentials, request URLs/templates and raw network payloads remain private.

U06 PASS for the defined accounting Task/Approval/Job Sheet cross-entry scenario. This combines actual hosted positive/negative observations with the unchanged full real-PG scope/count/search/detail tests; it does not certify every product action/role or external provider. Historical parity, other workflows and release remain open.
