import { describe, expect, it, vi } from "vitest";
import type { Queryable } from "@/server/db/neon.server";
import {
  createInvitationRepository,
  hashInvitationToken,
  normalizeInvitationEmail,
} from "../admin-invitations";

function fakeDatabase(
  rowsByQuery: unknown[][] = [],
): Queryable & { calls: string[]; values: unknown[][] } {
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

describe("admin invitation repository", () => {
  it("normalizes emails and stores only a SHA-256 token hash", async () => {
    const db = fakeDatabase([
      [],
      [],
      [
        {
          id: "invite-1",
          email: "person@example.com",
          token_hash: hashInvitationToken("raw-token"),
          intended_role: "sales",
          primary_department_id: null,
          manager_profile_id: null,
          initial_team_ids: [],
          status: "pending",
          invited_by: "actor-1",
          expires_at: "2026-07-23T00:00:00.000Z",
          accepted_at: null,
          accepted_profile_id: null,
          revoked_at: null,
          revoked_by: null,
          created_at: "2026-07-16T00:00:00.000Z",
          updated_at: "2026-07-16T00:00:00.000Z",
        },
      ],
    ]);
    const repo = createInvitationRepository({
      transaction: async (work) => work(db),
      randomToken: () => "raw-token",
      now: () => new Date("2026-07-16T00:00:00.000Z"),
    });

    const result = await repo.createInvitation(
      {
        email: "  Person@Example.COM ",
        intendedRole: "sales",
        initialTeamIds: [],
      },
      "actor-1",
    );

    expect(result.rawToken).toBe("raw-token");
    expect(db.values.flat()).not.toContain("raw-token");
    expect(db.values.flat()).toContain(hashInvitationToken("raw-token"));
    expect(db.values.flat()).toContain("person@example.com");
    expect(db.values.flat()).toContain("2026-07-23T00:00:00.000Z");
    expect(normalizeInvitationEmail(" Person@Example.COM ")).toBe("person@example.com");
  });

  it("rejects a second pending invitation for the normalized email", async () => {
    const db = fakeDatabase([[], [{ id: "existing" }]]);
    const repo = createInvitationRepository({ transaction: async (work) => work(db) });

    await expect(
      repo.createInvitation(
        { email: "USER@example.com", intendedRole: "admin", initialTeamIds: [] },
        "actor-1",
      ),
    ).rejects.toThrow("pending invitation already exists");
    expect(db.calls[0]).toContain("user_invitations");
  });

  it("previews only safe pending invitation fields and supports revoke", async () => {
    const db = fakeDatabase([
      [
        {
          id: "invite-1",
          email: "person@example.com",
          intended_role: "sales",
          expires_at: "2026-07-23T00:00:00.000Z",
          status: "pending",
        },
      ],
      [{ id: "invite-1", status: "revoked" }],
    ]);
    const repo = createInvitationRepository({ transaction: async (work) => work(db) });

    await expect(repo.getInvitationPreview("raw-token")).resolves.toEqual({
      email: "person@example.com",
      intendedRole: "sales",
      expiresAt: "2026-07-23T00:00:00.000Z",
      status: "pending",
    });
    await expect(repo.revokeInvitation("invite-1", "actor-1")).resolves.toMatchObject({
      status: "revoked",
    });
    expect(db.values.flat()).not.toContain("raw-token");
  });

  it("accepts once, matches identity email, activates the profile, memberships, and audit atomically", async () => {
    const profile = {
      id: "profile-1",
      email: "person@example.com",
      role: "sales",
      status: "active",
    };
    const db = fakeDatabase([
      [
        {
          id: "invite-1",
          email: "person@example.com",
          intended_role: "sales",
          primary_department_id: "dept-1",
          manager_profile_id: "manager-1",
          initial_team_ids: ["team-1", "team-2"],
          status: "pending",
          expires_at: "2026-07-23T00:00:00.000Z",
        },
      ],
      [profile],
      [{ id: "membership-1" }, { id: "membership-2" }],
      [{ id: "invite-1", status: "accepted" }],
      [{ id: "audit-1" }],
    ]);
    const transaction = vi.fn(async (work: (db: Queryable) => Promise<unknown>) => work(db));
    const repo = createInvitationRepository({ transaction });

    await expect(
      repo.acceptInvitation("raw-token", { id: "profile-1", email: "PERSON@example.com" }),
    ).resolves.toMatchObject(profile);
    expect(transaction).toHaveBeenCalledOnce();
    expect(db.calls[0].toLowerCase()).toContain("for update");
    expect(db.calls.some((sql) => sql.toLowerCase().includes("team_memberships"))).toBe(true);
    expect(db.calls.some((sql) => sql.toLowerCase().includes("admin_audit_logs"))).toBe(true);
    expect(db.values.flat()).not.toContain("raw-token");
    expect(db.values.flat()).toContain(hashInvitationToken("raw-token"));
  });

  it("rejects a mismatched email and already accepted invitation", async () => {
    const mismatchDb = fakeDatabase([
      [
        {
          id: "invite-1",
          email: "person@example.com",
          status: "pending",
          expires_at: "2026-07-23T00:00:00.000Z",
        },
      ],
    ]);
    const repo = createInvitationRepository({ transaction: async (work) => work(mismatchDb) });
    await expect(
      repo.acceptInvitation("raw-token", { id: "profile-1", email: "other@example.com" }),
    ).rejects.toThrow("Invitation email does not match");

    const acceptedDb = fakeDatabase([
      [
        {
          id: "invite-1",
          email: "person@example.com",
          status: "accepted",
          expires_at: "2026-07-23T00:00:00.000Z",
        },
      ],
    ]);
    const acceptedRepo = createInvitationRepository({
      transaction: async (work) => work(acceptedDb),
    });
    await expect(
      acceptedRepo.acceptInvitation("raw-token", { id: "profile-1", email: "person@example.com" }),
    ).rejects.toThrow("Invitation is no longer available");
  });

  it.each([
    ["revoked", "2026-07-23T00:00:00.000Z", "Invitation is no longer available"],
    ["pending", "2026-07-15T23:59:59.000Z", "Invitation has expired"],
  ])("rejects %s invitations", async (status, expiresAt, message) => {
    const db = fakeDatabase([
      [
        {
          id: "invite-1",
          email: "person@example.com",
          status,
          expires_at: expiresAt,
        },
      ],
    ]);
    const repo = createInvitationRepository({
      transaction: async (work) => work(db),
      now: () => new Date("2026-07-16T00:00:00.000Z"),
    });

    await expect(
      repo.acceptInvitation("raw-token", {
        id: "profile-1",
        email: "person@example.com",
      }),
    ).rejects.toThrow(message);
  });
});
