import { describe, expect, it } from "vitest";

import { normalizeWorkspaceViewConfig } from "../workspace-preferences";

describe("normalizeWorkspaceViewConfig", () => {
  it("keeps supported Account columns and filters", () => {
    expect(
      normalizeWorkspaceViewConfig({
        filters: { lifecycle_stage: "at_risk" },
        columns: ["name", "relationship_health", "bad"],
        sort: { field: "last_activity_at", direction: "desc" },
      }),
    ).toEqual({
      filters: { lifecycle_stage: "at_risk" },
      columns: ["name", "relationship_health"],
      sort: { field: "last_activity_at", direction: "desc" },
    });
  });

  it("falls back to safe defaults for malformed configuration", () => {
    expect(normalizeWorkspaceViewConfig(null)).toEqual({
      filters: {},
      columns: ["name", "lifecycle_stage", "relationship_health", "last_activity_at", "next_action"],
      sort: { field: "last_activity_at", direction: "desc" },
    });
  });
});
