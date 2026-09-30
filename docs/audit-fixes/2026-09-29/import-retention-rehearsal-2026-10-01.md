# R05 isolated payload retention rehearsal — 2026-10-01 HKT

Actual source `7ad12b9852702011dd99eb2f849a1269e014fea3`; verified empty-origin Neon project/branch/database, direct and pooled endpoints agree, actual current_database=clientops_uat. [Raw safe result](evidence/r05-isolated-retention-7ad12b9-2026-10-01.json). No production target, schedule or maintenance owner is invented.

Read-only preflight found zero previously eligible operations. One explicitly synthetic completed receipt, aged eight days, has one successful row and exact source-scoped Client identity mapping. Dry-run SELECT found **only that one** fixture within the existing100-session bound; it did not change payload.

The **actual repository CLI** `bun scripts/clientops/cleanup-import-sessions.ts --execute` then returned expiredSessions1 on the explicitly bound disposable DB. Raw row payload becomes{}, session becomes expired; minimal status/actor/original key/position/source-line/result-ID/time and identity map remain unchanged. The business Client record is byte-for-byte unchanged. Repeating the actual CLI returns0. Original ongoing Client/Event5000 retain_until values remain unchanged and neither becomes expired. No active operation was reset, replaced or scrubbed.

A read-only aggregate import-key inventory was also executed while original imports were active. Its counts are a single runtime snapshot, not terminal reconciliation or production identity inventory. Final row/resource/key parity must be captured after both original receipts reach terminal state. The initial fixture used an unsupported tier and failed before session creation; corrected fixture omits optional tier, without a schema/product change.

Target-specific isolated dry-run/execution/replay is PASS. **Production cleanup owner/schedule/approved target and legacy source-key inventory/backfill remain blocked_external**, separately from this proof. Release remains NO-GO.
