# Task 3 Report: Add Relationship Types And Pure Logic

## What I implemented

- Added the new pure relationship domain modules:
  - `src/lib/relationship/matching.ts`
  - `src/lib/relationship/timeline.ts`
  - `src/lib/relationship/signals.ts`
  - `src/lib/relationship/types.ts`
- Added focused tests for the relationship domain:
  - `src/lib/relationship/__tests__/matching.test.ts`
  - `src/lib/relationship/__tests__/timeline.test.ts`
  - `src/lib/relationship/__tests__/signals.test.ts`
- Extended `src/lib/types.ts` with the relationship-oriented CRM enums required by the brief:
  - `PreferredChannel`
  - `RelationshipRole`
  - `InfluenceLevel`
  - `StakeholderSentiment`
  - `RelationshipStrength`
  - `CampaignType`
  - `CampaignStatus`
  - `AttendeeStatus`
  - `FollowUpStatus`
  - `ConversionOutcome`
  - expanded `AccountLifecycleStage` with `partner` and `vendor`
- Updated `Account`, `Contact`, `Campaign`, and `CampaignMember` to expose the Neon relationship schema names needed by the new domain layer.
- Kept legacy campaign/campaign-member fields as optional compatibility aliases in `CampaignMember` and additive fields in the shared interfaces so Task 3 does not break pre-Phase-2 callers that still use the old shapes.

## What I tested and exact results

### Focused red run

Command:

```powershell
& 'C:\Program Files\nodejs\node.exe' .\node_modules\vitest\vitest.mjs run src/lib/relationship/__tests__/matching.test.ts src/lib/relationship/__tests__/timeline.test.ts src/lib/relationship/__tests__/signals.test.ts
```

Initial result:

- Exit code `1`
- `3` failed test files
- Failure reason: `Cannot find module '../matching'`, `Cannot find module '../timeline'`, `Cannot find module '../signals'`

### Focused green run

Command:

```powershell
& 'C:\Program Files\nodejs\node.exe' .\node_modules\vitest\vitest.mjs run src/lib/relationship/__tests__/matching.test.ts src/lib/relationship/__tests__/timeline.test.ts src/lib/relationship/__tests__/signals.test.ts
```

Result:

- Exit code `0`
- `3` test files passed
- `9` tests passed

### Full Vitest run

Command:

```powershell
& 'C:\Program Files\nodejs\node.exe' .\node_modules\vitest\vitest.mjs run
```

Result:

- Exit code `0`
- `32` test files passed
- `173` tests passed

### TypeScript verification

Command:

```powershell
& 'C:\Program Files\nodejs\node.exe' .\node_modules\typescript\bin\tsc --noEmit
```

Result:

- Exit code `1`
- No Task 3 type failures remain after fixing the timeline fixture to include `actor_id: null`
- Remaining failures are inherited baseline server-function serializability issues caused by `unknown` fields, matching the brief's known baseline category
- Remaining files in the error set:
  - `src/server-functions/accounts.ts`
  - `src/server-functions/automation-playbooks.ts`
  - `src/server-functions/campaigns.ts`
  - `src/server-functions/contacts.ts`
  - `src/server-functions/engagement-events.ts`

## TDD evidence

1. Wrote `matching.test.ts`, `timeline.test.ts`, and `signals.test.ts` before creating the relationship modules.
2. Ran the focused Vitest command and confirmed the suites failed because the production modules did not exist yet.
3. Implemented the minimum production code in `matching.ts`, `timeline.ts`, `signals.ts`, and `types.ts`.
4. Re-ran the focused tests until all `9` relationship tests passed.
5. Ran the full Vitest suite to confirm no regressions.

## Files changed

- `src/lib/types.ts`
- `src/lib/relationship/types.ts`
- `src/lib/relationship/matching.ts`
- `src/lib/relationship/timeline.ts`
- `src/lib/relationship/signals.ts`
- `src/lib/relationship/__tests__/matching.test.ts`
- `src/lib/relationship/__tests__/timeline.test.ts`
- `src/lib/relationship/__tests__/signals.test.ts`
- `.superpowers/sdd/task-3-report.md`

## Self-review findings

