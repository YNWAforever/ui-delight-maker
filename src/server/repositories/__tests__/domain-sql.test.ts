import { describe, expect, it } from "vitest";
import { pickColumns, domainOperationFailed } from "@/server/repositories/domain-sql";

describe("pickColumns", () => {
  it("keeps the allowed keys that were provided", () => {
    expect(pickColumns({ name: "Renewal", stage: "won" }, ["name", "stage"])).toEqual({
      name: "Renewal",
      stage: "won",
    });
  });

  it("drops keys outside the allowlist", () => {
    // The point of the whole helper: these repositories validate with a bare `as` cast, so the
    // input object is whatever arrived over the wire.
    const picked = pickColumns(
      { name: "Renewal", id: "chosen-by-caller", is_admin: true } as Record<string, unknown>,
      ["name"],
    );

    expect(picked).toEqual({ name: "Renewal" });
  });

  it("treats an explicit null as a value and an absent key as absent", () => {
    // Matches the `!== undefined` semantics the update paths always had: null clears a column,
    // undefined leaves it alone. Collapsing the two would wipe columns on partial writes.
    const picked = pickColumns({ owner: null, stage: undefined }, ["owner", "stage"]);

    expect(picked).toEqual({ owner: null });
    expect("stage" in picked).toBe(false);
  });

  it("returns an empty object when nothing allowed was provided", () => {
    expect(pickColumns({ unrelated: 1 } as Record<string, unknown>, ["name"])).toEqual({});
  });

  it("does not mutate its input", () => {
    const source = { name: "Renewal", extra: true };
    pickColumns(source, ["name"]);
    expect(source).toEqual({ name: "Renewal", extra: true });
  });
});

describe("domainOperationFailed", () => {
  it("says what failed without quoting the driver", () => {
    const error = domainOperationFailed("create this deal", {
      message: 'null value in column "name" of relation "deals" violates not-null constraint',
    });

    expect(error.message).toBe("Could not create this deal");
    expect(error.message).not.toContain("deals");
    expect(error.message).not.toContain("null value");
  });

  it("keeps the driver's text on the cause, for logs", () => {
    const error = domainOperationFailed("load deals", new Error("permission denied"));

    expect((error.cause as Error).message).toBe("permission denied");
  });
});
