-- Approval state and command idempotency. Applied only through the ordered migration runner.
alter table human_approvals add column if not exists row_version integer not null default 0;
alter table human_approvals add column if not exists superseded_by uuid references human_approvals(id) on delete restrict;
alter table human_approvals drop constraint if exists human_approvals_status_check;
alter table human_approvals add constraint human_approvals_status_check
  check (status in ('pending','escalated','approved','rejected','superseded'));
alter table human_approvals add constraint human_approvals_row_version_check
  check (row_version >= 0);
alter table human_approvals add constraint human_approvals_superseded_link_check
  check ((status = 'superseded' and superseded_by is not null)
      or (status <> 'superseded' and superseded_by is null));

create table if not exists command_receipts (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  actor_id text not null,
  idempotency_key text not null,
  request_hash text not null,
  result jsonb,
  created_at timestamptz not null default now(),
  unique (scope, actor_id, idempotency_key),
  check (length(trim(idempotency_key)) between 8 and 255)
);

create or replace function guard_human_approval_transition()
returns trigger language plpgsql as $$
begin
  if old.status in ('approved','rejected','superseded') then
    raise exception 'Approval terminal state is immutable' using errcode = '23514';
  end if;
  if new.status = 'superseded' and new.superseded_by = old.id then
    raise exception 'Approval cannot supersede itself' using errcode = '23514';
  end if;
  new.row_version := old.row_version + 1;
  return new;
end;
$$;

drop trigger if exists human_approvals_transition_guard on human_approvals;
create trigger human_approvals_transition_guard
before update on human_approvals
for each row execute function guard_human_approval_transition();
