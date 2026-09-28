-- Recovery metadata keeps terminal runs and manual message handoff distinguishable from delivery.
alter table agent_runs add column if not exists outcome_code text;
alter table agent_runs add column if not exists attempt_id uuid not null default gen_random_uuid();
alter table agent_runs add column if not exists retry_of uuid references agent_runs(id) on delete restrict;
alter table agent_runs add column if not exists recovery_reason text;
alter table agent_runs add column if not exists recovered_by text references profiles(id) on delete set null;
alter table agent_runs add column if not exists recovered_at timestamptz;
alter table agent_runs add constraint agent_runs_outcome_code_check
  check (outcome_code is null or outcome_code in ('expired','cancelled','retry_requested','superseded','awaiting_manual_send','manual_send_recorded'));
create unique index if not exists agent_runs_attempt_id_uidx on agent_runs(attempt_id);
create index if not exists agent_runs_retry_of_idx on agent_runs(retry_of);

alter table human_approvals add column if not exists recovery_outcome_code text;
alter table human_approvals add column if not exists recovery_reason text;
alter table human_approvals add constraint human_approvals_recovery_outcome_code_check
  check (recovery_outcome_code is null or recovery_outcome_code in ('expired','cancelled','superseded'));

alter table activity_logs drop constraint if exists activity_logs_object_type_check;
alter table activity_logs add constraint activity_logs_object_type_check
  check (object_type in (
    'lead', 'quote', 'client', 'task', 'approval', 'engagement',
    'account', 'contact', 'campaign', 'campaign_member', 'relationship_signal',
    'quote_version', 'job_sheet', 'job_sheet_portion', 'agent_run'
  ));

create table if not exists approval_message_handoffs (
  approval_id uuid primary key references human_approvals(id) on delete cascade,
  handoff_status text not null check (handoff_status in ('awaiting_manual_send','manual_send_recorded')),
  sent_reference text,
  recorded_by text references profiles(id) on delete set null,
  recorded_at timestamptz,
  created_at timestamptz not null default now(),
  check ((handoff_status = 'awaiting_manual_send' and sent_reference is null and recorded_at is null)
    or (handoff_status = 'manual_send_recorded' and sent_reference is not null and recorded_at is not null))
);
