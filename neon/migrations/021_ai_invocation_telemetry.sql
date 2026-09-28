-- Direct note tidy is an auxiliary governed workflow, not an agent catalogue card.
alter table agent_runs drop constraint if exists agent_runs_workflow_type_check;
alter table agent_runs add constraint agent_runs_workflow_type_check
  check (workflow_type in (
    'qualify_lead','draft_reply','draft_quote','score_renewal_risk',
    'relationship_intelligence','note_tidy'
  ));
alter table agent_runs drop constraint if exists agent_runs_subject_type_check;
alter table agent_runs add constraint agent_runs_subject_type_check
  check (subject_type in (
    'lead','quote','client','task','approval','engagement','account','campaign','note'
  ));
alter table agent_runs drop constraint if exists agent_runs_outcome_code_check;
alter table agent_runs add constraint agent_runs_outcome_code_check
  check (outcome_code is null or outcome_code in (
    'expired','cancelled','retry_requested','superseded',
    'awaiting_manual_send','manual_send_recorded',
    'completed','timeout','dispatch_ambiguous','provider_error'
  ));
alter table agent_runs add column if not exists idempotency_key text
  check (idempotency_key is null or length(idempotency_key) between 1 and 128);
alter table agent_runs add column if not exists policy_version_id uuid
  references agent_policy_versions(id) on delete restrict;
alter table agent_runs add column if not exists usage_data jsonb
  check (usage_data is null or jsonb_typeof(usage_data) = 'object');
create unique index if not exists agent_runs_invocation_key_uidx
  on agent_runs (workflow_type, created_by, idempotency_key)
  where idempotency_key is not null;
