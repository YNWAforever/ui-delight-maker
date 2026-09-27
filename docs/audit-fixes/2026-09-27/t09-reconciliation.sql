-- Read-only T09 audit. Run on a reviewed database snapshot; do not repair or backfill here.
begin transaction read only;

with accepted as (
  select q.id, q.accepted_at, q.accepted_version_id,
         av.id as version_id, av.quote_id as version_quote_id,
         av.reason, av.snapshot
  from quotes q
  left join quote_versions av on av.id = q.accepted_version_id
  where q.status = 'accepted'
)
select count(*) as accepted_quotes,
       count(*) filter (where accepted_at is null) as missing_accepted_at,
       count(*) filter (where accepted_version_id is null) as missing_accepted_version_id,
       count(*) filter (where accepted_version_id is not null and version_id is null)
         as dangling_accepted_version_id,
       count(*) filter (where version_id is not null and version_quote_id <> id)
         as mismatched_accepted_version,
       count(*) filter (where version_id is not null and reason <> 'accepted')
         as wrong_version_reason,
       count(*) filter (where version_id is not null and (
         snapshot->>'currency' !~ '^[A-Z]{3}$'
         or snapshot->>'total_value' !~ '^[0-9]+([.][0-9]{1,2})?$'
         or snapshot->>'currency' is null or snapshot->>'total_value' is null
       )) as invalid_snapshot_money
from accepted;

select date_trunc('month', q.accepted_at at time zone 'Asia/Hong_Kong')::date
         as accepted_month_hk,
       av.snapshot->>'currency' as currency,
       count(*) as accepted_quotes,
       sum((av.snapshot->>'total_value')::numeric)::text as accepted_quote_value
from quotes q
join quote_versions av on av.id = q.accepted_version_id
where q.status = 'accepted'
  and q.accepted_at is not null
  and av.quote_id = q.id
  and av.reason = 'accepted'
  and av.snapshot->>'currency' ~ '^[A-Z]{3}$'
  and av.snapshot->>'total_value' ~ '^[0-9]+([.][0-9]{1,2})?$'
group by 1, 2
order by 1, 2;

rollback;
