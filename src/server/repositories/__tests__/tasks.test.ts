import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `listTasks` used to run `select *` against a fifteen-column table. Its consumers —
 * `src/routes/tasks.tsx` (via `getTasks`), `src/routes/accounts.$id.tsx` and the "Open tasks"
 * tile on the accounts commercial tab (via `loadCompanyWorkspaceRead`'s delivery_finance
 * section), and `getAccountWorkspaceData`'s `toCompanyWorkspaceSummary` call — only ever read
 * nine of those columns: `id`, `title`, `description`, `assigned_to`, `account_id`, `due_date`,
 * `priority`, `status`, and `created_by_agent`. `account_id` is the one easy to miss: it is
 * never rendered, but `src/routes/tasks.tsx`'s `move()` reads `movedTask?.account_id` to decide
 * which company workspace queries to invalidate after a status change.
 *
 * `client_id`, `contact_id`, `deal_id`, and `project_id` are `where` filters and `created_at` is
 * the `order by` column — real SQL, but none of them need to appear in the `select` list for the
 * filter or the ordering to work, since Postgres resolves both against the table, not the
 * projection.
 */
const queryMock = vi.hoisted(() => vi.fn());
vi.mock("@/server/db/neon.server", () => ({
  query: queryMock,
  queryOne: vi.fn(),
  transaction: vi.fn(),
}));

import { listTasks } from "../tasks";

const FULL_ROW: Record<string, unknown> = {
  id: "task-1",
  title: "Follow up on renewal",
  description: "Check in before the contract lapses",
  assigned_to: "profile-1",
  lead_id: "lead-1",
  client_id: "client-1",
  contact_id: "contact-1",
  account_id: "account-1",
  deal_id: "deal-1",
  project_id: "project-1",
  due_date: "2026-09-10",
  priority: "high",
  status: "open",
  created_by_agent: null,
  created_at: "2026-09-01T00:00:00.000Z",
};

const CONSUMED_COLUMNS = [
  "id",
  "title",
  "description",
  "assigned_to",
  "account_id",
  "due_date",
  "priority",
  "status",
  "created_by_agent",
];

/**
 * Stands in for Postgres: reads the column list out of the `select` clause and returns only
 * those keys, so the mock cannot accidentally hand back a column the real query never asked
 * for.
 */
function projectRow(sql: string) {
  const match = /select\s+([\s\S]+?)\s+from\s+tasks/i.exec(sql);
  if (!match) throw new Error(`could not find a "select ... from tasks" clause in: ${sql}`);
  if (match[1].trim() === "*") return { ...FULL_ROW };

  const projected: Record<string, unknown> = {};
  for (const column of match[1].split(",").map((entry) => entry.trim())) {
    projected[column] = FULL_ROW[column];
  }
  return projected;
}

describe("listTasks", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryMock.mockImplementation(async (sql: string) => [projectRow(sql)]);
  });

  it("does not select every column", async () => {
    await listTasks({});

    const sql = String(queryMock.mock.calls[0]?.[0] ?? "");
    expect(sql).not.toMatch(/select\s+\*/i);
  });

  it("omits lead_id, which no consumer of the tasks list reads", async () => {
    const [task] = await listTasks({});

    expect(task).not.toHaveProperty("lead_id");
  });

  it("projects every column a consumer actually reads", async () => {
    const [task] = await listTasks({});

    for (const column of CONSUMED_COLUMNS) {
      expect(task).toHaveProperty(column);
    }
  });

  it("still filters and orders without projecting the filter/order columns", async () => {
    await listTasks({ client_id: "client-1", contact_id: "contact-1", deal_id: "deal-1" });

    const sql = String(queryMock.mock.calls[0]?.[0] ?? "").replace(/\s+/g, " ");
    expect(sql).toMatch(/where client_id = \$1 and contact_id = \$2 and deal_id = \$3/);
    expect(sql).toMatch(/order by created_at desc/);
  });
});
