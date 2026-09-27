-- Freeze commercial content once a quote leaves an editable draft/revision.
-- Existing rows are not rewritten; any legacy inconsistency needs reconciliation.
create or replace function guard_quote_commercial_integrity()
returns trigger language plpgsql as $$
begin
  if (old.status not in ('draft','revised') or new.status not in ('draft','revised')) and (
    new.number is distinct from old.number or
    new.lead_id is distinct from old.lead_id or
    new.client_id is distinct from old.client_id or
    new.contact_id is distinct from old.contact_id or
    new.account_id is distinct from old.account_id or
    new.deal_id is distinct from old.deal_id or
    new.total_value is distinct from old.total_value or
    new.currency is distinct from old.currency or
    new.valid_until is distinct from old.valid_until or
    new.line_items is distinct from old.line_items or
    new.quote_template_id is distinct from old.quote_template_id or
    new.document_sections is distinct from old.document_sections or
    new.cover_text is distinct from old.cover_text or
    new.assumptions is distinct from old.assumptions or
    new.payment_terms is distinct from old.payment_terms or
    new.parent_quote_id is distinct from old.parent_quote_id or
    new.change_order_reason is distinct from old.change_order_reason
  ) then
    raise exception 'Quote commercial content is immutable after approval request'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists quote_commercial_integrity_guard on quotes;
create trigger quote_commercial_integrity_guard
before update on quotes
for each row execute function guard_quote_commercial_integrity();

create or replace function guard_quote_line_item_integrity()
returns trigger language plpgsql as $$
declare
  quote_status text;
begin
  if tg_op = 'UPDATE' and new.quote_id is distinct from old.quote_id then
    raise exception 'Quote line items cannot be moved between quotes'
      using errcode = '23514';
  end if;
  select status into quote_status from quotes
    where id = coalesce(new.quote_id, old.quote_id) for update;
  if quote_status not in ('draft','revised') then
    raise exception 'Quote line items are immutable after approval request'
      using errcode = '23514';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists quote_line_item_integrity_guard on quote_line_items;
create trigger quote_line_item_integrity_guard
before insert or update or delete on quote_line_items
for each row execute function guard_quote_line_item_integrity();

create or replace function guard_quote_version_integrity()
returns trigger language plpgsql as $$
begin
  raise exception 'Quote version is immutable' using errcode = '23514';
end;
$$;

drop trigger if exists quote_version_integrity_guard on quote_versions;
create trigger quote_version_integrity_guard
before update or delete on quote_versions
for each row execute function guard_quote_version_integrity();
