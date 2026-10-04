-- A model is unknown until a transport receipt reports it. Preserve every historical
-- value; do not infer an actual model or rewrite existing runs.
alter table agent_runs alter column model_used drop not null;
alter table agent_runs alter column model_used drop default;
