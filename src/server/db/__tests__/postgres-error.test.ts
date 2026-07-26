import { describe, expect, it } from "vitest";
import { classifyDatabaseFailure, isPostgresError } from "../postgres-error";

describe("isPostgresError", () => {
  it("identifies the undefined_column error that broke /relationships", () => {
    const error = Object.assign(new Error("column a.health_score does not exist"), {
      code: "42703",
    });
    expect(isPostgresError(error)).toBe(true);
  });

  it("identifies the indeterminate_datatype error that broke /renewals", () => {
    const error = Object.assign(new Error("could not determine data type of parameter $1"), {
      code: "42P18",
    });
    expect(isPostgresError(error)).toBe(true);
  });

  it("does not flag an application error", () => {
    expect(isPostgresError(new Error("Account not found"))).toBe(false);
  });

  it("does not flag a non-SQLSTATE code", () => {
    expect(isPostgresError(Object.assign(new Error("boom"), { code: "ENOTFOUND" }))).toBe(false);
  });

  it("does not flag non-errors", () => {
    expect(isPostgresError(null)).toBe(false);
    expect(isPostgresError("42703")).toBe(false);
  });
});

function coded(code: string) {
  return Object.assign(new Error(`failed: ${code}`), { code });
}

describe("classifyDatabaseFailure", () => {
  it("calls a schema mismatch permanent", () => {
    // Both codes that caused a production outage. Retrying either re-runs the same broken
    // SQL, so `retryable` here is the difference between a terminal panel and a retry loop.
    for (const code of ["42703", "42P18", "42P01", "42883"]) {
      expect(classifyDatabaseFailure(coded(code)), code).toEqual({
        kind: "schema_mismatch",
        retryable: false,
      });
    }
  });

  it("calls a dropped connection or a lock collision retryable", () => {
    for (const code of ["ETIMEDOUT", "ECONNRESET", "08006", "40001", "40P01", "57P03"]) {
      expect(classifyDatabaseFailure(coded(code)), code).toEqual({
        kind: "query_timeout",
        retryable: true,
      });
    }
  });

  it("never calls a SQLSTATE class 42 code retryable, listed or not", () => {
    // 42501 is insufficient_privilege — a class 42 code deliberately absent from the
    // schema-mismatch list. It must still come back permanent rather than falling through to
    // whatever the default happens to be.
    expect(classifyDatabaseFailure(coded("42501"))).toEqual({
      kind: "query_failed",
      retryable: false,
    });
    expect(classifyDatabaseFailure(coded("42P07"))).toEqual({
      kind: "query_failed",
      retryable: false,
    });
  });

  it("stays vague about anything it does not recognise", () => {
    // The driver message routinely quotes the failing SQL, so an unrecognised failure must
    // not be given a specific label that implies the message is safe to surface.
    expect(classifyDatabaseFailure(coded("XX000"))).toEqual({
      kind: "query_failed",
      retryable: false,
    });
    expect(classifyDatabaseFailure(new Error("no code at all"))).toEqual({
      kind: "query_failed",
      retryable: false,
    });
    expect(classifyDatabaseFailure("not an error")).toEqual({
      kind: "query_failed",
      retryable: false,
    });
  });
});
