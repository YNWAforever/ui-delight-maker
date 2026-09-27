-- Database guard for accepted Job Sheet commercial terms. Xero evidence and
-- notes remain writable through the versioned accounting commands.
create or replace function guard_locked_job_sheet_portion_commercial()
returns trigger language plpgsql as $$
declare
  sheet_status text;
  sheet_locked_at timestamptz;
  sheet_id uuid;
begin
  sheet_id := case when tg_op = 'DELETE' then old.job_sheet_id else new.job_sheet_id end;
  select status, locked_at into sheet_status, sheet_locked_at
  from job_sheets where id = sheet_id for share;
  if sheet_status <> 'accepted' and sheet_locked_at is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' or tg_op = 'DELETE' then
    raise exception 'Accepted Job Sheet portions cannot be inserted or removed'
      using errcode = '23514';
  end if;

  if new.job_sheet_id is distinct from old.job_sheet_id
     or new.name is distinct from old.name
     or new.description is distinct from old.description
     or new.source_quote_line_item_ids is distinct from old.source_quote_line_item_ids
     or new.amount is distinct from old.amount
     or new.currency is distinct from old.currency
     or new.target_invoice_date is distinct from old.target_invoice_date
     or new.billing_type is distinct from old.billing_type
     or new.sort_order is distinct from old.sort_order
     or (new.status = 'cancelled' and old.status <> 'cancelled')
     or (old.status = 'cancelled' and new.status <> 'cancelled') then
    raise exception 'Accepted Job Sheet commercial terms are immutable'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists locked_job_sheet_portion_commercial_guard on job_sheet_portions;
create trigger locked_job_sheet_portion_commercial_guard
before insert or update or delete on job_sheet_portions
for each row execute function guard_locked_job_sheet_portion_commercial();
