-- Read-only preflight for an authorized isolated copy of legacy data.
-- Return IDs and issue codes only; investigate each finding before migration 012.
-- Do not infer a historical issued snapshot from the current editable quote row.
select context_data->>'quote_id' as quote_id, count(*)::int as open_approvals
from human_approvals
where approval_type = 'quote_send'
  and status in ('pending', 'escalated')
  and context_data->>'quote_id' is not null
group by context_data->>'quote_id'
having count(*) > 1;

select id as approval_id, status
from human_approvals
where approval_type = 'quote_send'
  and status in ('pending', 'escalated')
  and context_data->>'quote_id' is null
order by id;

select quote_id, count(*)::int as job_sheets
from job_sheets
where quote_id is not null
group by quote_id
having count(*) > 1;

select q.id as quote_id,
       case
         when q.status in ('sent', 'viewed', 'accepted')
              and q.issued_version_id is null then 'missing_issued_pointer'
         when q.status in ('sent', 'viewed', 'accepted')
              and (iv.id is null or iv.reason <> 'issued') then 'invalid_issued_version'
         when q.status = 'accepted' and q.accepted_version_id is null
              then 'missing_accepted_pointer'
         when q.status = 'accepted'
              and (av.id is null or av.reason <> 'accepted') then 'invalid_accepted_version'
         when q.status = 'accepted' and q.accepted_at is null
              then 'missing_accepted_at'
       end as issue_code
from quotes q
left join quote_versions iv on iv.id = q.issued_version_id and iv.quote_id = q.id
left join quote_versions av on av.id = q.accepted_version_id and av.quote_id = q.id
where (q.status in ('sent', 'viewed', 'accepted')
       and (q.issued_version_id is null or iv.id is null or iv.reason <> 'issued'))
   or (q.status = 'accepted'
       and (q.accepted_version_id is null or av.id is null
            or av.reason <> 'accepted' or q.accepted_at is null))
order by q.id;
