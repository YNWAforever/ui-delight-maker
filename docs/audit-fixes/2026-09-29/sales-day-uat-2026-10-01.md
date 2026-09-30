# U02 sales day — 2026-10-01 HKT

## Executed same-record workflow

Protected exact source `5568af9`, genuine own sales/manager/read_only Auth sessions, isolated synthetic Neon target. A fresh disposable sales-owned Lead was prepared as the case fixture; the subsequent follow-up, Task and Quote writes are actual UI actions. [Six executed cases](evidence/sales-day-partial-5568af9-2026-10-01.json) pass:

- Lead shows **UAT sales** rather than its text profile ID.
- Home quick Task creates one linked follow-up and refreshes the same Lead. The existing quick action has no owner input, so **Unassigned** agrees with persisted null assignment.
- Sales moves that Task to in_progress with the real keyboard control; one row-version increment and refreshed state agree.
- Own read_only directly replays the actual Task mutation and is denied without state/version changes.
- Sales manually creates the same Lead's draft Quote at HKD200.50 with the correct text creator.
- Sales submits one persisted pending approval; own manager sees that exact handoff and Claim for review. Quote/approval states agree. No agent, customer or provider send occurred.

The raw workflow result remains success=false because the final related-link check is not complete. Initial observer errors are retained privately: Next action and Open follow-ups legitimately repeat the Task title; native browser Fetch Response uses a status property; unnumbered Quote.number is null. Original Lead/Task/Quote IDs and successful writes were retained when continuing; no duplicate creation was used to hide failures.

## Newly reproduced related Quote link defect

[Actual readonly probe](evidence/unnumbered-quote-before-5568af9-2026-10-01.json), [screen](evidence/unnumbered-quote-before-5568af9-2026-10-01.png): after the real Quotes tab renders, its pending unnumbered Quote has exactly one anchor with empty text and no aria-label. The current route renders nullable q.number as its entire label. This is a separate source defect and blocks the final linked-record/accessible navigation step in U02.

The owner correction's eight genuine-role cases pass independently. U02 stays pending until the Quote link has a visible accessible label and the same retained handoff is recaptured. No production operation; release remains NO-GO.

## Completed retained U02 — source 0376f5c

The six original executed cases above and five continued cases now form [eleven passing actual cases](evidence/sales-day-complete-0376f5c-2026-10-01.json). The original Lead, Task, Quote and approval IDs are retained. No duplicate creation or new business write was used for recapture.

- Genuine own sales, manager and read_only each see the visible **Untitled quote** link, focus it and press Enter to open the same persisted pending Quote.
- Own reader replays the actual quote-approval POST and receives a serialized authorization error. HTTP 200 is the server-function envelope, not successful authorization. Full persisted business rows and reader receipt count remain unchanged.
- Own manager retains the same one pending Claim for review handoff.

Screens: [Sales related link](evidence/sales-day-complete-0376f5c-sales-related-link.png), [Sales Quote](evidence/sales-day-complete-0376f5c-sales-quote.png), [Manager related link](evidence/sales-day-complete-0376f5c-manager-related-link.png), [Manager Quote](evidence/sales-day-complete-0376f5c-manager-quote.png), [Reader related link](evidence/sales-day-complete-0376f5c-read_only-related-link.png), [Reader Quote](evidence/sales-day-complete-0376f5c-read_only-quote.png), [Manager handoff](evidence/sales-day-complete-0376f5c-manager-handoff.png).

U02 PASS is limited to the specified isolated sales-day scenario. Historical failed probes/observer outputs remain retained. This does not complete all R04 workflows, responsive/screen-reader U15 or external release gates. No production operation or provider/customer message; release NO-GO.
