# Production reconciliation disposition — 2026-09-28

The user authorized direct production read-only investigation. Existing T07–T09 SQL was adapted to return aggregate counts, under READ ONLY transactions, 5-second statement and 1-second lock timeouts. The database confirmed read-only mode at 2026-09-28T07:43:30.437Z. Target: Fimmick Client Ops / production / neondb, as identified in [the prior inspection](preview-database-triage.md).

The [machine-readable report](evidence/production-reconciliation-2026-09-28.json) records counts only. The [SQL](production-reconciliation-readonly.sql) is a bounded repeatable inventory, not a repair. No customer content, credentials or row IDs are exported.

## Current findings and disposition

| Finding | Evidence | Disposition / evidence needed |
|---|---|---|
| CO-06: one terminal approval lacks decided_at | Prior authorized aggregate found one; no activity log for the affected approval | Preserve terminal status. Obtain authoritative decision history before adding any time; do not use created_at or inspection time. |
| CO-07: one Job Sheet lacks accepted_at | Prior inspection found its Quote has an accepted_at and both point to the same accepted version; no matching activity log | The linked timestamp is a reconciliation candidate only. Establish its historical provenance and operator-reviewed correction scope before any backfill. |
| CO-07: one open quote_send approval lacks quote_id | It is explicitly marked demo; its agent run is not a Quote subject and supplies no existing Quote link | No unique target can be established from these sources. Obtain original request/context or an approved disposition preserving history; do not assign a guessed Quote or delete the approval. |
| CO-05/07: one issued/accepted Quote lacks issued_version_id | The affected Quote has zero retained issued versions and one retained accepted version | Obtain the original issued document/version and provenance. Do not create an issued snapshot from the current row or relabel the accepted snapshot. |

These are current-state anomalies, not proof that a particular preview caused them. No deterministic, historically verified data repair can be selected from the available evidence. No UPDATE, migration, seed or data repair was executed.

## Checks with no observed findings

- Duplicate open Quote approval groups: 0.
- Duplicate Job Sheet groups per Quote: 0.
- Non-null invalid issued version references/reasons: 0 (the missing issued pointer above is counted separately).
- Accepted Quotes: 1; missing accepted pointer, invalid accepted version/reason, missing accepted_at and malformed snapshot currency/amount: all 0.
- Xero portions inspected: 2; entered missing identity/date/confirmation metadata, planned with invoice evidence, and planned notes-only classifications: all 0.

These aggregate results do not cover commercial snapshot drift, every authorization path, external Xero reconciliation, or historical before/after parity. They cannot mark any CO finding fully verified without its remaining acceptance gates.

## Next executable boundary

The inventory and disposition are complete. Production mutation remains outside this read-only inspection. Historical documents, decision evidence and a reviewed repair scope are needed for the four anomalies. T20 still requires complete isolated legacy/Neon snapshots; seven-role sessions, provider sandbox, full-route runtime evidence and operator release prerequisites remain unavailable. Production build hold and NO-GO remain in force.

