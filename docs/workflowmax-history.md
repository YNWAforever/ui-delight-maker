# WorkflowMax V2 history scaffold

This draft provides lossless history staging, stable source identities, an HTTP/OAuth
client, an ordered importer, and a reconciliation baseline. The boundary for this PR
review is draft only: no merge, ready-for-review state change, live WFM API requests,
OAuth token use, or UAT/production database apply. Prior approvals recorded in the
local `WFM_HARD_STOP.md` do not expand this review's scope.

All proof for this PR uses synthetic fixtures and disposable local PostgreSQL. Do not
merge or run migrations against UAT/production as part of this scaffold review.

## Storage and identity

Migration `027_wfm_history_scaffold.sql` extends the existing identity type check and
adds `wfm_raw_objects`, `wfm_staff_map`, `wfm_invoices`, `wfm_invoice_line_items`,
`wfm_invoice_payments`, `wfm_timesheets`, `wfm_timesheet_lines`, `wfm_import_runs`, and
`wfm_import_receipts`. It is registered in the migration list and schema readiness
contract. New tables match migration 022: RLS enabled, PUBLIC privileges revoked, no
browser policies. Use the migration owner/operator role for this CLI; it has no BFF
or browser entry point.

Every external key is the original WFM UUID under `workflowmax:<orgId>`. Invoice and
job numbers, names, and email addresses are never identity keys. A transactional
`INSERT … ON CONFLICT … RETURNING resource_id` reserves or reuses one UUID. That ID
identifies the raw staging object and its projection when one exists. An identity,
payload, projection, included children, and success receipts commit together. Failed
rows roll back and get a separate durable receipt with a sanitized error code.

Each rerun has its own run ID and receipts; existing resource IDs remain stable. A
database session advisory lock serializes imports for one namespace. Interrupted
runs can remain `running`; a fresh run replays all rows idempotently. This scaffold
does not automatically advance an incremental checkpoint or delete old rows.

Shared contact UUIDs across clients are legitimate. Snapshots count each contact
once and retain its distinct client UUIDs in optional `contactClientLinks` evidence;
older version-1 snapshots remain readable. Repeats within one client's contacts are
also de-duped: they add no new identity or link and are not source issues. Other
resource types still reject duplicate UUIDs. Apply keeps one `account_contacts` row
owned by the first imported client and adds every client (including the owner) to
`account_contact_links`. Secondary sightings reuse the identity without overwriting
the canonical contact or its raw payload; owner sightings can refresh its details.
Each run retains one receipt per contact UUID, preserving `created` if that run
created it. Associations are additive, like the existing history projections.

**Migration `028_wfm_shared_contact_links.sql` requires approval and application
before a future apply. It has not been run as part of this change.** It registers
the idempotent link table with foreign keys, RLS and no browser grants; migration
003's single owner column and migration 022's owner constraints remain unchanged.

| Source                                  | Destination / scaffold boundary                                                                     |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Settings                                | Raw tax settings; registry can be extended with other catalogues                                    |
| Staff                                   | `wfm_staff_map`; profile mapping is nullable and operator maintained                                |
| Clients / included active contacts      | Raw client; canonical `accounts` / `account_contacts` projections                                   |
| Leads / quotes                          | Raw history; commercial domain promotion remains a stub                                             |
| Jobs                                    | `projects` first, using account identity; never a synthetic job sheet                               |
| Tasks / costs / notes / purchase orders | Raw history; costs from job includes; task domain promotion remains a stub                          |
| Timesheets                              | One `wfm_timesheets` row per WFM entry UUID; minutes authoritative, hours generated as minutes / 60 |
| Invoices                                | `wfm_invoices`; included job task/cost UUIDs become invoice line children                           |
| Payments                                | Standalone `/v2/payments` UUIDs become invoice payment children                                     |

Source payloads retain financial/status/date fields not yet normalized, multi-job
invoice associations, and document metadata. There is no document download pipeline.
Only directly equivalent completed/cancelled job states are mapped; other jobs use
the project's initial status while raw retains the WFM state. No quote acceptance,
accepted version, commercial lock, or Xero evidence is inferred. Domain `clients`,
`leads`, `quotes`, and `tasks` promotion needs a separately reviewed mapping.

Invoice totals use `amountIncTax` and `amountPaid`, grouped by currency. WFM's
timesheet `time` is minutes. Numeric columns have no imposed decimal scale; exact
reconciliation supports up to 18 fractional digits and rejects unsupported or unsafe
numeric inputs. Missing values remain NULL. Unknown currency and missing totals/time
prevent reconciliation from passing. Optional WIP amounts are stored when supplied;
the default request does not require the plan-dependent `wip` expansion.

Staff UUID is the requested text primary key; its organisation is also checked.
Reusing a staff UUID in a different namespace fails instead of reassigning a mapping.
Staff email never creates a profile link, and a rerun preserves `profile_id` and
operator metadata. Timesheet line storage is reserved for a future source that has
separate line UUIDs; V2 time entries already contain staff/job/date/minutes, so no
artificial header or child UUID is generated.

