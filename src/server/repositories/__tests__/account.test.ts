import { describe, expect, it, vi } from "vitest";
import type { Queryable } from "@/server/db/neon.server";
import { createAccountRepository } from "../account";

function fakeDatabase(rowsByQuery: unknown[][] = []): Queryable & {
  calls: string[];
  values: unknown[][];
} {
  const calls: string[] = [];
  const values: unknown[][] = [];
  return {
    calls,
    values,
    async query<T>(text: string, queryValues: readonly unknown[] = []) {
      calls.push(text);
      values.push([...queryValues]);
      return { rows: (rowsByQuery.shift() ?? []) as T[] };
    },
  };
}

const beforeProfile = {
  id: "profile-1",
  name: "Person",
  job_title: "Account Executive",
  phone: "+852 1234 5678",
  avatar_url: null,
  locale: "en-HK",
  timezone: "Asia/Hong_Kong",
  role: "sales",
  status: "active",
  password_hash: "plain-password",
};

describe("account repository", () => {
  it("updates only self-service profile fields and redacts audit snapshots", async () => {
    const db = fakeDatabase([
      [beforeProfile],
      [{ ...beforeProfile, name: "Updated Person", phone: null }],
      [],
    ]);
    const repo = createAccountRepository({
      transaction: async <T>(work: (client: Queryable) => Promise<T>) => work(db),
    });

    await expect(
      repo.updateMyProfile(
        "profile-1",
        {
          name: " Updated Person ",
          phone: "",
          locale: "en-HK",
          timezone: "Asia/Hong_Kong",
        },
        "profile-1",
      ),
    ).resolves.toMatchObject({ name: "Updated Person" });

    expect(db.calls[1]).toContain("name = $2");
    expect(db.calls[1]).not.toContain("role");
    expect(db.values[1]).toEqual([
      "profile-1",
      "Updated Person",
      null,
      "Account Executive",
      null,
      "en-HK",
      "Asia/Hong_Kong",
    ]);
    expect(db.values[2]?.some((value) => String(value).includes("plain-password"))).toBe(false);
    expect(db.values[2]?.some((value) => String(value).includes("[REDACTED]"))).toBe(true);
  });

  it("prevents a user from cancelling a delegation they did not create", async () => {
    const db = fakeDatabase([
      [
        {
          id: "delegation-1",
          delegator_profile_id: "profile-2",
          delegate_profile_id: "profile-1",
          status: "active",
        },
      ],
    ]);
    const repo = createAccountRepository({
      transaction: async <T>(work: (client: Queryable) => Promise<T>) => work(db),
    });

    await expect(repo.cancelMyDelegation("delegation-1", "profile-1", "profile-1")).rejects.toThrow(
      "own delegations",
    );
    expect(db.calls).toHaveLength(1);
  });

  it("lists only delegations involving the current profile", async () => {
    const query = vi.fn().mockResolvedValue([
      {
        id: "delegation-1",
        delegator_profile_id: "profile-1",
        delegate_profile_id: "profile-2",
        starts_at: "2026-07-20T00:00:00.000Z",
        ends_at: "2026-07-21T00:00:00.000Z",
        reason: "Annual leave coverage",
        status: "active",
        created_at: "2026-07-18T00:00:00.000Z",
      },
    ]);
    const repo = createAccountRepository({ query });

    await expect(repo.listMyDelegations("profile-1")).resolves.toMatchObject([
      { id: "delegation-1", delegatorProfileId: "profile-1" },
    ]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("delegator_profile_id = $1 or delegate_profile_id = $1"),
      ["profile-1"],
    );
  });
});
