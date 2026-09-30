# Client/Event import acceptance — 2026-09-30

## Exact source and isolation

Stable independent [UAT](https://clientops-uat-20260930.vercel.app), source `a18aa46273b10edc9cc75dbb11188ad9d49c98e6`; empty-origin Neon project `polished-forest-15724329`, branch `br-solitary-butterfly-b3883kwo`, database `clientops_uat`, independent Auth. Real own **manager** session performs both workflows. Each of the seven other-account receipt checks independently matches that role's real Auth user; seven Auth identities and own cookie sets are distinct. No super_admin session substitution, mocks, production DB, real provider/customer messages or permission widening.

Main `f4e033e` import service, adapter, server functions, shared import panel and Client/Event route files are unchanged from this source (actual Git comparison returned no differences). Existing five-second chunk budget, four-row server group and UI twenty-row request remain unchanged.

## Completed 20-row pilots

Both Client and Event pilots complete all twenty records: **14 succeeded, 2 invalid, 2 skipped, 1 ambiguous, 1 stale**. These are observer/workflow validation, not a 5,000-row scale PASS.

- Real browser upload/preview produces the exact classification and does not write business records.
- First real commit forwards to the deployed server, then its actual response is lost. The saved idempotency key survives reload and a result-read interruption. Retry loads the real receipt; exact-key direct replay continues only unprocessed rows. The observer explicitly uses **Check result** after external direct replay, then checks the terminal UI.
- Client: fourteen distinct clients, fourteen contacts and fourteen engagements. Engagement owner is the manager's actual text profile ID; exact amount100.25, monthly period, start2026-09-30 and renewal2027-09-30 agree. Same-name records with distinct external IDs remain separate. Chinese quoted multiline industry survives.
- Event: fourteen distinct attendee rows with explicit account/contact links. The first two same-name CSV records have different explicit account IDs; the remaining new accounts/contacts and all follow-up owners agree with their input and actor. Chinese quoted multiline notes survive. No account is guessed from a name.
- Original-key terminal replay leaves every observed business field and per-row status unchanged.
- Own manager reads the receipt; the other six genuine sessions, including SA/admin, receive owner-access denial without business IDs.
- Actual browser issues CSV has BOM and four issue rows, excluding skips. Completed20/20 UI and lost-response screenshots are preserved.

[Client actual preview](evidence/r05-client20-preview-a18aa46-2026-09-30.json), [Client lifecycle](evidence/r05-client20-pilot-completed-a18aa46-2026-09-30.json), [Client terminal screen](evidence/r05-client20-completed-a18aa46-2026-09-30.png).
[Event actual preview](evidence/r05-event20-preview-a18aa46-2026-09-30.json), [Event lifecycle](evidence/r05-event20-pilot-completed-a18aa46-2026-09-30.json), [Event terminal screen](evidence/r05-event20-completed-a18aa46-2026-09-30.png).

Initial private observer failures are retained: a direct replay did not refresh the local UI; the Event SQL observer assumed a nonexistent campaign-member row_version. Corrected observers explicitly read the receipt and actual member columns; no server/schema/policy change or threshold exemption. Separate synthetic fixture IDs prevent replacing the failing runs.

## Actual 5,000-row previews and ongoing lifecycle

Each real 5,000-row browser upload classifies **4,994 ready / 2 invalid / 2 skipped / 1 ambiguous / 1 stale**, preserving BOM, Chinese, multiline, identical/conflicting source duplicates, explicit missing target and invalid owner. Each preview leaves clients/contacts/engagements or accounts/contacts/attendees at its exact before count.

Actual single-run upload-to-UI elapsed times: Client11,511ms and Event15,094ms; actual preview POST11,151ms and14,872ms respectively. These are individual runtime observations, not p95, before/after comparisons or SLA acceptance. [Client raw preview](evidence/r05-client5000-preview-a18aa46-2026-09-30.json), [Event raw preview](evidence/r05-event5000-preview-a18aa46-2026-09-30.json).

Both Client and Event full lifecycles are now complete with their original sessions and keys; terminal business/related-side-effect/replay/seven-role/download checks all pass. Production source inventory and retention owner/schedule are separate external gates. The [actual isolated cleanup dry-run/execute/replay](import-retention-rehearsal-2026-10-01.md) passes.

## Delivery and release

No application-source edit or migration in this slice. Exact-source private observers and retained inputs are in the Git-ignored local `.clientops-perf/uat` directory; credentials/cookies are not in public artifacts. Keep operation receipts and keys until completed and evidence exported. Do not promote or retarget the stable deployment while either operation is active. Release remains **NO-GO**.

## Client 5,000 terminal — 2026-10-01 HKT

[Actual complete result](evidence/r05-client5000-completed-a18aa46-2026-10-01.json): **4,994 succeeded, 2 invalid, 2 skipped, 1 ambiguous, 1 stale**,623 real UI Continue operations. All 4,994 Client/contact/engagement side effects validate; manager text-owner,100.25 monthly values/dates and quoted Chinese multiline fields agree. Same-name distinct source IDs remain distinct. Lost real commit response, failed receipt read, reload with original key, successful original-key replay and final terminal replay all pass without duplicate writes. All seven actual Auth/cookie identities are distinct; only the original manager reads the receipt and the other six, including SA/admin, deny without business IDs. Actual BOM issues CSV contains four issues and excludes skips.

[Completed screen](evidence/r05-client5000-completed-a18aa46-2026-10-01.png), [final screen](evidence/r05-client5000-final-a18aa46-2026-10-01.png), [lost response](evidence/r05-client5000-lost-response-a18aa46-2026-10-01.png). Retained synthetic input and exact browser download are archived with hashes. Actual elapsed wall time is10071121ms from2026-09-30T14:29:55.044Z to2026-09-30T17:17:46.165Z; this includes recovery, browser UI pacing and receipts under the unchanged chunk budget. It is one real workflow measurement, not p95, a before/after comparison or a general speed claim. Event 5,000 and final all-kind target inventory/parity now pass as recorded below; production/legacy inventory and retention operator/schedule remain external release gates.

## Event 5,000 and final target parity — 2026-10-01 HKT

[Actual Event terminal result](evidence/r05-event5000-completed-a18aa46-2026-10-01.json): **4,994 succeeded, 2 invalid, 2 skipped, 1 ambiguous, 1 stale**, with **624** real UI Continue operations. All attendee/account/contact relationships, explicit account IDs, manager follow-up owners and quoted Chinese multiline notes validate. Same-name distinct explicit sources remain distinct. Real lost-response/read interruption, reload with the original key, exact-key replay, terminal replay, seven actual own-role receipt boundaries and BOM four-issue download PASS. [Completed](evidence/r05-event5000-completed-a18aa46-2026-10-01.png), [final](evidence/r05-event5000-final-a18aa46-2026-10-01.png), [lost response](evidence/r05-event5000-lost-response-a18aa46-2026-10-01.png).

Actual elapsed wall time is **12676503 ms**, from 2026-09-30T14:32:03.372Z to 2026-09-30T18:03:19.875Z, including browser pacing/recovery under the unchanged limits. The Client wall time above is **10,071,121 ms**. These are individual real workflow observations, not fixture formulas, p95, before/after comparisons or general throughput guarantees.

[Final read-only repeatable-read target parity](evidence/r05-final-target-parity-a18aa46-2026-10-01.json) verifies all three actual Lead/Client/Event 5,000 sessions: completed, exact 0–4,999 positions, 5,000 distinct record indices, expected mixed statuses, **4,994 distinct success IDs and 4,994 existing targets per kind**, no missing success IDs or live leases. Each kind has 4,994 nonblank source-scoped identity mappings with **zero missing targets**. The repository's actual aggregate inventory SQL also ran against this isolated synthetic target. This proves these operations; it does not supply legacy snapshots or production source inventory/backfill authority. No payload, external key, name or email is emitted by the parity report.

U09 is **PASS for its defined isolated three-kind 5,000-row scenario**. CO-17 is verified fixed with parser regressions and actual three-kind multiline/download evidence. CO-18's implementation and isolated cleanup rehearsal pass; only production retention owner/schedule/approved target and legacy source inventory/backfill remain blocked externally. Exact synthetic input and actual issues downloads are archived with BOM/byte/hash manifests. Original receipts and source keys remain retained; no cleanup of these fresh sessions occurred.

Exact CSV archives: [Client archive](evidence/r05-client5000-actual-csv-a18aa46-2026-10-01.zip) / [manifest](evidence/r05-client5000-actual-csv-manifest-a18aa46-2026-10-01.json); [Event archive](evidence/r05-event5000-actual-csv-a18aa46-2026-10-01.zip) / [manifest](evidence/r05-event5000-actual-csv-manifest-a18aa46-2026-10-01.json). They contain only the retained synthetic input and exact actual browser issue download, with original CSV bytes retained.
