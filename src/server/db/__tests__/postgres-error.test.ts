import { describe, expect, it } from "vitest";
import { isPostgresError } from "../postgres-error";

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
