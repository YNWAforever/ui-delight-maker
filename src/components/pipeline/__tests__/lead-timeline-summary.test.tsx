// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";

const { getLeadTimelineSummaryMock } = vi.hoisted(() => ({
  getLeadTimelineSummaryMock: vi.fn(),
}));

vi.mock("@/server-functions/leads", () => ({
  getLeadTimelineSummary: getLeadTimelineSummaryMock,
}));

const { LeadTimelineSummaryCard } = await import("../lead-timeline-summary");

const summarise = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Summarise" }));
};

afterEach(cleanup);
// Block body on purpose. `() => mock.mockReset()` returns the mock, and Vitest calls a value
// returned from a hook as that hook's teardown — invoking the mock once more after the test,
// which re-runs a throwing implementation into an unhandled rejection.
beforeEach(() => {
  getLeadTimelineSummaryMock.mockReset();
});

describe("LeadTimelineSummaryCard", () => {
  it("renders the rollup with a total and a per-action breakdown", async () => {
    getLeadTimelineSummaryMock.mockResolvedValue({
      total: 6,
      lastActivityAt: "2026-08-22T11:02:00.000Z",
      byAction: [
        { action: "email_sent", count: 2, lastAt: "2026-08-22T11:02:00.000Z" },
        { action: "note_added", count: 4, lastAt: "2026-08-20T09:14:00.000Z" },
      ],
    });

    render(<LeadTimelineSummaryCard leadId="lead-1" />);
    await summarise();

    await waitFor(() => expect(screen.getByText(/recorded activities/)).toBeTruthy());
    expect(getLeadTimelineSummaryMock).toHaveBeenCalledWith({ data: { leadId: "lead-1" } });
    expect(screen.getByText("email_sent")).toBeTruthy();
    expect(screen.getByText("note_added")).toBeTruthy();
    // The empty and failed copy must be absent, or the states would be indistinguishable.
    expect(screen.queryByText("No recorded activity yet.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("says a lead with no activity has none, rather than implying the summariser failed", async () => {
    // This is the entire point of the work: "nothing happened" is an answer, not a fault.
    getLeadTimelineSummaryMock.mockResolvedValue({
      total: 0,
      lastActivityAt: null,
      byAction: [],
    });

    render(<LeadTimelineSummaryCard leadId="lead-1" />);
    await summarise();

    await waitFor(() => expect(screen.getByText("No recorded activity yet.")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(document.body.textContent).not.toMatch(/no summary available/i);
    expect(document.body.textContent).not.toMatch(/failed|unavailable|error/i);
  });

  it("shows a sanitised failure with a retry, never an empty summary", async () => {
    // `mockImplementation`, not `mockRejectedValue`: the latter builds the rejected promise
    // eagerly, so Node flags it unhandled before the click that would await it.
    getLeadTimelineSummaryMock.mockImplementation(async () => {
      throw new Error('relation "activity_logs" does not exist\n  at Parser.parseErrorMessage');
    });

    render(<LeadTimelineSummaryCard leadId="lead-1" />);
    await summarise();

    await waitFor(() => expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy());
    // A failure must not read as "this lead has no activity".
    expect(screen.queryByText("No recorded activity yet.")).toBeNull();
    expect(screen.queryByText(/recorded activities/)).toBeNull();
    // The raw driver text must not reach the user.
    expect(document.body.textContent).not.toMatch(/activity_logs|Parser\.parseErrorMessage/);
    expect(document.body.textContent).toMatch(/something went wrong|try again/i);
  });

  it("retries after a failure", async () => {
    getLeadTimelineSummaryMock
      .mockImplementationOnce(async () => {
        throw new Error("nope");
      })
      .mockResolvedValueOnce({
        total: 1,
        lastActivityAt: "2026-08-22T11:02:00.000Z",
        byAction: [{ action: "email_sent", count: 1, lastAt: "2026-08-22T11:02:00.000Z" }],
      });

    render(<LeadTimelineSummaryCard leadId="lead-1" />);
    await summarise();

    await waitFor(() => expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(screen.getByText(/recorded activity(?!\s)/)).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("drops a summary when the panel switches to another lead", async () => {
    // The preview panel reuses this card as the selection changes. A stale summary would
    // report one lead's history under another lead's name.
    getLeadTimelineSummaryMock.mockResolvedValue({
      total: 3,
      lastActivityAt: "2026-08-22T11:02:00.000Z",
      byAction: [{ action: "email_sent", count: 3, lastAt: "2026-08-22T11:02:00.000Z" }],
    });

    const view = render(<LeadTimelineSummaryCard leadId="lead-1" />);
    await summarise();
    await waitFor(() => expect(screen.getByText("email_sent")).toBeTruthy());

    view.rerender(<LeadTimelineSummaryCard leadId="lead-2" />);

    await waitFor(() => expect(screen.queryByText("email_sent")).toBeNull());
    expect(screen.getByRole("button", { name: "Summarise" })).toBeTruthy();
  });

  it("does not query until asked, so a board of lead cards costs nothing on load", async () => {
    render(<LeadTimelineSummaryCard leadId="lead-1" />);
    expect(getLeadTimelineSummaryMock).not.toHaveBeenCalled();
  });
});
