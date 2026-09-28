-- T08 read-only reconciliation. Run against an approved copy or isolated DB first.
-- No legacy status or accounting evidence is inferred or rewritten.
with classified as (
  select
    p.id,
    p.status,
    p.xero_notes,
    p.xero_invoice_date,
    p.xero_confirmed_at,
    p.xero_confirmed_by,
    (nullif(btrim(coalesce(p.xero_invoice_number, '')), '') is not null
      or nullif(btrim(coalesce(p.xero_invoice_reference, '')), '') is not null) as has_identity
  from job_sheet_portions p
)
select 'entered_missing_identity' as issue, count(*)::bigint as rows
from classified where status='entered_in_xero' and not has_identity
union all
select 'entered_missing_date', count(*)::bigint
from classified where status='entered_in_xero' and xero_invoice_date is null
union all
select 'entered_missing_confirmation_metadata', count(*)::bigint
from classified where status='entered_in_xero'
  and (xero_confirmed_at is null or xero_confirmed_by is null)
union all
select 'planned_with_invoice_evidence', count(*)::bigint
from classified where status='planned' and (has_identity or xero_invoice_date is not null)
union all
select 'planned_with_notes_only', count(*)::bigint
from classified where status='planned' and xero_notes is not null and not has_identity
order by issue;
