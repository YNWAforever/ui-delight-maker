import { describe, expect, it } from "vitest";
import { buildFilters, buildUpdate } from "../query-builders";

describe("query-builders", () => {
  it("builds numbered equality filters from defined values", () => {
    const filters = buildFilters(
      [
        ["status", "qualified"],
        ["assigned_to", undefined],
        ["lead_id", "lead-1"],
      ],
      1,
    );

    expect(filters.sql).toBe(" where status = $1 and lead_id = $2");
    expect(filters.values).toEqual(["qualified", "lead-1"]);
    expect(filters.nextIndex).toBe(3);
  });

  it("builds update assignments from allowed defined values", () => {
    const update = buildUpdate(
      { status: "won", assigned_to: undefined, lead_score: 88, ignored: "no" },
      ["status", "assigned_to", "lead_score"],
      2,
    );

    expect(update.sql).toBe("status = $2, lead_score = $3");
    expect(update.values).toEqual(["won", 88]);
    expect(update.nextIndex).toBe(4);
  });

  it("throws when an update has no allowed defined values", () => {
    const updates = { ignored: "no", status: undefined as string | undefined };
    expect(() => buildUpdate(updates, ["status"], 1)).toThrow(
      "No allowed update fields were provided",
    );
  });
});
