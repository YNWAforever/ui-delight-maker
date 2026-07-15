// @vitest-environment jsdom

import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
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
  it("forwards an invitation completion redirect to Neon Auth", () => {
    render(
      <LoginAuthPage
        authPath="sign-up"
        redirectTo="/invite/raw-token/complete"
        title="Join Fimmick ClientOps"
        description="Invitation for person@example.com"
      />,
    );

    expect(providerPropsMock).toHaveBeenCalledWith(
      expect.objectContaining({ redirectTo: "/invite/raw-token/complete" }),
    );
    expect(screen.getByRole("heading", { name: "Join Fimmick ClientOps" })).toBeTruthy();
    expect(screen.getByText("Invitation for person@example.com")).toBeTruthy();
  });
});
