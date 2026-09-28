// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrganizationUnitDialog } from "@/components/admin/organization-unit-dialog";
import { WorkReassignmentTable } from "@/components/admin/work-reassignment-table";
import { REASSIGNMENT_BUCKETS } from "@/server/admin/reassignment.server";

const { searchProfiles, resolveProfile } = vi.hoisted(() => ({
  searchProfiles: vi.fn(),
  resolveProfile: vi.fn(),
}));

vi.mock("@/server-functions/assignable-profiles", () => ({
  listAssignableProfilesFn: searchProfiles,
  resolveAssignableProfileFn: resolveProfile,
}));

function withQueries(content: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {content}
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("admin large directory", () => {
  it("selects a person beyond the first 100 for an organization owner", async () => {
    searchProfiles.mockResolvedValue({
      items: [{ id: "person-250", displayName: "Person 250", isEligible: true, reason: null }],
      nextCursor: null,
      total: 1,
    });
    resolveProfile.mockResolvedValue({
      id: "person-250",
      displayName: "Person 250",
      isEligible: true,
      reason: null,
    });
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const actor = userEvent.setup();
    withQueries(
      <OrganizationUnitDialog
        open
        kind="team"
        users={Array.from({ length: 100 }, (_, index) => ({
          id: "person-" + (index + 1),
          name: "Person " + (index + 1),
          email: null,
          status: "active" as const,
        }))}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await actor.type(screen.getByRole("combobox", { name: "Team lead search" }), "Person 250");
    await actor.click(
      await screen.findByRole("button", { name: "Person 250" }, { timeout: 5_000 }),
    );
    expect(screen.getByRole("button", { name: "Clear Team lead" })).toBeTruthy();
    await actor.type(
      screen.getByRole("textbox", { name: "Organization unit name" }),
      "Example team",
    );
    await actor.click(screen.getByRole("button", { name: "Create unit" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ leadProfileId: "person-250" }),
      }),
    );
  }, 10_000);

  it("offers an active off-page successor and never offers an inactive one", async () => {
    searchProfiles.mockResolvedValue({
      items: [
        { id: "person-101", displayName: "Person 101", isEligible: true, reason: null },
        { id: "inactive", displayName: "Inactive", isEligible: false, reason: "Inactive profile" },
      ],
      nextCursor: null,
      total: 2,
    });
    resolveProfile.mockResolvedValue({
      id: "person-101",
      displayName: "Person 101",
      isEligible: true,
      reason: null,
    });
    const onChange = vi.fn();
    const buckets = REASSIGNMENT_BUCKETS.map((bucket) => ({
      ...bucket,
      count: bucket.key === "tasks.assigned_to" ? 1 : 0,
      historyCount: 0,
    }));
    withQueries(
      <WorkReassignmentTable
        inventory={{ profileId: "target", buckets, totalCount: 1, totalHistoryCount: 0 }}
        targetProfileId="target"
        successors={[]}
        selected={{}}
        onChange={onChange}
      />,
    );

    await userEvent
      .setup()
      .type(screen.getByRole("combobox", { name: "Successor for Tasks search" }), "Person");
    expect(
      await screen.findByRole("button", { name: "Inactive" }, { timeout: 5_000 }),
    ).toHaveProperty("disabled", true);
    await userEvent.setup().click(screen.getByRole("button", { name: "Person 101" }));
    expect(onChange).toHaveBeenCalledWith("tasks.assigned_to", "person-101");
  });
});
