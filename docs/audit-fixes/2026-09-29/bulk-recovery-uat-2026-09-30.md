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

## CI fixture diagnosis and actual preview latency

Head `df145756f86337b1b175344fbeca124b0d89efbf` loads/selects all 100 Tasks in the genuine sales UI. Actual preview POST took **68,022 ms** before the dialog appeared (20,297 response bytes, no server error); the 30-second U08 harness stopped before fault injection or commit. This is not bulk recovery acceptance. Private response tokens are excluded from published evidence.

CI contract run `36687195207` failed first on `relation leads does not exist`, followed by ten aborted-transaction failures. A fresh empty local PostgreSQL database independently reproduced 5 passes / 11 failures. The queue fixture now creates all referenced linked-subject relations as temporary tables and restricts search_path to pg_temp/pg_catalog. The identical empty target passes all 16 tests. A previously populated full-suite target had concealed this dependency; that earlier green result is retained but is insufficient for this fixture boundary.

## Bounded preview candidate

Preview checks run with at most four concurrent read-only handlers, then assemble results in input order. Mixed eligible approval types still reject the whole preview. Only permitted rows retain their summaries. The operation and all receipt items are written atomically with a parameterized JSONB recordset insert. Commit authorization, version locks, business write/savepoint rollback, owner checks, idempotency key, expiry, chunk limit and leases remain unchanged.

New real PostgreSQL coverage verifies all 100 mixed preview positions/statuses/privacy, four-reader bound, no business write and a database trigger rejecting item 99 with zero orphan operation/items. Red concurrency regression observed one reader before the fix; a first trigger fixture contained malformed dollar quoting and was corrected before successful verification. Full fresh suite: **2,282 passed, zero skipped/todo**, 312 files. Types, tracked-source lint, pure Vite and bundles pass. Hosted runtime and recovery remain pending. [Actual baseline](evidence/bulk-preview-before-df14575-2026-09-30.json), [screenshot](evidence/bulk-preview-before-df14575-2026-09-30.png).

## U08 Task 100: actual scoped PASS

Source `53dc62f8a19e4a2449c9e445651bbeb43bd3158b`, dedicated deployment `dpl_32SR9Ea7Z75GAVyB3nuus7m1nVJC`; the stable test alias returned this SHA before and after. Own sales and own read_only sessions were used. No super_admin session substituted for either actor.

[Complete sanitized actual run](evidence/bulk-task-pass-53dc62f-2026-09-30.json), [saved receipt during transport outage](evidence/bulk-task-offline-53dc62f-2026-09-30.png), [completed UI](evidence/bulk-task-completed-53dc62f-2026-09-30.png).

1. Real UI loaded and selected all 100 synthetic Tasks; actual preview showed 100 eligible, took 14,941ms and changed no Task.
2. After preview, introduced ten explicit update denies, ten concurrent version changes and ten deleted records. All other Tasks stayed open/version zero.
3. Forwarded the first real commit, then aborted only its browser response. Receipt-read requests were deliberately aborted during reload; the UI retained the same operation/key and offered Retry loading result. This is a targeted real transport fault, not a claim that the whole app works without network access.
4. Restored receipt reads. The owner recovered the actual receipt and repeated the original commit key before continuing actual bounded chunks. Final receipts: **70 succeeded / 10 forbidden / 10 stale / 10 not_found**, 100 terminal items.
5. All 70 successful records are done/version one; forbidden records remain open/version zero; stale records keep their concurrent version; missing records were not recreated. Terminal replay leaves the complete persisted snapshot unchanged.
6. Own read_only session sent the same receipt GET: serialized owner-access denial and no fixture IDs in the response. HTTP 200 wrapping a server error is counted as denial, not success.
7. Actual UI says 100 processed, 70 succeeded, 30 need review and **30 selected**. Screenshots visually inspected. Temporary denies revoked after assertions.

The first full run reached 100/70 in PostgreSQL but the script raced a disabled Resume; [incomplete record](evidence/bulk-task-incomplete-sync-53dc62f-2026-09-30.json). The second recovered the receipt and replayed a real commit, but the observer only matched operationId rather than previewToken; [incomplete record](evidence/bulk-task-incomplete-observer-53dc62f-2026-09-30.json). Both remain success=false. The final observer waits for the actual commit/replay or resume response body and settled UI; application source and every server guard were unchanged between these three attempts.

Network samples in the accepted run show real POST durations roughly 4.7–11.5 seconds after preview; the five-second item boundary excludes authorization and receipt/transaction overhead. No five-second end-to-end latency claim. The test issued twelve commit/replay/resume POSTs including the lost-response request.

## Runbook, compatibility and retained blockers

- Source commits: `df14575` precise PostgreSQL cursors, `065ccb1` standalone empty-schema fixture, `53dc62f` bounded preview/atomic receipt insert.
- Fresh local and source CI each run the full **2,282 tests / zero skipped** suite backed by real disposable PostgreSQL. CI Checks `36690824046`, DB `36690823813`, migration/seed replay and browser collector passed. Final documentation-head CI is required before merging #135.
- No migration or reconciliation required by this slice. Existing operation/item schema, payload hash, token, expiry, actor ownership, key and receipt statuses stay compatible. Do not delete receipts or reset business versions for rollback.
- UAT app rollback is the preceding dedicated deployment `dpl_BfrAUnkawVzUSVfXFFcGZZy3tsvn` (source `df14575`); it has the correct cursor but restores the measured slow preview. An earlier app restores the pagination defect too.
- To investigate an interrupted operation, first confirm independent app/DB/auth binding and its owner; recover/read its receipt before replaying its stored key. Resume only terminally unprocessed/retryable items. Preserve terminal failures for review; do not start a new operation as proof of replay safety.
- U08 passes for this Task 100 scenario. Team-member/other-domain bulk acceptance, 5,000-row import/export, full responsive/keyboard/screen-reader, legacy snapshot parity, provider delivery, historical anomaly decisions and operator/PITR/release rehearsal remain open. All 30 CO and 16 UAT cases are retained. Production remains held and not deployed.
