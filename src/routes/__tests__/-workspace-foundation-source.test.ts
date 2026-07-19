import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("unified CRM workspace source wiring", () => {
  it("connects storage, preview, search, and full workspace", () => {
    expect(
      readFileSync(
        new URL("../../server-functions/workspace-preferences.ts", import.meta.url),
        "utf8",
      ),
    ).toContain("getWorkspacePreferences");
    expect(
      readFileSync(new URL("../../server-functions/search.ts", import.meta.url), "utf8"),
    ).toContain("searchWorkspace");
    expect(readFileSync(new URL("../accounts.tsx", import.meta.url), "utf8")).toContain(
      "AccountPreviewPanel",
    );
    expect(readFileSync(new URL("../accounts.$id.tsx", import.meta.url), "utf8")).toContain(
      "getCompanyWorkspaceRead",
    );
    expect(readFileSync(new URL("../__root.tsx", import.meta.url), "utf8")).toContain(
      "getWorkspacePreferences",
    );
  });
});
