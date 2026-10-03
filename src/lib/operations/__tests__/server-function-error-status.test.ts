import { describe, expect, it, vi } from "vitest";
import { AdminError } from "@/lib/admin/errors";
import { OperationError } from "../errors";
import {
  serverFunctionErrorStatus,
  withServerFunctionErrorStatus,
} from "../server-function-error-status";

describe("domain HTTP errors before server-function serialization", () => {
  it.each([
    [new AdminError("UNAUTHENTICATED", "Sign in"), 401],
    [new AdminError("FORBIDDEN", "Denied"), 403],
    [new AdminError("OUTSIDE_SCOPE", "Scoped denial"), 403],
    [new AdminError("CONFLICT", "Policy changed"), 409],
    [new AdminError("VALIDATION_FAILED", "Invalid fields"), 400],
    [new OperationError("FORBIDDEN", "Denied"), 403],
    [new OperationError("INVALID_INPUT", "Invalid request"), 400],
    [new OperationError("NOT_FOUND", "Missing"), 404],
    [new OperationError("INVALID_STATE", "Terminal"), 409],
    [new OperationError("CONFLICT", "Version changed"), 409],
  ])(
    "maps resolved domain error to HTTP status while preserving the error envelope",
    async (error, status) => {
      const response = { error, context: {}, result: undefined };
      const setStatus = vi.fn();
      expect(await withServerFunctionErrorStatus(async () => response, setStatus)).toBe(response);
      expect(setStatus).toHaveBeenCalledExactlyOnceWith(status);
      expect(response.error).toBe(error);
    },
  );
  it("sets status for a thrown domain error and rethrows the same instance", async () => {
    const error = new AdminError("FORBIDDEN", "Denied"),
      setStatus = vi.fn();
    await expect(
      withServerFunctionErrorStatus(async () => {
        throw error;
      }, setStatus),
    ).rejects.toBe(error);
    expect(setStatus).toHaveBeenCalledExactlyOnceWith(403);
  });
  it("keeps successful results and never trusts a business result's code/error fields", async () => {
    const setStatus = vi.fn(),
      response = { error: undefined, result: { code: "FORBIDDEN", error: "business text" } };
    expect(await withServerFunctionErrorStatus(async () => response, setStatus)).toBe(response);
    expect(setStatus).not.toHaveBeenCalled();
    expect(serverFunctionErrorStatus({ code: "FORBIDDEN" })).toBeNull();
  });
  it("leaves framework redirects and unrelated exceptions unchanged", async () => {
    const setStatus = vi.fn();
    const redirect = { isRedirect: true, to: "/login/sign-in" };
    expect(
      await withServerFunctionErrorStatus(async () => ({ error: redirect }), setStatus),
    ).toEqual({ error: redirect });
    const error = new Error("unrelated failure");
    await expect(
      withServerFunctionErrorStatus(async () => {
        throw error;
      }, setStatus),
    ).rejects.toBe(error);
    expect(setStatus).not.toHaveBeenCalled();
  });
  it("has no shared response-status state between concurrent requests", async () => {
    const denied = vi.fn(),
      allowed = vi.fn();
    await Promise.all([
      withServerFunctionErrorStatus(
        async () => ({ error: new AdminError("FORBIDDEN", "Denied") }),
        denied,
      ),
      withServerFunctionErrorStatus(async () => ({ error: undefined, result: "allowed" }), allowed),
    ]);
    expect(denied).toHaveBeenCalledExactlyOnceWith(403);
    expect(allowed).not.toHaveBeenCalled();
  });
});
