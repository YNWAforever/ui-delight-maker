import { describe, expect, it } from "vitest";
import { toCompanyWorkspaceError } from "../errors";

describe("toCompanyWorkspaceError", () => {
  it("classifies PostgreSQL type mismatches without leaking SQL", () => {
    const error = Object.assign(
      new Error("operator does not exist: text = uuid select * from activity_logs"),
      { code: "42883" },
    );
    const result = toCompanyWorkspaceError(error, "activity", "request-1");

    expect(result).toEqual({
      code: "schema_mismatch",
      requestId: "request-1",
      retryable: false,
      section: "activity",
    });
    expect(JSON.stringify(result)).not.toContain("activity_logs");
  });

  it("marks connection timeouts retryable", () => {
    const error = Object.assign(new Error("timeout"), { code: "ETIMEDOUT" });
    expect(toCompanyWorkspaceError(error, "commercial", "request-2")).toMatchObject({
      code: "query_timeout",
      retryable: true,
      section: "commercial",
    });
  });
});
