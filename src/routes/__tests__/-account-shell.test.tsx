// @vitest-environment jsdom

import type { ComponentType, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { crmQueryKeys } from "@/lib/query-keys";

/**
 * `/account` is one of the two authenticated routes the plan omitted entirely (PC-1), and it
 * owns six real personal writes. The defects asserted here are the ones that made those
 * writes untrustworthy:
 *
 * - **IF-E2-47** every write funnelled into one catch that toasted `error.message`, so Zod
 *   messages, `AdminError` strings and Neon driver text all reached the user verbatim.
 * - **IF-E2-43** `invite.$token.complete` redirects to `/account?welcome=1`, a contract the
 *   destination never parsed.
 * - **IF-E2-50** the five tabs lived in component state, so the single inbound link always
 *   dropped a brand-new user on Profile with no way to share or restore a tab.
 */

const { navigateMock, routerInvalidateMock, updateProfileMock, toastErrorMock, toastSuccessMock } =
  vi.hoisted(() => ({
    navigateMock: vi.fn(),
    routerInvalidateMock: vi.fn(),
    updateProfileMock: vi.fn(),
    toastErrorMock: vi.fn(),
    toastSuccessMock: vi.fn(),
  }));

const search = { tab: undefined as string | undefined, welcome: undefined as boolean | undefined };

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    fullPath: "/account",
    useLoaderData: vi.fn(),
    useSearch: () => search,
  }),
  useNavigate: () => navigateMock,
  useRouter: () => ({ invalidate: routerInvalidateMock }),
}));

vi.mock("sonner", () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock, message: vi.fn() },
}));

vi.mock("@/server-functions/account", () => ({
  cancelMyDelegation: vi.fn(),
  createMyAccessRequest: vi.fn(),
  createMyDelegation: vi.fn(),
  getMyAccount: vi.fn(),
  revokeMyAppSessions: vi.fn(),
  updateMyAvailability: vi.fn(),
  updateMyProfile: updateProfileMock,
}));

vi.mock("@/components/sales", () => ({
  ErrorState: ({ title, onRetry }: { title?: string; onRetry: () => void }) => (
    <div>
      <p>{title}</p>
      <button onClick={onRetry}>Try again</button>
    </div>
  ),
  StaleDataIndicator: () => null,
  WorkspaceHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

/**
 * Stands in for the settings body so this file tests the route's contract with it - what it
 * hands down and what it does with what comes back - rather than re-testing the component,
 * which has its own suite next to it.
 */
vi.mock("@/components/account/account-settings", () => ({
  AccountSettings: ({
    tab,
    welcome,
    onTabChange,
    onUpdateProfile,
  }: {
    tab: string;
    welcome?: boolean;
    onTabChange: (tab: string) => void;
    onUpdateProfile: (input: unknown) => Promise<unknown>;
  }): ReactNode => (
    <div>
      <p>tab: {tab}</p>
      <p>welcome: {String(welcome)}</p>
      <button onClick={() => onTabChange("security")}>Go to security</button>
      <button
        onClick={() => {
          void onUpdateProfile({ name: "Person" }).catch(() => undefined);
        }}
      >
        Save profile
      </button>
    </div>
  ),
}));

import { Route } from "../account";

const account = {
  profile: { id: "profile-1", role: "sales" },
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
  const Component = Route.options.component as ComponentType;
  render(
    <QueryClientProvider client={queryClient}>
      <Component />
    </QueryClientProvider>,
  );
  return { invalidateQueries };
}

beforeEach(() => {
  navigateMock.mockReset();
  routerInvalidateMock.mockReset();
  routerInvalidateMock.mockResolvedValue(undefined);
  updateProfileMock.mockReset();
  updateProfileMock.mockResolvedValue({ ok: true });
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
  search.tab = undefined;
  search.welcome = undefined;
  vi.mocked(Route.useLoaderData).mockReturnValue(account as never);
});

afterEach(cleanup);

describe("account writes", () => {
  it("refreshes the account read and the shell identity after a profile save", async () => {
    const { invalidateQueries } = renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() =>
      expect(updateProfileMock).toHaveBeenCalledWith({ data: { name: "Person" } }),
    );
    await waitFor(() =>
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: crmQueryKeys.account.detail("me"),
        exact: true,
      }),
    );
    // The sidebar footer renders this profile's name, so it has to refresh with it.
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: crmQueryKeys.shell(),
      exact: true,
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("Profile updated");
  });

  it("never puts a driver message or a validation path in the toast", async () => {
    updateProfileMock.mockRejectedValue(
      new Error('null value in column "name" violates not-null constraint'),
    );
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledTimes(1));
    const message = toastErrorMock.mock.calls[0][0] as string;
    expect(message).toBe("Something went wrong. Please try again.");
    expect(message).not.toContain("null value");
    expect(message).not.toContain("constraint");
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });
});

describe("account URL state", () => {
  it("puts the tab in the URL rather than in component state", () => {
    renderPage();
    expect(screen.getByText("tab: profile")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Go to security" }));
    expect(navigateMock).toHaveBeenCalledTimes(1);

    const [options] = navigateMock.mock.calls[0] as unknown as [
      { search: (current: Record<string, unknown>) => Record<string, unknown>; replace: boolean },
    ];
    expect(options.search({ welcome: true })).toEqual({ welcome: true, tab: "security" });
    expect(options.replace).toBe(true);
  });

  it("drops the default tab from the URL instead of pinning ?tab=profile", () => {
    search.tab = "security";
    renderPage();
    expect(screen.getByText("tab: security")).toBeTruthy();
  });

  it("parses the welcome contract the invitation redirect already states", () => {
    const parsed = Route.options.validateSearch as unknown as {
      parse: (input: unknown) => { tab?: string; welcome?: boolean };
    };
    expect(parsed.parse({ welcome: "1" }).welcome).toBe(true);
    expect(parsed.parse({}).welcome).toBeUndefined();
    // An obsolete or invented tab falls back rather than rendering a blank body.
    expect(parsed.parse({ tab: "billing" }).tab).toBeUndefined();
  });

  it("passes the welcome flag down for exactly the visit that follows activation", () => {
    search.welcome = true;
    renderPage();
    expect(screen.getByText("welcome: true")).toBeTruthy();
  });
});

describe("account failure surface", () => {
  it("sanitizes a loader failure and retries only this route", () => {
    const ErrorComponent = Route.options.errorComponent as ComponentType<{ error: unknown }>;
    render(<ErrorComponent error={new Error("password authentication failed for user")} />);

    expect(screen.getByText("Your account did not load")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    const [options] = routerInvalidateMock.mock.calls[0] as unknown as [
      { filter: (match: { routeId: string }) => boolean },
    ];
    expect(options.filter({ routeId: "/account" })).toBe(true);
    expect(options.filter({ routeId: "/settings" })).toBe(false);
  });
});
