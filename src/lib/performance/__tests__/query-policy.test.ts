import { describe, expect, it } from "vitest";
import { AdminError } from "../../admin/errors";
import {
  createAppQueryClient,
  CRM_GC_TIME_MS,
  CRM_STALE_TIME_MS,
  shouldRetryRead,
} from "../query-policy";

describe("shared CRM query policy", () => {
  it("uses the approved freshness and retention windows", () => {
    const client = createAppQueryClient();

    expect(CRM_STALE_TIME_MS).toBe(30_000);
    expect(CRM_GC_TIME_MS).toBe(300_000);
    expect(client.getDefaultOptions().queries?.staleTime).toBe(30_000);
    expect(client.getDefaultOptions().queries?.gcTime).toBe(300_000);
  });

  it("retries only recognized transient read failures once", () => {
    expect(shouldRetryRead(0, { status: 503 })).toBe(true);
    expect(shouldRetryRead(0, new TypeError("network failed"))).toBe(true);
    expect(
      shouldRetryRead(0, Object.assign(new Error("connection reset"), { code: "ECONNRESET" })),
    ).toBe(true);
    expect(shouldRetryRead(1, { status: 503 })).toBe(false);
  });

  it("does not retry authorization, scope, validation, or unknown errors", () => {
    expect(shouldRetryRead(0, { status: 401 })).toBe(false);
    expect(shouldRetryRead(0, { status: 422 })).toBe(false);
    expect(shouldRetryRead(0, new AdminError("FORBIDDEN", "forbidden"))).toBe(false);
    expect(shouldRetryRead(0, new AdminError("OUTSIDE_SCOPE", "outside scope"))).toBe(false);
    expect(shouldRetryRead(0, new Error("validation failed"))).toBe(false);
    expect(shouldRetryRead(0, {})).toBe(false);
  });
});
