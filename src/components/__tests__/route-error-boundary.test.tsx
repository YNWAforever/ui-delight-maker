// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RouteErrorBoundary } from "../route-error-boundary";

afterEach(cleanup);

/**
 * A refused loader must not take the app shell down with it (audit UX-03).
 *
 * The root here stands in for the authenticated shell: if the boundary rendered at root
 * level, "Sidebar" would disappear along with the outlet.
 */
function renderAt(path: string) {
  const rootRoute = createRootRoute({
    component: () => (
      <div>
        <nav>Sidebar</nav>
        <Outlet />
      </div>
    ),
  });
  const leads = createRoute({
    getParentRoute: () => rootRoute,
    path: "/leads",
    loader: () => {
      // The shape a refusal has after a client navigation: a code, no AdminError prototype.
      throw Object.assign(new Error("You do not have this capability"), { code: "FORBIDDEN" });
    },
    component: () => <p>Lead list</p>,
  });
  const quotes = createRoute({
    getParentRoute: () => rootRoute,
    path: "/quotes",
    loader: () => {
      throw new Error('select * from quotes where owner = "clientops_rw" failed');
    },
    component: () => <p>Quote list</p>,
  });
  const home = createRoute({ getParentRoute: () => rootRoute, path: "/", component: () => null });
  const account = createRoute({
    getParentRoute: () => rootRoute,
    path: "/account",
    component: () => null,
  });

  const router = createRouter({
    routeTree: rootRoute.addChildren([leads, quotes, home, account]),
    history: createMemoryHistory({ initialEntries: [path] }),
    defaultErrorComponent: RouteErrorBoundary,
  });
  return render(<RouterProvider router={router} />);
}

describe("RouteErrorBoundary", () => {
  it("shows a refusal inside the shell with a way out and a way to ask", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    renderAt("/leads");

    expect(await screen.findByText("You do not have access to Leads")).toBeTruthy();
    expect(screen.getByText("Sidebar")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to your start page" }).getAttribute("href")).toBe(
      "/",
    );
    expect(screen.getByRole("link", { name: "Request access" }).getAttribute("href")).toBe(
      "/account",
    );
    // No retry for a refusal: trying again cannot change the answer.
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
    expect(screen.queryByText(/capability/)).toBeNull();
    error.mockRestore();
  });

  it("shows other failures inside the shell without leaking the raw message", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    renderAt("/quotes");

    expect(await screen.findByText("Quotes did not load")).toBeTruthy();
    expect(screen.getByText("Sidebar")).toBeTruthy();
    expect(screen.queryByText(/clientops_rw/)).toBeNull();
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
    error.mockRestore();
  });
});
