// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Mark renewed" and "Mark ended" are lifecycle transitions, and this dialog had none of
 * the guards that implies.
 *
 * `confirm` awaited the write with no in-flight flag and no `try`/`catch`, and Radix's
 * `AlertDialogAction` closes on click — so a rejection left the board unchanged, the dialog
 * gone, `onDone` never called and nothing said at all, while a double click issued two
 * transitions. Each of those is asserted here.
 */

const { renewMock, endMock, toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  renewMock: vi.fn(),
  endMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock, message: vi.fn() },
}));
vi.mock("@/server-functions/engagements", () => ({
  renewEngagement: renewMock,
  endEngagement: endMock,
}));

import { MarkRenewedEndedDialog } from "../mark-renewed-ended-dialog";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  renewMock.mockReset();
  endMock.mockReset();
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
});

afterEach(cleanup);

describe("mark renewed / ended dialog", () => {
  it("issues one renewal however many times Confirm is clicked", async () => {
    const request = deferred<unknown>();
    renewMock.mockReturnValue(request.promise);
    const onDone = vi.fn();
    render(
      <MarkRenewedEndedDialog
        engagementId="eng-1"
        action="renew"
        onClose={vi.fn()}
        onDone={onDone}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    const pending = await screen.findByRole("button", { name: "Saving…" });
    expect(pending.hasAttribute("disabled")).toBe(true);
    fireEvent.click(pending);
    expect(renewMock).toHaveBeenCalledTimes(1);

    await act(async () => request.resolve({ id: "eng-1" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(toastSuccessMock).toHaveBeenCalledWith("Engagement renewed");
  });

  it("keeps the dialog open on failure, reports a sanitized message, and does not signal success", async () => {
    endMock.mockRejectedValue(new Error("You do not have this capability"));
    const onDone = vi.fn();
    render(
      <MarkRenewedEndedDialog
        engagementId="eng-1"
        action="end"
        onClose={vi.fn()}
        onDone={onDone}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Reason/), {
      target: { value: "Client consolidated vendors" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledTimes(1));
    expect(toastErrorMock).toHaveBeenCalledWith("You do not have this capability");
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    // The reason the user typed is still there, so the retry is one click.
    expect((screen.getByLabelText(/Reason/) as HTMLTextAreaElement).value).toBe(
      "Client consolidated vendors",
    );
  });

  it("never lets a Postgres message through to the toast", async () => {
    renewMock.mockRejectedValue(
      new Error('duplicate key value violates unique constraint "engagements_pkey"'),
    );
    render(
      <MarkRenewedEndedDialog
        engagementId="eng-1"
        action="renew"
        onClose={vi.fn()}
        onDone={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledTimes(1));
    const message = toastErrorMock.mock.calls[0][0] as string;
    expect(message).not.toContain("constraint");
    expect(message).toBe("Something went wrong. Please try again.");
  });

  it("will not end an engagement without a reason", () => {
    render(
      <MarkRenewedEndedDialog
        engagementId="eng-1"
        action="end"
        onClose={vi.fn()}
        onDone={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Confirm" }).hasAttribute("disabled")).toBe(true);
    expect(endMock).not.toHaveBeenCalled();
  });
});
