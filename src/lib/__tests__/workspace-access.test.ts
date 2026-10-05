import { describe, expect, it } from "vitest";

import type { Capability } from "@/lib/admin/types";
import { isPermissionDenial } from "../errors";
import { canOpenWorkspace, workspaceForPath } from "../workspace-access";

describe("workspaceForPath", () => {
  it("names the workspace a nested path belongs to", () => {
    expect(workspaceForPath("/leads")?.title).toBe("Leads");
    expect(workspaceForPath("/leads/0f1e2d3c")?.title).toBe("Leads");
    expect(workspaceForPath("/quotes/new")?.title).toBe("Quotes");
    expect(workspaceForPath("/admin/people")?.title).toBe("Administration");
  });

  it("matches the home page only exactly and does not confuse prefixes", () => {
    expect(workspaceForPath("/")?.title).toBe("Revenue Desk");
    expect(workspaceForPath("/leadsx")).toBeUndefined();
    expect(workspaceForPath("/unknown")).toBeUndefined();
  });
});

describe("canOpenWorkspace", () => {
  // What accounting's effective set looks like for these workspaces: quotes, approvals,
  // job sheets and accounts, but no leads, campaigns or agents (UAT returns 403 for those).
  const accounting: Capability[] = [
    "quotes.view",
    "approvals.view",
    "job_sheets.view",
    "accounts.view",
    "tasks.view",
    "reports.view",
  ];

  it("hides workspaces whose list read the set cannot satisfy", () => {
    expect(canOpenWorkspace("/leads", accounting)).toBe(false);
    expect(canOpenWorkspace("/campaigns", accounting)).toBe(false);
    expect(canOpenWorkspace("/agents", accounting)).toBe(false);
    // AI Review needs both approvals.view and agents.view.
    expect(canOpenWorkspace("/ai-review", accounting)).toBe(false);
  });

  it("keeps workspaces the set can open, and the home page always", () => {
    expect(canOpenWorkspace("/quotes", accounting)).toBe(true);
    expect(canOpenWorkspace("/job-sheets", accounting)).toBe(true);
    expect(canOpenWorkspace("/", accounting)).toBe(true);
  });

  it("shows everything when the capability set could not be loaded", () => {
    // The shell returns [] on failure; an empty sidebar would strand the user.
    expect(canOpenWorkspace("/leads", [])).toBe(true);
    expect(canOpenWorkspace("/agents", [])).toBe(true);
  });
});

describe("isPermissionDenial", () => {
  it("recognises a refusal by its code or status, whatever its class", () => {
    expect(isPermissionDenial(Object.assign(new Error("x"), { code: "FORBIDDEN" }))).toBe(true);
    expect(isPermissionDenial({ code: "OUTSIDE_SCOPE", message: "x" })).toBe(true);
    expect(isPermissionDenial(Object.assign(new Error("x"), { status: 403 }))).toBe(true);
  });

  it("does not treat other failures as refusals", () => {
    for (const value of [
      new Error("You do not have this capability"),
      { code: "CONFLICT" },
      { status: 500 },
      "FORBIDDEN",
      null,
      undefined,
    ]) {
      expect(isPermissionDenial(value)).toBe(false);
    }
  });
});
