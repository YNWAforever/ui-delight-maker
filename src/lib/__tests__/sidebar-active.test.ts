import { describe, expect, it } from "vitest";
import { isSidebarItemActive } from "../sidebar-active";

describe("isSidebarItemActive", () => {
  it("highlights the entry whose url the path matches exactly", () => {
    expect(isSidebarItemActive({ url: "/leads" }, "/leads")).toBe(true);
    expect(isSidebarItemActive({ url: "/quotes" }, "/leads")).toBe(false);
  });

  it("keeps the parent entry lit on its detail routes", () => {
    // Visiting /leads/lead-1 should still highlight Leads, or the sidebar goes blank
    // as soon as the user opens a record.
    expect(isSidebarItemActive({ url: "/leads" }, "/leads/lead-1")).toBe(true);
  });

  it("does not treat a sibling route sharing the prefix as a match", () => {
    // /leads-archive starts with "/leads", so a bare startsWith would light up Leads on a
    // different route. The check appends a slash for exactly this reason.
    expect(isSidebarItemActive({ url: "/leads" }, "/leads-archive")).toBe(false);
  });

  it("matches the dashboard only on the exact root", () => {
    // "/" is a prefix of every path, so it needs the exact-match branch.
    expect(isSidebarItemActive({ url: "/" }, "/")).toBe(true);
    expect(isSidebarItemActive({ url: "/" }, "/leads")).toBe(false);
  });

  it("prefers activePath over url when both are present", () => {
    expect(isSidebarItemActive({ url: "/quotes/new", activePath: "/quotes" }, "/quotes")).toBe(
      true,
    );
  });

  it("ignores a query string on the target", () => {
    expect(isSidebarItemActive({ url: "/leads?status=new" }, "/leads")).toBe(true);
  });

  it("never highlights an entry that opts out with a null activePath", () => {
    expect(isSidebarItemActive({ url: "/leads", activePath: null }, "/leads")).toBe(false);
  });
});
