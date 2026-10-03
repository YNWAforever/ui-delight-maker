-- Additive: old callbacks and historical runs may have no transport provenance.
alter table agent_runs add column if not exists execution_metadata jsonb;
alter table agent_runs add constraint agent_runs_execution_metadata_check check (
  execution_metadata is null or (
    jsonb_typeof(execution_metadata) = 'object'
    and execution_metadata->>'source' is not null
    and execution_metadata->>'source' in ('provider','deterministic_fallback','unknown')
    and (execution_metadata - array['source','providerRequestId','workerExecutionId','workerVersion','requestedModel','actualModel','fallbackReason']) = '{}'::jsonb
  )
);
