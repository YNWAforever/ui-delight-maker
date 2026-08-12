import { describe, expect, it } from "vitest";
import {
  readMeasurementEnv,
  verdictFor,
} from "../../../scripts/clientops/measure-supabase-surface";

/**
 * Phase 0's whole value is that its answers can be acted on, and two of the outcomes it reports
 * — "DISJOINT" and "no rows, delete the code" — authorise deleting application code. Both were
 * being stated from a 500-row sample as though they described the whole table.
 */
describe("verdictFor", () => {
  it("reports an empty table as safe to migrate by deletion", () => {
    expect(verdictFor({ sampled: 0, alsoInNeon: 0, complete: true })).toContain(
      "no rows in Supabase",
    );
  });

  it("states SAME SET only when the sample covered the whole table", () => {
    expect(verdictFor({ sampled: 120, alsoInNeon: 120, complete: true })).toMatch(
      /^SAME SET \(120\/120\)/,
    );
  });

  it("downgrades a full-overlap sample to a hedge when rows were left unread", () => {
    // 500 of 20,000 rows all present in Neon says nothing about the other 19,500.
    const verdict = verdictFor({ sampled: 500, alsoInNeon: 500, complete: false });

    expect(verdict).not.toMatch(/^SAME SET/);
    expect(verdict).toContain("CONSISTENT WITH SAME SET");
    expect(verdict).toContain("500");
    expect(verdict).toContain("re-run with a larger SAMPLE");
  });

  it("states DISJOINT only when the sample covered the whole table", () => {
    expect(verdictFor({ sampled: 40, alsoInNeon: 0, complete: true })).toMatch(
      /^DISJOINT \(0\/40\)/,
    );
  });

  it("downgrades a zero-overlap sample, because that one licenses deleting code", () => {
    const verdict = verdictFor({ sampled: 500, alsoInNeon: 0, complete: false });

    expect(verdict).not.toMatch(/^DISJOINT/);
    expect(verdict).toContain("CONSISTENT WITH DISJOINT");
    expect(verdict).toContain("before acting on this");
  });

  it("carries the denominator on a partial overlap either way", () => {
    expect(verdictFor({ sampled: 500, alsoInNeon: 120, complete: false })).toContain("(120/500");
    expect(verdictFor({ sampled: 500, alsoInNeon: 120, complete: true })).toContain("(120/500");
  });

  it("never states a set-level verdict without its counts", () => {
    // A reader scanning the stderr summary sees only this string, so every one of them has to
    // carry enough to tell a census from a sample.
    for (const complete of [true, false]) {
      for (const [sampled, alsoInNeon] of [
        [500, 500],
        [500, 0],
        [500, 250],
        [1, 1],
      ]) {
        expect(verdictFor({ sampled, alsoInNeon, complete })).toMatch(/\(\d+\/\d+/);
      }
    }
  });
});

describe("readMeasurementEnv", () => {
  const complete = {
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    DATABASE_URL: "postgres://user@example/neondb",
  };

  it("returns the three values the run needs", () => {
    expect(readMeasurementEnv(complete)).toEqual({
      supabaseUrl: complete.SUPABASE_URL,
      serviceRoleKey: complete.SUPABASE_SERVICE_ROLE_KEY,
      databaseUrl: complete.DATABASE_URL,
    });
  });

  it("refuses to run without the service-role key, and says why", () => {
    // Under RLS the anon key reports 0 rows for tables that are not empty, and "0 rows" is the
    // one wrong answer that licenses deleting the code.
    expect(() => readMeasurementEnv({ ...complete, SUPABASE_SERVICE_ROLE_KEY: undefined })).toThrow(
      /anon key is not sufficient/,
    );
  });

  it("refuses to run without a Supabase URL", () => {
    expect(() => readMeasurementEnv({ ...complete, SUPABASE_URL: undefined })).toThrow(
      /SUPABASE_URL/,
    );
  });

  it("refuses to run without the Neon connection it compares against", () => {
    expect(() => readMeasurementEnv({ ...complete, DATABASE_URL: undefined })).toThrow(
      /DATABASE_URL is required/,
    );
  });
});
