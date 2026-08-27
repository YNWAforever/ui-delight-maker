// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Save touchpoint" wrote a real row and had none of the guards around it.
 *
 * The button carried no `disabled` and `save()` had no `try`/`catch`, so two clicks before
 * the first `createTouchpoint` resolved wrote two touchpoints, and a rejection was an
 * unhandled promise rejection with the dialog still open and nothing said. The "Tidy with
 * AI" control in the same dialog already had both guards, which is what made the gap a
 * consistency bug rather than a missing feature.
 */

const { createTouchpointMock, toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  createTouchpointMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock, message: vi.fn() },
}));
vi.mock("@/server-functions/touchpoints", () => ({ createTouchpoint: createTouchpointMock }));
vi.mock("@/server-functions/ai-note-tidy", () => ({
  isAiNoteTidyAvailable: () => Promise.resolve({ available: false }),
  tidyTouchpointNote: vi.fn(),
}));

import { TouchpointLogger } from "../touchpoint-logger";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderLogger(onLogged = vi.fn()) {
  render(
    <TouchpointLogger
      clientId="client-1"
      engagements={[]}
      contacts={[]}
      onLogged={onLogged}
      trigger={<button type="button">Log touchpoint</button>}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Log touchpoint" }));
  return { onLogged };
}

beforeEach(() => {
  createTouchpointMock.mockReset();
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
});

afterEach(cleanup);

describe("touchpoint logger", () => {
  it("writes one touchpoint however many times Save is clicked", async () => {
    const request = deferred<unknown>();
    createTouchpointMock.mockReturnValue(request.promise);
    const { onLogged } = renderLogger();

    fireEvent.click(screen.getByRole("button", { name: "Save touchpoint" }));

    const pending = await screen.findByRole("button", { name: "Saving…" });
    expect(pending.hasAttribute("disabled")).toBe(true);
    fireEvent.click(pending);
    expect(createTouchpointMock).toHaveBeenCalledTimes(1);

    await act(async () => request.resolve({ id: "touchpoint-1" }));
    await waitFor(() => expect(onLogged).toHaveBeenCalledTimes(1));
    expect(toastSuccessMock).toHaveBeenCalledWith("Touchpoint logged");
  });

  it("keeps the dialog open on failure and never claims the touchpoint was logged", async () => {
    createTouchpointMock.mockRejectedValue(
      new Error('null value in column "client_id" violates not-null constraint'),
    );
    const { onLogged } = renderLogger();

    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Quarterly check-in" } });
    fireEvent.click(screen.getByRole("button", { name: "Save touchpoint" }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledTimes(1));
    const message = toastErrorMock.mock.calls[0][0] as string;
    expect(message).not.toContain("client_id");
    expect(message).toBe("Something went wrong. Please try again.");

    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(onLogged).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).value).toBe(
      "Quarterly check-in",
    );
  });
});
