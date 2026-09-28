-- The reason for proceeding without a purchase order is an explicit handoff field.
alter table job_sheets add column if not exists no_po_reason text;
alter table job_sheets add column if not exists row_version integer not null default 0;
drop trigger if exists job_sheets_bulk_row_version on job_sheets;
create trigger job_sheets_bulk_row_version before update on job_sheets
for each row execute function bump_bulk_row_version();


create or replace function guard_accepted_job_sheet_header()
returns trigger language plpgsql as $$
begin
  if old.status = 'accepted' or old.locked_at is not null then
    if new.status is distinct from old.status
       or new.locked_at is distinct from old.locked_at
       or new.accepted_at is distinct from old.accepted_at
       or new.accepted_by is distinct from old.accepted_by
       or new.quote_id is distinct from old.quote_id
       or new.accepted_quote_version_id is distinct from old.accepted_quote_version_id
       or new.account_id is distinct from old.account_id
       or new.client_id is distinct from old.client_id
       or new.contact_id is distinct from old.contact_id
       or new.sales_owner is distinct from old.sales_owner
       or new.total_amount is distinct from old.total_amount
       or new.currency is distinct from old.currency
       or new.po_number is distinct from old.po_number
       or new.no_po_reason is distinct from old.no_po_reason
       or new.client_order_number is distinct from old.client_order_number
       or new.accepted_scope_summary is distinct from old.accepted_scope_summary
    then
      raise exception 'Accepted Job Sheet commercial handoff is locked';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists accepted_job_sheet_header_guard on job_sheets;
create trigger accepted_job_sheet_header_guard before update on job_sheets
for each row execute function guard_accepted_job_sheet_header();
