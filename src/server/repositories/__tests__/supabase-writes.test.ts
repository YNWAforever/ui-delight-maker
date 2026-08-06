import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pickColumns, supabaseOperationFailed } from "@/server/repositories/supabase-writes";

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

describe("supabaseOperationFailed", () => {
  it("says what failed without quoting the driver", () => {
    const error = supabaseOperationFailed("create this deal", {
      message: 'null value in column "name" of relation "deals" violates not-null constraint',
    });

    expect(error.message).toBe("Could not create this deal");
    expect(error.message).not.toContain("deals");
    expect(error.message).not.toContain("null value");
  });

  it("keeps the driver's text on the cause, for logs", () => {
    const error = supabaseOperationFailed("load deals", { message: "permission denied" });

    expect((error.cause as Error).message).toBe("permission denied");
  });
});

/**
 * The Supabase repositories used to throw `new Error(error.message)`, handing PostgREST's text —
 * which names the table and column it failed on — straight to the caller. This is the same class
 * of leak as the stack traces that used to come out of the Vercel handler, and `postgres-error.ts`
 * already calls its Neon-side equivalent "deliberately vague" for exactly this reason.
 *
 * A lint-shaped check rather than a behavioural one, because the property is "no site anywhere in
 * these files does this", which no single call can demonstrate.
 */
describe("no Supabase repository leaks the driver message", () => {
  const repositories = new URL("..", import.meta.url);
  const supabaseBacked = readdirSync(repositories)
    .filter((file) => file.endsWith(".ts"))
    .filter((file) =>
      readFileSync(new URL(file, repositories), "utf8").includes("createSupabaseServerClient"),
    );

  it("covers every Supabase-backed repository", () => {
    // Guards the guard: an empty list would make the check below vacuous.
    expect(supabaseBacked.sort()).toEqual([
      "automation-playbooks.ts",
      "customer-success.ts",
      "deals.ts",
      "engagement-events.ts",
      "projects.ts",
    ]);
  });

  it.each(supabaseBacked)("%s throws no raw driver message", (file) => {
    const source = readFileSync(new URL(file, repositories), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n]*/g, " ");

    expect(source).not.toMatch(/throw new Error\(\s*\w*[Ee]rror\??\.message/);
  });
});
