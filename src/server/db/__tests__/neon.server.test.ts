import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const connectMock = vi.fn();

vi.mock("@neondatabase/serverless", () => ({
  Pool: vi.fn().mockImplementation(function Pool() {
    return {
      query: queryMock,
      connect: connectMock,
    };
  }),
}));

describe("Neon database query helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    queryMock.mockReset();
    connectMock.mockReset();
    process.env.DATABASE_URL = "postgres://user@localhost:5432/clientops";
  });

  it("normalizes Date values from query rows before returning them to the app", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: "lead-1",
          created_at: new Date("2026-07-05T08:47:58.000Z"),
          metadata: {
            last_seen_at: new Date("2026-07-01T12:00:00.000Z"),
          },
          events: [new Date("2026-07-02T09:30:00.000Z")],
        },
      ],
    });

    const { query } = await import("../neon.server");

    const rows = await query<{
      id: string;
      created_at: unknown;
      metadata: { last_seen_at: unknown };
      events: unknown[];
    }>("select * from leads");

    expect(rows[0]).toEqual({
      id: "lead-1",
      created_at: "2026-07-05T08:47:58.000Z",
      metadata: {
        last_seen_at: "2026-07-01T12:00:00.000Z",
      },
      events: ["2026-07-02T09:30:00.000Z"],
    });
  });

  it("normalizes Date values returned through transaction clients", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: "task-1", due_date: new Date("2026-07-12T00:00:00.000Z") }],
        })
        .mockResolvedValueOnce({ rows: [] }),
      release: vi.fn(),
    };
    connectMock.mockResolvedValueOnce(client);

    const { transaction } = await import("../neon.server");

    const task = await transaction(async (db) => {
      const result = await db.query<{ id: string; due_date: unknown }>(
        "select * from tasks limit 1",
      );
      return result.rows[0];
    });

    expect(task).toEqual({ id: "task-1", due_date: "2026-07-12T00:00:00.000Z" });
  });
});
