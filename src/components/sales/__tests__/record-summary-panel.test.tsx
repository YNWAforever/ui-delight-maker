// @vitest-environment jsdom

import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RecordSummaryPanel } from "../record-summary-panel";

afterEach(cleanup);

function Harness() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open summary
      </button>
      <button type="button">Somewhere else</button>
      <RecordSummaryPanel
        open={open}
        onOpenChange={setOpen}
        title="Acme Media"
        subtitle="Quote QT-1042"
        sections={[
          { id: "owner", title: "Owner", content: "Ada Wong" },
          { id: "value", title: "Value", content: "HKD 84,000" },
        ]}
      />
    </>
  );
}

// Radix's pointer-events guard on the body is what user-event's default check trips on;
// it is a modal-dialog implementation detail, not the behaviour under test.
const actor = () => userEvent.setup({ pointerEventsCheck: 0 });

describe("RecordSummaryPanel", () => {
  it("returns focus to the control that opened it", async () => {
    // A summary panel is opened from a row in a list the user is working down. If closing
    // it drops focus to the top of the document, a keyboard user loses their place in the
    // list every single time — and nobody testing with a mouse ever notices.
    const user = actor();
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: "Open summary" });
    await user.click(trigger);

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(trigger).not.toBe(document.activeElement);

    await user.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("returns focus to the trigger when dismissed with Escape too", async () => {
    // Escape is the shortest way out of a panel, so it must not be the one path that
    // strands focus.
    const user = actor();
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: "Open summary" });
    await user.click(trigger);
    await screen.findByRole("dialog");

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("names the panel after the record and labels each section", async () => {
    const user = actor();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Open summary" }));

    const panel = await screen.findByRole("dialog", { name: "Acme Media" });
    expect(panel).toBeTruthy();

    // Sections are real labelled regions, not styled divs, so a screen-reader user can
    // jump between them instead of reading the panel top to bottom.
    expect(screen.getByRole("region", { name: "Owner" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Value" })).toBeTruthy();
  });

  it("reports closing to the caller instead of closing itself", async () => {
    // The panel is controlled: the route owns `open` so it can stay in step with the URL
    // and with which row is selected.
    const user = actor();
    render(
      <RecordSummaryPanel
        open
        onOpenChange={() => {}}
        title="Acme Media"
        sections={[{ id: "owner", title: "Owner", content: "Ada Wong" }]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Close" }));

    // onOpenChange did nothing, so the panel is still open — it never closes on its own.
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
