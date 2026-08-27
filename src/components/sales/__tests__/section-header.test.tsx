// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { SectionHeader } from "../section-header";

afterEach(cleanup);

describe("SectionHeader", () => {
  it("opens a section at level two, never competing with the page's h1", () => {
    // WorkspaceHeader owns the page's only h1. If a section title could be an h1 too, a
    // workspace with three sections would announce four page titles.
    render(<SectionHeader title="Renewals due" description="Next 30 days." />);

    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.textContent).toBe("Renewals due");
  });

  it("omits the description and action entirely rather than reserving empty slots", () => {
    // A blank <p> and an empty action div still occupy vertical space, which is how a
    // column of sections ends up unevenly spaced for no visible reason.
    const { container } = render(<SectionHeader title="Contacts" />);

    expect(container.querySelectorAll("p")).toHaveLength(0);
    expect(container.querySelectorAll("div")).toHaveLength(2); // wrapper + title column
  });

  it("renders the section's single action alongside the title", () => {
    render(<SectionHeader title="Contacts" action={<button type="button">Add contact</button>} />);

    expect(screen.getByRole("button", { name: "Add contact" })).toBeDefined();
  });
});
