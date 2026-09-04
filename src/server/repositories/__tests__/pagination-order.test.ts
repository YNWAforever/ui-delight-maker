import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Keyset-stable ordering for every paginated list.
 *
 * A page query whose ORDER BY is not total can return the same row on two pages and skip
 * another entirely, because Postgres is free to break ties differently between the page-1 and
 * page-2 executions. Every such query therefore has to end in a unique column.
 *
 * This drives each repository function and inspects the SQL it actually emits. The previous
 * version read the repository file off disk and matched
 * `/listLeadsPage[\s\S]*order by created_at desc, id desc/` — with `[\s\S]*` spanning the rest
 * of the file, so deleting the tie-breaker from `listLeadsPage` still passed as long as any
 * later query in the same file happened to have one.
 */
const queryMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/db/neon.server", () => ({
  query: queryMock,
  queryOne: vi.fn(async () => null),
  transaction: vi.fn(),
}));

import { listAccountsPage } from "@/server/repositories/accounts";
import { listClientsPage } from "@/server/repositories/clients";
import { listLeadsPage } from "@/server/repositories/leads";
import { listCampaignsPage } from "@/server/repositories/campaigns";
import { listQuotesPage } from "@/server/repositories/quotes";
import { listJobSheetsPage } from "@/server/repositories/job-sheets";

/** SQL the repository sent, normalised to single spaces so formatting is not under test. */
function emittedStatements() {
  return queryMock.mock.calls.map(([text]) => String(text).replace(/\s+/g, " ").trim());
}

/**
 * The statement that reads the page, as opposed to the `count(*)` companion — identified by
 * carrying both `limit` and `offset`.
 */
function pageStatement() {
  const statements = emittedStatements().filter(
    (sql) => /\blimit\b/i.test(sql) && /\boffset\b/i.test(sql),
  );
  expect(statements, "expected exactly one paged select").toHaveLength(1);
  return statements[0]!;
}

const CASES: Array<{ name: string; run: () => Promise<unknown>; tieBreaker: RegExp }> = [
  {
    name: "accounts",
    run: () => listAccountsPage({}),
    tieBreaker: /order by coalesce\(last_activity_at, created_at\) desc, id desc/i,
  },
  {
    name: "clients",
    run: () => listClientsPage({}),
    tieBreaker: /order by c\.company_name, c\.id desc/i,
  },
  { name: "leads", run: () => listLeadsPage({}), tieBreaker: /order by created_at desc, id desc/i },
  {
    name: "campaigns",
    run: () => listCampaignsPage({}),
    tieBreaker: /order by created_at desc, id desc/i,
  },
  {
    name: "quotes",
    run: () => listQuotesPage({ searchScope: { leads: true, clients: true } }),
    tieBreaker: /order by q\.created_at desc, q\.id desc/i,
  },
  {
    name: "job sheets",
    run: () => listJobSheetsPage({}),
    tieBreaker: /order by created_at desc, id desc/i,
  },
];

describe("paginated repository ordering", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryMock.mockResolvedValue([]);
  });

  it.each(CASES)("$name page query orders by a unique tie-breaker", async ({ run, tieBreaker }) => {
    await run();
    expect(pageStatement()).toMatch(tieBreaker);
  });

  it.each(CASES)("$name page query is bounded by limit and offset", async ({ run }) => {
    await run();
    // Guards the guard: if a repository ever stopped paging, `pageStatement` would find no
    // statement and the tie-breaker assertion above would fail for the wrong reason.
    expect(pageStatement()).toMatch(/limit \$\d+ offset \$\d+/i);
  });
});
