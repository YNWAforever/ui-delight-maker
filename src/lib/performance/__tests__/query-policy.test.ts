import { describe, expect, it } from "vitest";
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

  it("retries one transient read but never authorization or validation errors", () => {
    expect(shouldRetryRead(0, { status: 503 })).toBe(true);
    expect(shouldRetryRead(1, { status: 503 })).toBe(false);
    expect(shouldRetryRead(0, { status: 401 })).toBe(false);
    expect(shouldRetryRead(0, { status: 422 })).toBe(false);
  });
});
