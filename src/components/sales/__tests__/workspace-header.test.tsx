// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: ComponentProps<"a"> & { to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

import { WorkspaceHeader } from "../workspace-header";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("WorkspaceHeader", () => {
  it("gives the page exactly one h1, and puts the lifecycle context above it", () => {
    render(<WorkspaceHeader context="Convert" title="Quotes" description="Every open quote." />);

    // One h1 per page is the whole point of a shared header: the two headers this
    // replaces each rendered their own, so a detail page nesting one inside another
    // produced two.
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toBe("Quotes");

    // Context is a label, not a heading — it must not compete in the outline.
    expect(screen.getByText("Convert").tagName).toBe("P");
  });

  it("warns in development when given more secondary actions than it can show", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    render(
      <WorkspaceHeader
        context="Deliver"
        title="Job Sheets"
        secondaryActions={[<button key="a">A</button>, <button key="b">B</button>]}
      />,
    );
    expect(warn).not.toHaveBeenCalled();

    render(
      <WorkspaceHeader
        context="Deliver"
        title="Job Sheets"
        secondaryActions={[
          <button key="a">A</button>,
          <button key="b">B</button>,
          <button key="c">C</button>,
        ]}
      />,
    );
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain("3 secondary actions");
  });

  it("renders every action it is given, primary last", () => {
    render(
      <WorkspaceHeader
        context="Acquire"
        title="Leads"
        secondaryActions={[<button key="i">Import</button>]}
        primaryAction={<button>New lead</button>}
      />,
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Import", "New lead"]);
  });

  it("drops falsy actions instead of rendering empty slots", () => {
    // Callers gate actions on capability, so `cond && <Button/>` is the normal shape.
    // A false must not consume one of the two secondary slots.
    render(
      <WorkspaceHeader
        context="Operate"
        title="Reports"
        secondaryActions={[false && <button key="x">Hidden</button>, <button key="y">Shown</button>]}
      />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button").textContent).toBe("Shown");
  });

  it("offers a labelled way back from a detail page", () => {
    render(
      <WorkspaceHeader
        context="Convert"
        title="QT-1042"
        backHref={{ to: "/quotes", label: "All quotes" }}
      />,
    );

    const back = screen.getByRole("link", { name: "All quotes" });
    expect(back.getAttribute("href")).toBe("/quotes");
  });

  it("omits the optional regions entirely rather than leaving empty containers", () => {
    const { container } = render(<WorkspaceHeader context="Today" title="Revenue Desk" />);

    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    // An empty action row would still take vertical space and shift the title.
    expect(container.querySelectorAll("header > div > div")).toHaveLength(1);
  });
});
