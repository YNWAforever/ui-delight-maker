-- Additive indexes for scoped keyset work queues.
-- T19 compares runtime plans on 10k tasks and 100k approvals before release.
create index if not exists tasks_queue_created_idx
  on tasks (created_at desc, id desc);
create index if not exists tasks_queue_status_created_idx
  on tasks (status, created_at desc, id desc);
create index if not exists tasks_queue_owner_status_created_idx
  on tasks (assigned_to, status, created_at desc, id desc);

create index if not exists human_approvals_queue_created_idx
  on human_approvals (created_at desc, id desc);
create index if not exists human_approvals_queue_status_created_idx
  on human_approvals (status, created_at desc, id desc);
create index if not exists human_approvals_queue_owner_status_created_idx
  on human_approvals (assigned_to, status, created_at desc, id desc);
