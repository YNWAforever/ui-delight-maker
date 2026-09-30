# R02 Task/Approval precise cursor and 100-item recovery UAT

## Actual before behavior

Independent hosted source `fac59c90eb47be77c4f75554b3cee6e624b26622` (source equal to merged #134). Genuine sales session, independently confirmed UAT project/database/auth, synthetic Tasks only.

Two 100-row U08 attempts stopped before preview or bulk writes. The first checked too early after Load more; the second explicitly waited 30 seconds and still saw 50 rows. A separate real browser diagnostic waited five seconds after a successful cursor GET: 50 rows remained and Load more disappeared, although the page said 100 total. No JavaScript error. [Actual pagination observation](evidence/task-cursor-before-fac59c9-2026-09-30.json), [screenshot](evidence/task-cursor-before-fac59c9-2026-09-30.png).

These incomplete attempts do not count as bulk acceptance. No 70/10/10/10 outcome, receipt recovery or idempotent UI PASS is inferred.

## Cause and correction

Both queue repositories generated cursor timestamps with `new Date(created_at).toISOString()`. PostgreSQL retains microseconds; JavaScript Date retains milliseconds. A batch of equal timestamps at `...123456Z` got a cursor at `...123Z`. The next tuple predicate excluded all rows at the original later timestamp, including 50 unread rows.

Real isolated PostgreSQL regression first returned only **50 of 101**. The correction selects an exact UTC, six-digit PostgreSQL timestamp for cursor encoding, strips that private field from public rows and keeps the existing timestamp/id descending order, scope, filters, limits, counts and cursor signature/validation. Task and Approval each now read **50 + 50 + 1**, 101 distinct IDs, and no private cursor field in rows. Sixteen queue/roster integration tests pass. No new query, migration, role grant or dependency. Full source suite, fixed commit UAT and 100 mixed bulk/resume acceptance follow.

## Remaining U08 gate

After fixed source deployment, select 100 initially eligible synthetic Tasks. After actual preview, introduce 10 explicit denies, 10 concurrent stale versions and 10 missing records; 70 remain eligible. Forward the real first commit, abort only its browser response, deny receipt reads while offline, reload and recover with the same stored key. Resume actual chunks, verify 70 once-only writes and 30 terminal failures, unauthorized other-actor receipt read denial, unchanged replay and retained failure selection. Actual requests/results required; no mocked server result.

Production remains held. The latest #134 main deployment attempt was CANCELED and public source stayed `bed941b`. Full backlog/release gates remain open.
