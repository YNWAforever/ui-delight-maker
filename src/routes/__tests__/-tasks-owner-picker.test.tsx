// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  resolve: vi.fn(),
}));
vi.mock("@/server-functions/assignable-profiles", () => ({
  listAssignableProfilesFn: mocks.list,
  resolveAssignableProfileFn: mocks.resolve,
}));

function renderPicker(value: string, onChange: (value: string) => void) {
  const Component = (
    globalThis as {
      OwnerPicker?: React.ComponentType<{
        purpose: "task_filter";
        value: string;
        onChange: (value: string) => void;
        label: string;
      }>;
    }
  ).OwnerPicker!;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Component purpose="task_filter" label="Owner" value={value} onChange={onChange} />
    </QueryClientProvider>,
  );
}

describe("task owner picker", () => {
  beforeEach(async () => {
    mocks.list.mockImplementation(async ({ data }: { data: { query?: string } }) => ({
      items: data.query?.toLowerCase().includes("bob")
        ? [{ id: "profile-b", displayName: "Bob Owner", isEligible: true, reason: null }]
        : [{ id: "profile-a", displayName: "Alice Owner", isEligible: true, reason: null }],
      nextCursor: null,
      total: 1,
    }));
    mocks.resolve.mockResolvedValue({
      id: "profile-a",
      displayName: "Alice Owner",
      isEligible: true,
      reason: null,
    });
    const module = await import("@/components/people/profile-search-combobox").catch(() => null);
    (globalThis as { OwnerPicker?: unknown }).OwnerPicker = module?.ProfileSearchCombobox;
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    delete (globalThis as { OwnerPicker?: unknown }).OwnerPicker;
  });

  it("keeps selected A while searching B and never displays the raw ID as a label", async () => {
    const onChange = vi.fn();
    expect((globalThis as { OwnerPicker?: unknown }).OwnerPicker).toBeTypeOf("function");
    renderPicker("profile-a", onChange);
    await waitFor(() => expect(screen.getByText(/Alice Owner/)).toBeTruthy());
    expect(screen.queryByText("profile-a")).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "Owner search" }), {
      target: { value: "Bob" },
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Bob Owner" })).toBeTruthy());
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Bob Owner" }));
    expect(onChange).toHaveBeenCalledWith("profile-b");
  });

  it("offers all, my tasks, and unassigned as explicit filter values", () => {
    const onChange = vi.fn();
    expect((globalThis as { OwnerPicker?: unknown }).OwnerPicker).toBeTypeOf("function");
    renderPicker("all", onChange);
    fireEvent.click(screen.getByRole("button", { name: "My tasks" }));
    fireEvent.click(screen.getByRole("button", { name: "Unassigned" }));
    fireEvent.click(screen.getByRole("button", { name: "All owners" }));
    expect(onChange.mock.calls.map(([value]) => value)).toEqual(["mine", "unassigned", "all"]);
  });
});
