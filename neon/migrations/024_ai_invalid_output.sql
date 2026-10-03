-- Add an explicit terminal outcome without changing historical rows or prior migrations.
alter table agent_runs drop constraint agent_runs_outcome_code_check;
alter table agent_runs add constraint agent_runs_outcome_code_check check (
  outcome_code is null or outcome_code in (
    'expired','cancelled','retry_requested','superseded',
    'awaiting_manual_send','manual_send_recorded',
    'completed','timeout','dispatch_ambiguous','provider_error',
    'invalid_output'
  )
);
