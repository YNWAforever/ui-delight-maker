# T03 read surface visibility — work in progress

Search slice commit: `8f9d672` (`fix: scope global search before matching`).

- Before fix, real isolated PostgreSQL returned a lead when accounting searched a lead-only email token, and returned a task when the actor had an explicit task deny and searched its title/description.
- Global search now requires a request authorization context, and each of its six UNION branches applies its resource SQL scope inside the branch before matching, ordering or LIMIT. The quote branch remains visible to accounting without `leads.view`; an allowed task remains searchable. The repository requires context so direct callers cannot accidentally use an unscoped default.
- On disposable local PostgreSQL, the three positive security cases pass; the two existing repository tests pass with the required context. `bunx tsc --noEmit` exit 0.
- Dashboard, approvals, job sheet list/count/detail/export, UI role smoke, and the full T03 build/release gates remain open. This evidence does not mark CO-01–03 verified fixed.