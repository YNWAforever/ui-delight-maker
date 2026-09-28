-- Versioned manual Xero-entry state. Existing rows are not rewritten: legacy
-- entered rows without evidence remain visible for read-only reconciliation.
alter table job_sheet_portions
  add column if not exists row_version integer not null default 0,
  add column if not exists xero_confirmed_at timestamptz,
  add column if not exists xero_confirmed_by text references profiles(id) on delete set null,
  add column if not exists xero_corrected_at timestamptz,
  add column if not exists xero_corrected_by text references profiles(id) on delete set null,
  add column if not exists xero_correction_reason text;

alter table job_sheet_portions
  add constraint job_sheet_portions_row_version_check
  check (row_version >= 0);

create or replace function guard_job_sheet_portion_xero_state()
returns trigger language plpgsql as $$
declare
  identity_present boolean;
  evidence_changed boolean;
begin
  identity_present :=
    nullif(btrim(coalesce(new.xero_invoice_number, '')), '') is not null
    or nullif(btrim(coalesce(new.xero_invoice_reference, '')), '') is not null;

  if tg_op = 'INSERT' then
    if new.status = 'entered_in_xero'
       and (not identity_present or new.xero_invoice_date is null
            or new.xero_confirmed_at is null or new.xero_confirmed_by is null) then
      raise exception 'Xero entry requires confirmed invoice identity and date'
        using errcode = '23514';
    end if;
    return new;
  end if;

  new.row_version := old.row_version + 1;
  evidence_changed :=
    new.xero_invoice_number is distinct from old.xero_invoice_number
    or new.xero_invoice_reference is distinct from old.xero_invoice_reference
    or new.xero_invoice_date is distinct from old.xero_invoice_date;

  if old.status = 'cancelled' and new.status = 'entered_in_xero' then
    raise exception 'Cancelled portion cannot become entered in Xero'
      using errcode = '23514';
  end if;

  if new.status = 'entered_in_xero' and old.status <> 'entered_in_xero' then
    if not identity_present or new.xero_invoice_date is null
       or new.xero_confirmed_at is null or new.xero_confirmed_by is null then
      raise exception 'Xero entry requires confirmed invoice identity and date'
        using errcode = '23514';
    end if;
    insert into job_sheet_activity (job_sheet_id, actor_id, action, note, diff_data)
    values (
      new.job_sheet_id, new.xero_confirmed_by, 'xero_entry_confirmed',
      'Manual Xero entry recorded; provider sync not asserted',
      jsonb_build_object('portion_id', new.id, 'from_status', old.status,
                         'to_status', new.status, 'invoice_date', new.xero_invoice_date)
    );
  elsif old.status = 'entered_in_xero'
        and (new.status <> 'entered_in_xero' or evidence_changed) then
    if new.xero_corrected_by is null
       or new.xero_corrected_at is null
       or new.xero_corrected_at is not distinct from old.xero_corrected_at
       or nullif(btrim(coalesce(new.xero_correction_reason, '')), '') is null then
      raise exception 'Xero evidence correction requires actor, time, and reason'
        using errcode = '23514';
    end if;
    if new.status = 'entered_in_xero'
       and (not identity_present or new.xero_invoice_date is null) then
      raise exception 'Corrected Xero entry still requires identity and date'
        using errcode = '23514';
    end if;
    insert into job_sheet_activity (job_sheet_id, actor_id, action, note, diff_data)
    values (
      new.job_sheet_id, new.xero_corrected_by, 'xero_entry_corrected',
      new.xero_correction_reason,
      jsonb_build_object('portion_id', new.id, 'from_status', old.status,
                         'to_status', new.status)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists job_sheet_portion_xero_state_guard on job_sheet_portions;
create trigger job_sheet_portion_xero_state_guard
before insert or update on job_sheet_portions
for each row execute function guard_job_sheet_portion_xero_state();
