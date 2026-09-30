# U01 current-identity workspace states — 2026-10-01 HKT

## Executed scoped acceptance

[Eleven actual cases](evidence/onboarding-states-0376f5c-2026-10-01.json) PASS at protected isolated source `0376f5c`, with the genuine own sales Auth identity. Hosting access alone in the anonymous context supplies no app identity. Same-origin browser fetch reuses a previously verified CRM GET; the active baseline proves the request transports a real allowed payload.

- Active sales redirects from sign-in to the workspace without a loop and can read the scoped Lead.
- Anonymous, suspended, deactivated, no_profile, invited and expired-invitation/no-profile states deny the actual CRM GET with **Authentication required**, serialized error and no business/owner payload. HTTP200 is only the server-function envelope.
- The pending synthetic invitation page shows the intended fake email and role. Expired, SQL-fixture accepted/used and revoked pages show the specific reason; keyboard Enter on Go to sign in reaches sign-in.

States are exercised by temporary isolated SQL fixtures, preserving the real Auth identity/cookies and existing sales role/profile ID. The sales text profile does not equal its Auth UUID; temporarily moving its fixture email rehearses a genuine signed-in identity without a matching workspace profile. No provider signup, email delivery or actual invitation acceptance is claimed. All original profile fields except the database trigger-maintained updated_at are restored, and the sole new synthetic invitation is revoked. No business records or real provider/customer messages are changed.

[Anonymous](evidence/onboarding-0376f5c-anonymous.png), [Suspended](evidence/onboarding-0376f5c-suspended.png), [Deactivated](evidence/onboarding-0376f5c-deactivated.png), [No profile](evidence/onboarding-0376f5c-no_profile.png), [Invited](evidence/onboarding-0376f5c-invited.png), [Ready](evidence/onboarding-0376f5c-invitation-ready.png), [Expired](evidence/onboarding-0376f5c-invitation-expired.png), [Used](evidence/onboarding-0376f5c-invitation-accepted.png), [Revoked](evidence/onboarding-0376f5c-invitation-revoked.png).

## Retained observer failure and remaining gates

[First incomplete run](evidence/onboarding-observer-failed-0376f5c-2026-10-01.json): active case passed, then the observer omitted the actual Authentication required message from its denial matcher. Its cleanup assertion also expected the profiles_updated_at trigger to retain the old timestamp. Actual email/status/role remained restored. The corrected observer uses the exact authorization message, asserts all original profile business fields, and explicitly records automatic updated_at changes. No application authorization, database trigger or safety gate was disabled.

Existing T18 positive component/contracts and real PostgreSQL invitation concurrency/rollback remain linked in [T18](../2026-09-27/t18-evidence.md). These actual states complete the specified state/CRM denial slice. Full U01 invite-send/signup/actual acceptance and provider proof remain pending. CO-21 stays in_progress for that unexecuted integration; no source or migration change in this slice. Release NO-GO, production held.
