-- Read-only aggregate inventory. Run against a candidate environment before any
-- identity backfill; it deliberately emits no names, emails, or external IDs.
with kinds(resource_type) as (
  values ('lead'), ('client'), ('account')
), duplicate_groups as (
  select 'lead' as resource_type, count(*)::int as size
  from leads
  group by lower(trim(company_name)), lower(trim(coalesce(contact_email, '')))
  having count(*) > 1
  union all
  select 'client', count(*)::int
  from clients
  group by lower(trim(company_name))
  having count(*) > 1
  union all
  select 'account', count(*)::int
  from accounts
  group by lower(trim(name))
  having count(*) > 1
)
select kinds.resource_type, count(duplicate_groups.size)::int as duplicate_groups,
       coalesce(sum(duplicate_groups.size), 0)::int as records_in_groups
from kinds left join duplicate_groups using (resource_type)
group by kinds.resource_type
union all
select 'identity_key', 0, count(*)::int from import_identity_keys
order by resource_type;
