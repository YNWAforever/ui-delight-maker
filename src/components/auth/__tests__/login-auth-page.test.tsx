// @vitest-environment jsdom

import type { ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const providerPropsMock = vi.hoisted(() => vi.fn());

vi.mock("@neondatabase/auth-ui", () => ({
  AuthView: ({ path }: { path: string }) => <div>Auth view: {path}</div>,
}));

vi.mock("@/components/auth/neon-auth-provider", () => ({
  NeonAuthProvider: ({ children, ...props }: { children: ReactNode; redirectTo: string }) => {
    providerPropsMock(props);
    return <div>{children}</div>;
  },
}));

import { LoginAuthPage } from "../login-auth-page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("LoginAuthPage", () => {
  it.each(["sign-in", "forgot-password", "reset-password", "sign-up"])(
    "keeps the %s form out of server HTML until event handlers can attach",
    async (authPath) => {
      const stream = await renderToReadableStream(
        <LoginAuthPage authPath={authPath} redirectTo="/invite/test-token/complete" />,
      );
      await stream.allReady;
      const html = await new Response(stream).text();
      expect(html).not.toContain("Auth view:");
      expect(html).toContain("Loading sign-in form");
    },
  );

  it.each(["forgot-password", "reset-password"])(
    "shows the %s recovery view without enabling self signup",
    async (authPath) => {
      render(<LoginAuthPage authPath={authPath} />);

      expect(await screen.findByText(`Auth view: ${authPath}`)).toBeTruthy();
      expect(
        screen.getByText(
          authPath === "forgot-password"
            ? "Enter your email to receive a password reset link."
            : "Set a new password for your invited account.",
        ),
      ).toBeTruthy();
      expect(screen.getByRole("link", { name: "Back to sign in" }).getAttribute("href")).toBe(
        "/login/sign-in",
      );
      expect(providerPropsMock).toHaveBeenCalledWith(expect.objectContaining({ signUp: false }));
    },
  );
  it("does not offer self signup from the normal login route", async () => {
    render(<LoginAuthPage authPath="sign-up" />);
    await waitFor(() =>
      expect(providerPropsMock).toHaveBeenCalledWith(expect.objectContaining({ signUp: false })),
    );
    expect(await screen.findByText("Auth view: sign-in")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Back to sign in" })).toBeNull();
    expect(screen.getByText(/administrator-invited account/i)).toBeTruthy();
  });

  it("forwards an invitation completion redirect to Neon Auth", async () => {
    render(
      <LoginAuthPage
        authPath="sign-up"
        redirectTo="/invite/raw-token/complete"
        title="Join Fimmick ClientOps"
        description="Invitation for person@example.com"
      />,
    );

    await waitFor(() =>
      expect(providerPropsMock).toHaveBeenCalledWith(
        expect.objectContaining({ redirectTo: "/invite/raw-token/complete", signUp: true }),
      ),
    );
    expect(screen.getByRole("heading", { name: "Join Fimmick ClientOps" })).toBeTruthy();
    expect(screen.getByText("Invitation for person@example.com")).toBeTruthy();
  });
  it("gives the public skip link one focusable main target", () => {
    render(<LoginAuthPage />);
    const main = screen.getByRole("main");
    expect(main.id).toBe("main-content");
    main.focus();
    expect(document.activeElement).toBe(main);
  });
});
