# Client/Event import acceptance — 2026-09-30

## Exact source and isolation

Stable independent [UAT](https://clientops-uat-20260930.vercel.app), source `a18aa46273b10edc9cc75dbb11188ad9d49c98e6`; empty-origin Neon project `polished-forest-15724329`, branch `br-solitary-butterfly-b3883kwo`, database `clientops_uat`, independent Auth. Real own **manager** session performs both workflows. Each of the seven other-account receipt checks independently matches that role's real Auth user; seven Auth identities and own cookie sets are distinct. No super_admin session substitution, mocks, production DB, real provider/customer messages or permission widening.

The current main `000c19c` import service, adapter, server functions, shared import panel and Client/Event route files are unchanged from this source (actual Git comparison returned no differences). Existing five-second chunk budget, four-row server group and UI twenty-row request remain unchanged.

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

The full lifecycle is running with durable original session/key and per-call observations. **Pending: terminal4994 successful business outcomes, exact related side effects, whole-operation replay, terminal seven-role receipt isolation and actual issues download.** Do not promote U09/CO-17/CO-18 to full PASS from preview or pilot alone. Operational source-identity inventory and seven-day retention owner/dry run remain separate gates.

## Delivery and release

No application-source edit or migration in this slice. Exact-source private observers and retained inputs are in the Git-ignored local `.clientops-perf/uat` directory; credentials/cookies are not in public artifacts. Keep operation receipts and keys until completed and evidence exported. Do not promote or retarget the stable deployment while either operation is active. Release remains **NO-GO**.
