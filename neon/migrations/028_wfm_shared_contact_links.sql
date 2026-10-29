-- Shared WFM contacts retain one canonical owning account in account_contacts.
-- Each source client, including the owner, gets an independent association here.
-- This deliberately does not use the (id,account_id) owner constraint from 022.
create table if not exists account_contact_links (
  contact_id uuid not null references account_contacts(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(contact_id,account_id)
);
create index if not exists account_contact_links_account_idx on account_contact_links(account_id);

-- Match 022/027: server/operator access only; no browser policies or grants.
alter table account_contact_links enable row level security;
revoke all on table account_contact_links from public;
