// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { StickyActionBar } from "../sticky-action-bar";

afterEach(cleanup);

describe("StickyActionBar", () => {
  it("pins to the viewport on a phone and returns to document flow from md up", () => {
    // The whole reason this component exists: a quote editor is taller than a phone
    // screen, so a Save button at the end of the document is a scroll away from every
    // field being edited. On a desktop there is no such pressure, and a permanently
    // pinned bar would just eat height — so the pinning is undone at md, not kept.
    const { container } = render(
      <StickyActionBar>
        <button type="button">Save</button>
      </StickyActionBar>,
    );

    const bar = container.firstElementChild;
    expect(bar?.className).toContain("sticky bottom-0");
    expect(bar?.className).toContain("md:static");
  });

  it("clears the iOS home indicator with the safe-area inset", () => {
    // Without this the last few pixels of the button sit under the system gesture area
    // and the tap lands on the OS instead of the app — invisible on every desktop and on
    // every simulator without a home indicator.
    const { container } = render(
      <StickyActionBar>
        <button type="button">Save</button>
      </StickyActionBar>,
    );

    expect(container.firstElementChild?.className).toContain("env(safe-area-inset-bottom)");
  });

  it("styles the bar with classes only, so the global reduced-motion and theme rules reach it", () => {
    // An inline style attribute is unreachable by the prefers-reduced-motion and theme
    // layers in styles.css. Utilities are how those rules keep working.
    const { container } = render(
      <StickyActionBar>
        <button type="button">Save</button>
      </StickyActionBar>,
    );

    expect(container.firstElementChild?.getAttribute("style")).toBeNull();
  });

  it("renders the actions it is given, in the order given", () => {
    render(
      <StickyActionBar>
        <button type="button">Cancel</button>
        <button type="button">Save</button>
      </StickyActionBar>,
    );

    // Primary-last is the caller's contract, matching WorkspaceHeader; the bar must not
    // reorder what it is handed.
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Cancel",
      "Save",
    ]);
  });
});
