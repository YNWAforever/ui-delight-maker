-- Repairs older databases where tables already existed before newer link columns
-- were added to create-table migrations.

alter table leads add column if not exists contact_id uuid;
alter table leads add column if not exists account_id uuid;
alter table leads add column if not exists source_campaign_id uuid;
alter table leads add column if not exists campaign_member_id uuid;

alter table clients add column if not exists account_id uuid;
alter table clients add column if not exists primary_contact_id uuid;

alter table quotes add column if not exists contact_id uuid;
alter table quotes add column if not exists account_id uuid;
alter table quotes add column if not exists deal_id uuid;

alter table tasks add column if not exists contact_id uuid;
alter table tasks add column if not exists account_id uuid;
alter table tasks add column if not exists deal_id uuid;
alter table tasks add column if not exists project_id uuid;

alter table engagements add column if not exists lead_id uuid;
alter table engagements add column if not exists quote_id uuid;

alter table touchpoints add column if not exists contact_id uuid;

create index if not exists leads_contact_id_idx on leads(contact_id);
create index if not exists leads_account_id_idx on leads(account_id);
create index if not exists leads_source_campaign_id_idx on leads(source_campaign_id);
create index if not exists leads_campaign_member_id_idx on leads(campaign_member_id);
create index if not exists clients_account_id_idx on clients(account_id);
create index if not exists clients_primary_contact_id_idx on clients(primary_contact_id);
create index if not exists quotes_contact_id_idx on quotes(contact_id);
create index if not exists quotes_account_id_idx on quotes(account_id);
create index if not exists quotes_deal_id_idx on quotes(deal_id);
create index if not exists tasks_contact_id_idx on tasks(contact_id);
create index if not exists tasks_account_id_idx on tasks(account_id);
create index if not exists tasks_deal_id_idx on tasks(deal_id);
create index if not exists tasks_project_id_idx on tasks(project_id);
create index if not exists engagements_lead_id_idx on engagements(lead_id);
create index if not exists engagements_quote_id_idx on engagements(quote_id);