## Environment and commands

Install with `bun install --frozen-lockfile`. No additional dependencies are required.

| Variable                | Use                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `WFM_CLIENT_ID`         | OAuth application ID, live source only                                                               |
| `WFM_CLIENT_SECRET`     | OAuth application secret, live source only                                                           |
| `WFM_REFRESH_TOKEN`     | Initial OAuth refresh token, live source only                                                        |
| `WFM_ORG_ID`            | Expected organisation ID, pinned against the access JWT                                              |
| `WFM_JWT_ORG_CLAIM`     | Top-level JWT claim: string or string array (first non-empty string used); must equal `WFM_ORG_ID`   |
| `WFM_ALLOW_LIVE_PULL=1` | Explicit live-source opt-in, only after Willy's approval                                             |
| `WFM_DATABASE_URL`      | Explicit local/UAT PostgreSQL connection for apply or recon; no `DATABASE_URL` fallback              |
| `WFM_TARGET=local\|uat` | Explicit target label; `local` also requires a loopback host; production unsupported                 |
| `WFM_HISTORY_CURRENCY`  | Optional operator-confirmed ISO currency for payloads omitting currency; leave unset until confirmed |
| `DATABASE_TEST_URL`     | Disposable PostgreSQL with pgvector, integration tests only                                          |

The live WFM access JWT uses `org_ids`.

Credentials come from environment variables only and are never logged or stored in
history tables. HTTPS endpoints are fixed, redirects are rejected, and requests time
out after 30 seconds. JWT decoding is routing metadata, not application authentication;
tokens are obtained over HTTPS and validated by the WFM API. The OAuth module has an
async `onRefreshToken` callback for a future approved secret-manager adapter. The CLI
currently updates rotated refresh tokens **in process only** and emits a token-free
notice. Durable rotation handoff must be supplied before operational live imports;
do not rely on a rotated token surviving CLI exit. OAuth registration, initial consent,
redirect URI, and a browser callback receiver are outside this PR.

Inspect the registry without credentials or any network/database access:

```bash
bun run wfm:plan
```

Default import mode is dry run. This fixture command never opens a database or calls
WFM; it validates source IDs, counts and financial fields, prints per-row receipts,
and optionally writes source evidence. It does not simulate database FK validation.
Use a fresh snapshot path: output is created with mode 0600 and refuses overwrites.

```bash
bun run wfm:import --fixture scripts/clientops/fixtures/wfm-history.json \
  --dry-run --snapshot /tmp/wfm-source-dry.json
```

The importer fetches in this order:
settings → staff → clients/contacts → leads → quotes → jobs/tasks/costs/notes/POs →
timesheets → invoices/payments. It stops at a failed dependency. Earlier committed
rows remain reviewable; rerun the full command after correcting the issue. Query
`wfm_import_receipts` by run ID for failed external keys and safe validation/SQLSTATE
codes. JSON stdout contains keys/statuses, never source bodies or credentials.

### Isolated migration and replay proof

Use a **new disposable** PostgreSQL 17 instance with pgvector installed, listening on
loopback (CI uses `pgvector/pgvector:pg17`). Set the connection explicitly; these
commands must not use UAT or production credentials.

```bash
export DATABASE_TEST_URL=postgres://clientops:clientops@127.0.0.1:5432/clientops_test
export DATABASE_URL="$DATABASE_TEST_URL"
export CLIENTOPS_SCRIPT_LOCAL_PG=1
bun run clientops:migrate-schema
bun run clientops:verify-schema
# Run again to prove tracked migrations are skipped cleanly.
bun run clientops:migrate-schema

export WFM_DATABASE_URL="$DATABASE_TEST_URL"
export WFM_TARGET=local
bun run wfm:import --fixture scripts/clientops/fixtures/wfm-history.json \
  --apply --snapshot /tmp/wfm-source-first.json
bun run wfm:import --fixture scripts/clientops/fixtures/wfm-history.json \
  --apply --snapshot /tmp/wfm-source-second.json
bun run wfm:recon --source /tmp/wfm-source-second.json

bunx vitest run src/server/workflowmax --no-file-parallelism
bunx vitest run --no-file-parallelism --testTimeout=30000 \
  --reporter=default --reporter=json --outputFile=/tmp/wfm-vitest-results.json
bun scripts/clientops/assert-vitest-no-skips.ts /tmp/wfm-vitest-results.json
bun run typecheck
bun run typecheck:runtime
bun run lint
bunx vite build
git diff --check
```

The database tests exercise migration of an empty schema, replay of 027 on populated
history, concurrent identity reservation, import replay, atomic failure receipts,
exact monetary/hour reconciliation, UUID substitutions, mismatch thresholds, RLS,
and the quote/job-sheet boundary. Unit tests use a fake clock for concurrent request
pacing, Retry-After, retry limits, OAuth rotation/org pinning, and pagination.

### Future approved live operation

Do not run this section during scaffold review. Once P1/OAuth approval, credentials,
currency mapping and durable rotation handoff exist, the command shape is:

```bash
# --live requires the WFM_* OAuth env vars plus WFM_ALLOW_LIVE_PULL=1.
bun run wfm:import --live --dry-run --snapshot /secure-path/wfm-source-full.json
# --apply additionally requires an explicitly approved WFM_DATABASE_URL/WFM_TARGET.
bun run wfm:import --live --apply --snapshot /secure-path/wfm-applied-full.json
# An incremental overlap refresh is not a full reconciliation baseline.
bun run wfm:import --live --apply --updated-since 2026-01-01
```

One shared limiter paces API requests and retries to at most 60/minute, with a shared
429 cooldown honoring Retry-After seconds or HTTP dates and bounded retries. Run one
CLI per client/organisation; coordinate other consumers externally. Pagination handles
`meta.pagination.total_pages` and endpoint `data`/`total` envelopes. The latter probes
a trailing empty page to detect per-page totals masquerading as complete history.
Ambiguous totals, duplicate UUIDs or a changing total abort the run. Endpoint-specific
`pagesize`/`pageSize` and `updatedsince`/`updatedSince` spellings are in the registry.
Tax settings use `pagesize` and are paginated even during incremental runs, with no
date filter. Empty terminal metadata pages after earlier data abort the snapshot;
an empty collection may declare zero or one page. Explicit status filters include archived clients,
deleted staff, completed/cancelled/deleted jobs, and draft/cancelled invoices.

## Reconciliation and remaining work

`wfm:recon` reads a full-source snapshot and the namespace's DB rows in one read-only,
repeatable-read transaction. Source evidence is accumulated from fetched rows before
DB writes. It checks UUID sets and counts per top-level collection and keyed included
contacts/costs/invoice lines, derived accounts, invoice total/paid sums **per currency**, and exact summed
minutes (also displaying derived hours). Projection absence is a count mismatch.
Account projections are checked even for clients with no contacts or jobs. Source
snapshots must include the derived `account` UUID collection; regenerate older fixture
snapshots that predate that check. Unknown currency, missing numeric fields, incomplete runs, and unkeyed included rows
fail. Incremental/partial snapshots are rejected. Different UUIDs fail even when counts
match. Missing/extra key lists in the report are capped at 100 entries; counts remain
complete. Exit status is 0 for a pass and 1 for mismatch/invalid input.

Defaults are exact: zero missing/extra IDs and zero monetary/hour difference. An
operator can set explicit nonnegative thresholds:

```bash
bun run wfm:recon --source /tmp/wfm-source-second.json \
  --count-threshold 0 --amount-threshold 0.01 --hours-threshold 0
```

A count threshold applies to the larger of missing/extra UUID counts. Money thresholds
apply separately to each currency's total/paid sums. Time compares minutes exactly;
displayed hours are truncated to 18 decimal places. Missing values never pass via a
threshold. Reconciliation does not delete stale/deleted source rows or stale children;
a later complete source snapshot exposes them as extras. Capture a stable source window
and repeat a full read after incremental catch-up before claiming historical parity.
Current evidence is a latest-object history baseline, not a point-in-time revision log.

Open Willy Asks / follow-ups, none blocking this scaffold:

- Confirm recorded P1 schema approval, OAuth app/scopes/org claim, UAT target binding
  and explicit authorization for the first live pull.
- Approve durable rotated-token storage/ownership and initial consent/redirect handling.
- Confirm organisation currency and whether historical multi-currency values need a
  different source. The documented invoice payload omits currency; no HKD default is assumed.
  A blank `WFM_HISTORY_CURRENCY` is treated as unset.
- Validate pagination envelopes, status coverage, permissions and endpoint spellings with
  approved UAT receipts. The global job-cost docs disagree with their path; costs currently
  come from job includes. Client includes return active contacts only; archived contact
  coverage needs a separate endpoint contract. Expand settings/catalogues and deleted-record/tombstone sweeps.
- Review commercial client/lead/quote/task promotion, staff/profile matches, project status
  mapping, multi-job invoice links, and exceptional lines lacking stable UUIDs.
- Extend recon to per-invoice line/payment balances, optional WIP/cost totals, mapping
  coverage and deletion decisions; retain operator evidence for any explained differences.
- Add persisted incremental checkpoints, overlap windows and operational scheduling after
  a verified full baseline. Webhooks, Xero push and binary documents remain outside scope.

Contracts consulted: [authentication](https://api-docs.workflowmax.com/basic/authentication),
[rate limiting](https://api-docs.workflowmax.com/basic/rate-limiting),
[response format](https://api-docs.workflowmax.com/basic/response-format),
[tax settings](https://api-docs.workflowmax.com/settings/tax/get-v2-taxes),
[timesheets](https://api-docs.workflowmax.com/objects/timesheet/get-v2-timesheets),
[invoices](https://api-docs.workflowmax.com/objects/invoice/get-invoices), and
[payments](https://api-docs.workflowmax.com/objects/invoice/get-v2-payments).
