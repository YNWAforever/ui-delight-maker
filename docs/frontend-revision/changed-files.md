# Changed Files

## Shell

## Shared components

- `src/components/relationship/account-preview-panel.tsx` — router `Link` instead of a raw anchor, a locked favorite star, and honest counts sourced from the account overview read instead of hardcoded zeros (D1).
- `src/components/relationship/workspace-view-switcher.tsx` — `onSaved` and `onClearView` callbacks so the route can refresh and confirm a save, and so "Current filters" can clear an applied view (D1).
- `src/components/relationship/stakeholder-map.tsx` — explicit "No decision-maker identified" / "No champion identified" signals, plus optional add/edit stakeholder controls (D2).
- `src/components/relationship/account-timeline.tsx` — **deleted**; Account 360 now renders the shared `ActivityTimeline` (D2).

## Libraries

- `src/lib/query-keys.ts` — added the `quoteReferences` namespace (C4/C5).
- `src/lib/quote-to-cash.ts` — added `DEFAULT_QUOTE_VALIDITY_DAYS` and `defaultQuoteValidUntil` (C5).
- `src/hooks/use-quote-reference-data.ts` — moved off `crmQueryKeys.quotes.list` onto `crmQueryKeys.quoteReferences` (C5).
- `src/lib/admin-ux-search.ts` — added `q` to `companiesSearchSchema` and `signals` to `ACCOUNT_DETAIL_TABS` (D1/D2).
- `src/lib/company-workspace/invalidation.ts` — added `activity` to both signal mutations and an `account_contact` mutation family (D2).
- `src/lib/company-workspace/section-enablement.ts` — the Signals tab enables the `intelligence` section, which previously had no consumer (D2).

## Routes

- `src/routes/quotes.tsx` — C4.
- `src/routes/quotes.new.tsx` — C5.
- `src/routes/accounts.tsx` — D1.
- `src/routes/accounts.$id.tsx` — D2.

## Server

- `src/server/repositories/accounts.ts` — `listAccountsPage` accepts a `sort` key and orders by a fixed whitelist (`ACCOUNT_ORDER_BY`). Additive, backward compatible, no migration, capability enforcement unchanged, covered by `src/server/repositories/__tests__/accounts.test.ts`. Passes the §2.8 backend-change gate under "truthful frontend state": sorting was previously done in the route over one page and presented as the whole workspace (IF-D1-01). (D1)

## Tests

- `src/routes/__tests__/-accounts-list-write-safety.test.tsx` — new (D1).
- `src/routes/__tests__/-account-detail-write-safety.test.tsx` — new (D2).
- `src/lib/company-workspace/__tests__/invalidation.test.ts` — new (D2).
- `src/routes/__tests__/-admin-url-state.test.tsx` — Companies URL-state block rewritten for the new composition (D1).
- `src/routes/__tests__/-accounts-workspace-resilience.test.tsx` — `useRouter` added to the router mock (D2).
- `src/components/relationship/__tests__/account-preview-panel.test.tsx` — updated for the new prop shape, plus the favorite lock (D1).
- `src/server/repositories/__tests__/accounts.test.ts` — sort whitelist and tie-break coverage (D1).

## Configuration

## Docs
