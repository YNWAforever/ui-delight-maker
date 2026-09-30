# U15 retained journeys — 2026-10-01 HKT

## Executed widths and keyboard

[Actual twelve-case run](evidence/journey-widths-0376f5c-2026-10-01.json) PASS on the protected isolated source0376f5c. Genuine own sales and accounting Auth identities match their own sessions. Original U02 Lead/Quote, U07 locked billing sheet/portions and U08 synthetic Task fixture IDs are retained.

At **390,768,1440px**, each of these four scenarios passes:

- U02 named unnumbered Quote link is visible/focusable; Enter opens the same Quote, both documents fit.
- U07 retained sheet and labelled invoice control remain readable/reachable without document overflow.
- New Task: Enter opens, Title receives initial focus, Create with missing title shows readable Title required, Tab/Shift+Tab stay inside, Escape returns focus to trigger.
- U08: visible bulk controls create one genuine eligible preview; dialog controls are reachable, Tab/Shift+Tab trap and Escape work; Clear selection remains reachable. Process/commit is not submitted.

Screens: [Lead390](evidence/journey-widths-0376f5c-sales-lead-390.png), [Quote768](evidence/journey-widths-0376f5c-sales-quote-768.png), [Billing390](evidence/journey-widths-0376f5c-billing-390.png), [Billing1440](evidence/journey-widths-0376f5c-billing-1440.png), [Required error390](evidence/journey-widths-0376f5c-new-task-error-390.png), [Bulk preview390](evidence/journey-widths-0376f5c-bulk-dialog-390.png), [Bulk controls768](evidence/journey-widths-0376f5c-bulk-bar-768.png). All executed widths have source-bound raw dimensions and screenshots in evidence.

## Actual native200 percent

[Five-case native Chromium run](evidence/journey-native200-0376f5c-2026-10-01.json) PASS. The official chrome.tabs.setZoom API returns factor2, automatic/per-tab; actual window stays1440x1000 while CSS viewport and DPR change. Separate disposable sales/accounting browser profiles contain their own role cookies. No CSS zoom, viewport substitution, emulated scale or pinch.

The U02 Lead/link/Quote, U07 labelled invoice controls, New Task error/focus/Tab/Escape and U08 real eligible preview/bulk controls pass. Screens use CDP captureScreenshot of the native viewport: [Lead](evidence/journey-native200-0376f5c-sales-lead.png), [Quote](evidence/journey-native200-0376f5c-sales-quote.png), [Billing](evidence/journey-native200-0376f5c-billing.png), [New Task](evidence/journey-native200-0376f5c-new-task-error.png), [Bulk preview](evidence/journey-native200-0376f5c-bulk-dialog.png), [Bulk controls](evidence/journey-native200-0376f5c-bulk-bar.png).

## Scope and remaining criteria

Full original Lead/Quote/sheet/portions/Task rows before/after are unchanged. Real server preview reads occurred; no Task create/status/billing/bulk commit, real message, source change, migration or production operation. Existing actual U02/U07/U08 business workflows and prior Admin native200 proof remain separately linked in the [matrix](../2026-09-27/uat-results.md).

This accepts the seventeen executed responsive/native/keyboard cases. Full mixed-outcome receipt/control rendering at each width, broader dialogs and screen-reader/operator evidence remain unexecuted. Automated DOM focus assertions do not substitute for a screen reader. U15 retains those gates, production held and release NO-GO.
