// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FakeRouterState = {
  status: "idle" | "pending";
  location: { pathname: string };
  resolvedLocation?: { pathname: string };
};

let routerState: FakeRouterState;

vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (state: FakeRouterState) => unknown }) =>
    select(routerState),
}));

import { NavigationProgress, RouteAnnouncer } from "../navigation-feedback";

beforeEach(() => {
  routerState = {
    status: "idle",
    location: { pathname: "/" },
    resolvedLocation: { pathname: "/" },
  };
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback(0);
    return 1;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("NavigationProgress", () => {
  it("appears only when a navigation outlasts 150 ms, and goes when it settles", () => {
    vi.useFakeTimers();
    const { rerender } = render(<NavigationProgress />);
    expect(screen.queryByRole("progressbar")).toBeNull();

    routerState = { ...routerState, status: "pending" };
    rerender(<NavigationProgress />);
    expect(screen.queryByRole("progressbar")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(screen.getByRole("progressbar", { name: "Loading page" })).toBeTruthy();

    routerState = { ...routerState, status: "idle" };
    rerender(<NavigationProgress />);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("never shows for a navigation that finishes within the delay", () => {
    vi.useFakeTimers();
    const { rerender } = render(<NavigationProgress />);
    routerState = { ...routerState, status: "pending" };
    rerender(<NavigationProgress />);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    routerState = { ...routerState, status: "idle" };
    rerender(<NavigationProgress />);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});

describe("RouteAnnouncer", () => {
  function Page({ title }: { title: string }) {
    return (
      <>
        <a href="/quotes">Quotes link</a>
        <main id="main-content">
          <h1>{title}</h1>
        </main>
        <RouteAnnouncer />
      </>
    );
  }

  it("leaves focus alone on the first load", () => {
    render(<Page title="Lead Inbox" />);
    expect(document.activeElement).toBe(document.body);
  });

  it("moves focus to the new page heading and announces it after a navigation", () => {
    routerState = {
      status: "idle",
      location: { pathname: "/leads" },
      resolvedLocation: { pathname: "/leads" },
    };
    const { rerender } = render(<Page title="Lead Inbox" />);
    screen.getByRole("link", { name: "Quotes link" }).focus();

    routerState = {
      status: "idle",
      location: { pathname: "/quotes" },
      resolvedLocation: { pathname: "/quotes" },
    };
    rerender(<Page title="Quotes" />);

    const heading = screen.getByRole("heading", { name: "Quotes" });
    expect(document.activeElement).toBe(heading);
    expect(heading.getAttribute("tabindex")).toBe("-1");
    expect(screen.getByRole("status").textContent).toBe("Quotes");
  });

  it("does not move focus when only the search string changes", () => {
    routerState = {
      status: "idle",
      location: { pathname: "/leads" },
      resolvedLocation: { pathname: "/leads" },
    };
    const { rerender } = render(<Page title="Lead Inbox" />);
    const link = screen.getByRole("link", { name: "Quotes link" });
    link.focus();

    // A filter change: same pathname, new search params.
    routerState = { ...routerState };
    rerender(<Page title="Lead Inbox" />);
    expect(document.activeElement).toBe(link);
  });
});
