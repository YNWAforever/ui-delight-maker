-- Stop concurrent quote approval requests and duplicate accepted Job Sheets.
-- Historical duplicates are left untouched; fail the migration for manual reconciliation.
do $$
begin
  if exists (
    select 1 from human_approvals
    where approval_type = 'quote_send'
      and status in ('pending', 'escalated')
      and context_data->>'quote_id' is not null
    group by context_data->>'quote_id'
    having count(*) > 1
  ) then
    raise exception 'Duplicate open quote-send approvals need reconciliation'
      using errcode = '23505';
  end if;

  if exists (
    select 1 from job_sheets
    where quote_id is not null
    group by quote_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate Job Sheets for one quote need reconciliation'
      using errcode = '23505';
  end if;
end;
$$;

create unique index if not exists human_approvals_quote_send_open_uidx
  on human_approvals ((context_data->>'quote_id'))
  where approval_type = 'quote_send'
    and status in ('pending', 'escalated')
    and context_data->>'quote_id' is not null;

create unique index if not exists job_sheets_quote_id_uidx
  on job_sheets (quote_id)
  where quote_id is not null;
