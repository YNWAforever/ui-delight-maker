import { query } from "@/server/db/neon.server";

export type WorkspaceSearchResult = {
  id: string;
  type: "Company" | "Person" | "Lead" | "Quote" | "Client" | "Task";
  title: string;
  subtitle: string;
  href: string;
  matchedOn: string;
};

type WorkspaceSearchRow = Omit<WorkspaceSearchResult, "matchedOn"> & {
  matched_on: string;
  type_order: number;
};

export async function searchWorkspace(
  rawQuery: string,
  requestedLimit = 20,
): Promise<WorkspaceSearchResult[]> {
  const searchTerm = rawQuery.trim();
  if (searchTerm.length < 3) return [];
  const limit = Math.max(1, Math.min(20, Math.trunc(requestedLimit) || 20));
  const rows = await query<WorkspaceSearchRow>(
    `select * from (
       select a.id::text as id, 'Company'::text as type, a.name as title,
              replace(a.lifecycle_stage, '_', ' ') as subtitle,
              '/accounts/' || a.id::text as href, 'name'::text as matched_on, 1 as type_order
       from accounts a
       where a.name ilike $1 or coalesce(a.domain, '') ilike $1

       union all
       select p.id::text, 'Person', p.name,
              coalesce(p.title, p.email, 'Company contact'),
              '/accounts/' || p.account_id::text, 'contact', 2
       from account_contacts p
       where p.name ilike $1 or coalesce(p.email, '') ilike $1

       union all
       select l.id::text, 'Lead', l.company_name,
              coalesce(l.contact_name, replace(l.status, '_', ' ')),
              '/leads/' || l.id::text, 'lead', 3
       from leads l
       where l.company_name ilike $1 or coalesce(l.contact_name, '') ilike $1
          or coalesce(l.contact_email, '') ilike $1

       union all
       select q.id::text, 'Quote', coalesce(q.number, 'Draft quote'),
              replace(q.status, '_', ' ') || ' - ' || q.currency,
              '/quotes/' || q.id::text, 'quote', 4
       from quotes q
       where coalesce(q.number, '') ilike $1 or q.id::text ilike $1

       union all
       select c.id::text, 'Client', c.company_name,
              coalesce(c.industry, c.tier, 'Client'),
              '/clients/' || c.id::text, 'client', 5
       from clients c
       where c.company_name ilike $1 or coalesce(c.industry, '') ilike $1

       union all
       select t.id::text, 'Task', t.title,
              replace(t.status, '_', ' ') || ' - ' || t.priority,
              '/tasks', 'task', 6
       from tasks t
       where t.title ilike $1 or coalesce(t.description, '') ilike $1
     ) results
     order by type_order, lower(title)
     limit $2`,
    [`%${searchTerm}%`, limit],
  );

  return rows.map(({ matched_on, type_order: _typeOrder, ...row }) => ({
    ...row,
    matchedOn: matched_on,
  }));
}