- The matching logic follows the requirement order exactly: normalized account name first, normalized domain second, otherwise `new`.
- The timeline builder is deterministic, pure, and only sorts by `occurred_at`, which keeps it easy to reuse in later server-function work.
- The signal builder uses the required CRM follow-up-only `attendee_status` values and does not reintroduce the old `attendance_status` or invite lifecycle states.
- Shared types in `src/lib/types.ts` are intentionally additive/backward-compatible where current pre-Phase-2 code still references older field names. This keeps Task 3 scoped while exposing the newer Neon schema names required by the brief.

## Concerns

- `src/lib/types.ts` now temporarily carries both new relationship schema fields and some legacy compatibility fields. That is deliberate for Task 3, but Task 4+ should be able to remove the compatibility aliases once the server functions and UI are migrated to the Neon relationship schema end-to-end.

## Fix Pass

### Files changed

- `src/lib/relationship/types.ts`
- `src/lib/relationship/signals.ts`
- `src/lib/relationship/timeline.ts`
- `src/lib/relationship/__tests__/matching.test.ts`
- `src/lib/relationship/__tests__/signals.test.ts`
- `src/lib/relationship/__tests__/timeline.test.ts`
- `.superpowers/sdd/task-3-report.md`

### What changed

- Tightened `CampaignMemberLite` and timeline campaign-member input types to use the shared `AttendeeStatus` and `FollowUpStatus` unions instead of unconstrained strings.
- Reworked post-event follow-up eligibility to accept only valid follow-up-worthy attendee statuses (`attended`, `met`, `high_intent`) and to ignore invalid legacy strings at runtime instead of treating them as attended.
- Replaced raw calendar-day follow-up aging with deterministic weekday-only business-day counting between `member.created_at` and `input.now`, with a weekend-boundary regression test.
- Replaced host-default quote `toLocaleString()` formatting with an explicit `Intl.NumberFormat("en-US", ...)` formatter so quote timeline details are stable across environments.
- Expanded matching tests to cover domain match, ambiguous-domain, and `new` outcomes.
- Left dismissal persistence untouched. The review note about persisting dismissed signals belongs to later signal persistence/server-function tasks, not this pure relationship logic pass.

### Tests run with exact results

#### Focused red run

Command:

```powershell
& 'C:\Program Files\nodejs\node.exe' .\node_modules\vitest\vitest.mjs run src/lib/relationship/__tests__/matching.test.ts src/lib/relationship/__tests__/timeline.test.ts src/lib/relationship/__tests__/signals.test.ts
```

Result:

- Exit code `1`
- `1` failed test file, `2` passed test files
- `2` failed tests, `13` passed tests
- Expected failing cases before implementation:
  - `does not flag post-event follow-up before three business days when a weekend intervenes`
  - `ignores invalid legacy attendee statuses for post-event follow-up`

#### Focused green run

Command:

```powershell
& 'C:\Program Files\nodejs\node.exe' .\node_modules\vitest\vitest.mjs run src/lib/relationship/__tests__/matching.test.ts src/lib/relationship/__tests__/timeline.test.ts src/lib/relationship/__tests__/signals.test.ts
```

Result:

- Exit code `0`
- `3` test files passed
- `15` tests passed

#### Full Vitest run

Command:

```powershell
& 'C:\Program Files\nodejs\node.exe' .\node_modules\vitest\vitest.mjs run
```

Result:

- Exit code `0`
- `32` test files passed
- `179` tests passed

#### TypeScript verification

Command:

```powershell
& 'C:\Program Files\nodejs\node.exe' .\node_modules\typescript\bin\tsc --noEmit
```

Result:

- Exit code `1`
- No Task 3 relationship type failures remain
- Remaining failures are inherited baseline server-function serializability issues caused by `unknown` fields
- Remaining files in the error set:
  - `src/server-functions/accounts.ts`
  - `src/server-functions/automation-playbooks.ts`
  - `src/server-functions/campaigns.ts`
  - `src/server-functions/contacts.ts`
  - `src/server-functions/engagement-events.ts`

### Remaining concerns

- The Task 3 pure layer now rejects invalid legacy attendee strings for follow-up signaling, but any upstream migration still emitting those values should be cleaned up in later data-access/server-function work.
- Dismissal persistence remains intentionally out of scope for this task and still belongs to the later signal persistence/server-function tasks.
