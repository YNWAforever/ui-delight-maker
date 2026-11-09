// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceAccessState } from "../workspace-access-state";

const replaceMock = vi.fn();
const originalLocation = window.location;

beforeEach(() => {
  // jsdom's Location is unforgeable; replace the configurable global binding for the test.
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { replace: replaceMock },
  });
  replaceMock.mockClear();
});

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

function renderUnverified() {
  const onSignOut = vi.fn();
  render(
    <WorkspaceAccessState state="unverified" email="invitee@fimmick.com" onSignOut={onSignOut} />,
  );
  return { onSignOut };
}

function codeInput() {
  return screen.getByLabelText(/verification code/i) as HTMLInputElement;
}

function submitCode(code = "123456") {
  const input = codeInput();
  fireEvent.change(input, { target: { value: code } });
  const form = input.closest("form");
  expect(form).toBeTruthy();
  fireEvent.submit(form as HTMLFormElement);
}

describe("workspace access guidance", () => {
  it("explains a signed-in identity without a profile without offering another login loop", () => {
    render(<WorkspaceAccessState state="no_profile" />);
    expect(screen.getByRole("heading", { name: /access pending/i })).toBeTruthy();
    expect(screen.getByText(/administrator invitation/i)).toBeTruthy();
    expect(screen.queryByText(/sign in to your workspace/i)).toBeNull();
  });

  it("shows the server-resolved email and enables Verify email only for six digits", () => {
    renderUnverified();

    expect(screen.getByRole("heading", { name: /verify your email/i })).toBeTruthy();
    expect(screen.getByText(/neon auth emailed a verification code/i)).toBeTruthy();
    expect(screen.getByText("invitee@fimmick.com")).toBeTruthy();
    expect(screen.getByText(/spam folder/i)).toBeTruthy();

    const input = codeInput();
    expect(input.getAttribute("inputmode")).toBe("numeric");
    expect(input.getAttribute("autocomplete")).toBe("one-time-code");
    expect(input.maxLength).toBe(6);

    const verifyButton = screen.getByRole("button", { name: /verify email/i }) as HTMLButtonElement;
    expect(verifyButton.disabled).toBe(true);

    fireEvent.change(input, { target: { value: "12345" } });
    expect(verifyButton.disabled).toBe(true);

    fireEvent.change(input, { target: { value: "12a3456" } });
    expect(input.value).toBe("123456");
    expect(verifyButton.disabled).toBe(false);
  });

  it("verifies the code through the same-origin proxy and reloads into the workspace", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: true }));
    vi.stubGlobal("fetch", fetchMock);
    renderUnverified();

    submitCode();

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/email-otp/verify-email", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "invitee@fimmick.com", otp: "123456" }),
      }),
    );
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/"));
  });

  it.each([
    ["INVALID_OTP", /that code is not valid/i],
    ["OTP_EXPIRED", /that code expired — send a new one/i],
    ["TOO_MANY_ATTEMPTS", /too many attempts — wait a moment/i],
  ])("maps %s inline without reloading", async (code, expectedMessage) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ code, message: "upstream detail" }, { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    renderUnverified();

    submitCode();

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(expectedMessage));
    expect(screen.getByRole("alert").textContent).not.toContain("upstream detail");
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("shows a safe message for network or unknown failures without leaking the body", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("socket hang up"));
    vi.stubGlobal("fetch", fetchMock);
    renderUnverified();

    submitCode();

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/could not reach/i));
    expect(screen.getByRole("alert").textContent).not.toContain("socket hang up");
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("resends the code and enforces a cooldown with confirmation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: true }));
    vi.stubGlobal("fetch", fetchMock);
    renderUnverified();

    fireEvent.click(screen.getByRole("button", { name: /resend code/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "invitee@fimmick.com", type: "email-verification" }),
      }),
    );

    const cooldownButton = screen.getByRole("button", {
      name: /resend code in \d+s/i,
    }) as HTMLButtonElement;
    expect(cooldownButton.disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toMatch(/a new code was sent/i);
  });

  it("keeps the use-a-different-account sign-out action", () => {
    const { onSignOut } = renderUnverified();
    fireEvent.click(screen.getByRole("button", { name: /different account/i }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("names suspended and deactivated states without offering workspace controls", () => {
    const { rerender } = render(<WorkspaceAccessState state="suspended" />);
    expect(screen.getByRole("heading", { name: /suspended/i })).toBeTruthy();
    rerender(<WorkspaceAccessState state="deactivated" />);
    expect(screen.getByRole("heading", { name: /deactivated/i })).toBeTruthy();
  });

  it("guides an already invited identity to its existing invitation link", () => {
    render(<WorkspaceAccessState state="invited" />);
    expect(screen.getByText(/invitation link/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /resend/i })).toBeNull();
  });
});
