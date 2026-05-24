-- Enable RLS on all tables
alter table profiles enable row level security;
alter table leads enable row level security;
alter table clients enable row level security;
alter table quotes enable row level security;
alter table tasks enable row level security;
alter table pricing_templates enable row level security;
alter table agent_runs enable row level security;
alter table agent_tool_calls enable row level security;
alter table human_approvals enable row level security;
alter table activity_logs enable row level security;

-- Profiles: each user reads all, updates only own row
create policy "profiles_select" on profiles for select to authenticated using (true);
create policy "profiles_update_own" on profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (
    role = (select role from profiles where id = auth.uid())
    or exists (
      select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Leads: authenticated users can read all; insert/update for authenticated users
create policy "leads_select" on leads for select to authenticated using (true);
create policy "leads_insert" on leads for insert to authenticated with check (true);
create policy "leads_update" on leads for update to authenticated using (true);

-- Clients
create policy "clients_select" on clients for select to authenticated using (true);
create policy "clients_insert" on clients for insert to authenticated with check (true);
create policy "clients_update" on clients for update to authenticated using (true);

-- Quotes
create policy "quotes_select" on quotes for select to authenticated using (true);
create policy "quotes_insert" on quotes for insert to authenticated with check (true);
create policy "quotes_update" on quotes for update to authenticated using (true);

-- Tasks
create policy "tasks_select" on tasks for select to authenticated using (true);
create policy "tasks_insert" on tasks for insert to authenticated with check (true);
create policy "tasks_update" on tasks for update to authenticated using (true);

-- Pricing templates: read-only for authenticated users
create policy "pricing_templates_select" on pricing_templates for select to authenticated using (active = true);
create policy "pricing_templates_admin_write" on pricing_templates
  for all to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- Agent tables: read for authenticated users (n8n writes via service role, bypasses RLS)
create policy "agent_runs_select" on agent_runs for select to authenticated using (true);
create policy "agent_tool_calls_select" on agent_tool_calls for select to authenticated using (true);
create policy "human_approvals_select" on human_approvals for select to authenticated using (true);
create policy "human_approvals_update" on human_approvals
  for update to authenticated
  using (
    assigned_to = auth.uid()
    or exists (
      select 1 from profiles where id = auth.uid() and role in ('admin','manager')
    )
  );
create policy "activity_logs_select" on activity_logs for select to authenticated using (true);
create policy "activity_logs_insert" on activity_logs for insert to authenticated with check (true);

-- Enable Realtime on agent_runs, human_approvals, leads
-- (Run these commands in Supabase dashboard > Database > Replication if not auto-enabled:)
-- alter publication supabase_realtime add table agent_runs;
-- alter publication supabase_realtime add table human_approvals;
-- alter publication supabase_realtime add table leads;
