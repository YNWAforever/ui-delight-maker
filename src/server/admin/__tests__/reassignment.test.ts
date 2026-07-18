import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminError } from "@/lib/admin/errors";
import type { Queryable } from "@/server/db/neon.server";
import type { ReassignmentDependencies } from "../reassignment.server";
import {
  REASSIGNMENT_BUCKETS,
  createReassignmentService,
  type ReassignmentInventory,
} from "../reassignment.server";

type ProfileRow = {
  id: string;
  role: string;
  status: string;
  email?: string;
};

const target: ProfileRow = {
  id: "target",
  role: "sales",
  status: "active",
  email: "target@example.com",
};

function inventoryWithCounts(counts: Record<string, number>): ReassignmentInventory {
  const buckets = REASSIGNMENT_BUCKETS.map((bucket) => ({
    ...bucket,
    count: counts[bucket.key] ?? 0,
  }));
  return {
    profileId: "target",
    buckets,
    totalCount: buckets.reduce((sum, bucket) => sum + bucket.count, 0),
  };
}

function makeHarness(
  options: {
    target?: ProfileRow;
    counts?: Record<string, number>;
    successors?: Array<{ id: string; status: string }>;
    activeSuperAdmins?: Array<{ id: string }>;
  } = {},
) {
  const currentTarget = options.target ?? target;
  const counts = options.counts ?? {};
  const dbQueryImpl = async <T = unknown>(
    sql: string,
    _values: readonly unknown[] = [],
  ): Promise<{ rows: T[] }> => {
    if (sql.includes("from profiles where id = $1 for update")) {
      return { rows: (currentTarget ? [currentTarget] : []) as unknown as T[] };
    }
    if (sql.includes("select id from profiles where role = 'super_admin'")) {
      return {
        rows: (options.activeSuperAdmins ?? [
          { id: "super-admin-1" },
          { id: "super-admin-2" },
        ]) as unknown as T[],
      };
    }
    if (sql.includes("select id, status from profiles where id = any")) {
      return {
        rows: (options.successors ?? [{ id: "successor", status: "active" }]) as unknown as T[],
      };
    }
    if (sql.startsWith("select count(*)")) {
      const tableMatch = sql.match(/from ([a-z_]+) where ([a-z_]+) =/);
      const key = tableMatch ? tableMatch[1] + "." + tableMatch[2] : "";
      return { rows: [{ count: counts[key] ?? 0 }] as unknown as T[] };
    }
    if (sql.startsWith("update profiles")) {
      return { rows: [{ ...currentTarget, status: "deactivated" }] as unknown as T[] };
    }
    return { rows: [] };
  };
  const dbQuery = vi.fn().mockImplementation(dbQueryImpl);
  const queryImpl = async <T = unknown>(
    sql: string,
    values: readonly unknown[] = [],
    db?: Queryable,
  ): Promise<T[]> => {
    const result = db ? await db.query<T>(sql, values) : await dbQueryImpl<T>(sql, values);
    return result.rows;
  };
  const query = vi.fn().mockImplementation(queryImpl);
  const typedQuery = query as unknown as NonNullable<ReassignmentDependencies["query"]>;
  const transactionImpl = async <T>(work: (db: Queryable) => Promise<T>): Promise<T> =>
    work({ query: dbQuery as unknown as Queryable["query"] });
  const transaction = vi.fn().mockImplementation(transactionImpl);
  const typedTransaction = transaction as unknown as NonNullable<
    ReassignmentDependencies["transaction"]
  >;

  return {
    dbQuery,
    query,
    transaction,
    service: createReassignmentService({ query: typedQuery, transaction: typedTransaction }),
  };
}

