import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * A server function with no caller still typechecks, still passes its own unit tests, and never
 * appears in a route test — which is how five admin mutations shipped complete but unreachable,
 * including a suspend with no matching restore. This gate makes that state explicit.
 *
 * The assertion is exact set equality, not a subset: adding a new unreachable mutation fails, and
 * so does wiring one up without removing it from the list. Either way the list stays true.
 */

const SERVER_FUNCTION_DIR = "src/server-functions";
const UI_ROOTS = ["src/routes", "src/components"];

// Every entry needs a reason. Wire the function and delete the line, or explain why it stays.
const KNOWN_UNREACHABLE: Record<string, string> = {
  revokeAdminPermissionOverrideFn:
    "createAdminPermissionOverrideFn is wired but revoke is not, so an override cannot be undone from the UI.",
  createAdminAccessRequestFn:
    "Requester-side action. The admin screen only decides requests; members raise them from /account.",
  cancelAdminWorkDelegationFn:
    "Needs an admin read path listing a member's delegations before a cancel affordance has anywhere to live. No such server function exists.",
  resendUserInvitation: "Invitation lifecycle after send has no UI.",
  revokeUserInvitation: "Invitation lifecycle after send has no UI.",
};

function collectSourceFiles(directory: string, accumulator: string[] = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__") collectSourceFiles(path, accumulator);
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.includes(".test.")) {
      accumulator.push(path);
    }
  }
  return accumulator;
}

function adminMutationNames() {
  const names: string[] = [];
  for (const file of readdirSync(SERVER_FUNCTION_DIR)) {
    if (!file.startsWith("admin-") || !file.endsWith(".ts")) continue;
    const source = readFileSync(`${SERVER_FUNCTION_DIR}/${file}`, "utf8");
    for (const block of source.split("export const ").slice(1)) {
      if (!block.includes("createServerFn")) continue;
      // Reads are excluded: a loader-only getter with no direct component reference is normal.
      if (!/createServerFn\(\{\s*method:\s*"POST"/.test(block.slice(0, 200))) continue;
      names.push(block.slice(0, block.indexOf(" ")).replace(/[^\w]/g, ""));
    }
  }
  return names;
}

describe("admin mutation reachability", () => {
  const uiSource = UI_ROOTS.flatMap((root) => collectSourceFiles(root))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
  const mutations = adminMutationNames();

  it("finds the admin mutations to check", () => {
    expect(mutations.length).toBeGreaterThan(15);
    expect(mutations).toContain("reactivateAdminUserFn");
    expect(mutations).toContain("updateAdminUserFn");
  });

  it("every admin mutation is reachable from the UI except the documented set", () => {
    const unreachable = mutations.filter((name) => !uiSource.includes(name)).sort();

    expect(unreachable).toEqual(Object.keys(KNOWN_UNREACHABLE).sort());
  });

  it("the restore path is wired, so suspension is not a one-way door", () => {
    expect(uiSource).toContain("reactivateAdminUserFn");
    expect(uiSource).toContain("suspendAdminUserFn");
  });

  it("profile and org placement are editable after invite", () => {
    // managerProfileId/primaryDepartmentId used to be settable only in the invite dialog.
    expect(uiSource).toContain("updateAdminUserFn");
    const profileDialog = readFileSync("src/components/admin/user-profile-dialog.tsx", "utf8");
    expect(profileDialog).toContain("managerProfileId");
    expect(profileDialog).toContain("primaryDepartmentId");
  });

  it("documents a reason for each known-unreachable mutation", () => {
    for (const [name, reason] of Object.entries(KNOWN_UNREACHABLE)) {
      expect(reason.length, `${name} needs a reason`).toBeGreaterThan(20);
    }
  });
});