describe("reassignment service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("counts every supported mutable ownership bucket", async () => {
    const { service, query } = makeHarness({
      counts: {
        "leads.assigned_to": 2,
        "tasks.assigned_to": 3,
        "human_approvals.assigned_to": 1,
        "clients.account_owner": 4,
        "accounts.account_owner": 5,
        "accounts.cs_owner": 6,
        "engagements.owner": 7,
        "campaigns.owner": 8,
        "job_sheets.sales_owner": 9,
        "job_sheets.accounting_owner": 10,
      },
    });

    const result = await service.getReassignmentInventory("target");

    expect(result.buckets.map((bucket) => bucket.key)).toEqual(
      REASSIGNMENT_BUCKETS.map((bucket) => bucket.key),
    );
    expect(result.totalCount).toBe(55);
    expect(query).toHaveBeenCalledTimes(REASSIGNMENT_BUCKETS.length);
  });

  it("rejects deactivation when open ownership has no successor", async () => {
    const { service } = makeHarness({ counts: { "leads.assigned_to": 2 } });
    const reviewedInventory = inventoryWithCounts({ "leads.assigned_to": 2 });

    await expect(
      service.deactivateUserWithReassignment(
        { profileId: "target", reason: "Planned departure", reviewedInventory, successors: {} },
        "admin-1",
      ),
    ).rejects.toMatchObject({ code: "OPEN_WORK_REMAINS" });
  });

  it("rejects inactive successors before changing any record", async () => {
    const { service, dbQuery } = makeHarness({
      counts: { "leads.assigned_to": 2 },
      successors: [{ id: "successor", status: "suspended" }],
    });
    const reviewedInventory = inventoryWithCounts({ "leads.assigned_to": 2 });

    await expect(
      service.deactivateUserWithReassignment(
        {
          profileId: "target",
          reason: "Planned departure",
          reviewedInventory,
          successors: { "leads.assigned_to": "successor" },
        },
        "admin-1",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    expect(dbQuery.mock.calls.some(([sql]) => sql.startsWith("update "))).toBe(false);
  });

  it("rejects stale inventory after locking the target profile", async () => {
    const { service } = makeHarness({ counts: { "leads.assigned_to": 1 } });
    const reviewedInventory = inventoryWithCounts({ "leads.assigned_to": 0 });

    await expect(
      service.deactivateUserWithReassignment(
        {
          profileId: "target",
          reason: "Planned departure",
          reviewedInventory,
          successors: { "leads.assigned_to": "successor" },
        },
        "admin-1",
      ),
    ).rejects.toMatchObject({ code: "STALE_ADMIN_STATE" });
  });

  it("reassigns every mutable bucket, revokes sessions, and writes one audit event", async () => {
    const counts = Object.fromEntries(REASSIGNMENT_BUCKETS.map((bucket) => [bucket.key, 1]));
    const { service, dbQuery } = makeHarness({ counts });
    const reviewedInventory = inventoryWithCounts(counts);
    const successors = Object.fromEntries(
      REASSIGNMENT_BUCKETS.map((bucket) => [bucket.key, "successor"]),
    );

    await service.deactivateUserWithReassignment(
      { profileId: "target", reason: "Planned departure", reviewedInventory, successors },
      "admin-1",
    );

    const sqls = dbQuery.mock.calls.map(([sql]) => sql);
    expect(sqls.filter((sql) => sql.startsWith("update leads"))).toHaveLength(1);
    expect(sqls.filter((sql) => sql.startsWith("update tasks"))).toHaveLength(1);
    expect(sqls.filter((sql) => sql.startsWith("update human_approvals"))).toHaveLength(1);
    expect(sqls.filter((sql) => sql.startsWith("update clients"))).toHaveLength(1);
    expect(sqls.filter((sql) => sql.startsWith("update accounts"))).toHaveLength(2);
    expect(sqls.filter((sql) => sql.startsWith("update engagements"))).toHaveLength(1);
    expect(sqls.filter((sql) => sql.startsWith("update campaigns"))).toHaveLength(1);
    expect(sqls.filter((sql) => sql.startsWith("update job_sheets"))).toHaveLength(2);
    expect(sqls.filter((sql) => sql.startsWith("update profiles"))).toHaveLength(1);
    expect(sqls.filter((sql) => sql.includes("insert into admin_audit_logs"))).toHaveLength(1);
  });

  it("protects the final active Super Admin", async () => {
    const { service } = makeHarness({
      target: { ...target, role: "super_admin" },
      activeSuperAdmins: [{ id: "target" }],
    });
    const reviewedInventory = inventoryWithCounts({});

    await expect(
      service.deactivateUserWithReassignment(
        { profileId: "target", reason: "Planned departure", reviewedInventory, successors: {} },
        "admin-1",
      ),
    ).rejects.toMatchObject({ code: "LAST_SUPER_ADMIN" });
  });
});
