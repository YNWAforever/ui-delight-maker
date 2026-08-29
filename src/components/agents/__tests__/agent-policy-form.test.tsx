// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentPolicyForm } from "../agent-policy-form";

const AGENT = { workflow_type: "qualify_lead", status: "active", human_approval: false } as const;

const RESTORABLE_VERSION = {
  id: "v1",
  status: "inactive" as const,
  human_approval: true,
  reason: "vendor review",
  created_at: "2026-08-01T00:00:00.000Z",
  version_seq: "1",
  changed_by: "profile-1",
  changed_by_name: "Ada",
};

describe("AgentPolicyForm", () => {
  afterEach(() => cleanup());

  it("disables the controls and names the capability without agents.configure", () => {
    // Distinct from the Config tab this page lost, whose controls were enabled and did nothing.
    // A disabled control that says why is the opposite failure mode.
    render(
      <AgentPolicyForm
        agent={AGENT}
        versions={[]}
        capabilities={["agents.view"]}
        onSave={vi.fn()}
      />,
    );

    // No `@testing-library/jest-dom` in this codebase (only `dom`, `react` and `user-event`
    // are dependencies, and no other test uses `toBeDisabled`/`toBeInTheDocument`), so this
    // follows the existing convention instead — `.disabled` on the cast element
    // (`src/components/__tests__/list-pagination.test.tsx`) and `getByText` throwing if the
    // capability name is not on the page.
    expect((screen.getByRole("button", { name: /save/i }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByText(/agents\.configure/)).toBeTruthy();
  });

  it("enables the controls with agents.configure", () => {
    render(
      <AgentPolicyForm
        agent={AGENT}
        versions={[]}
        capabilities={["agents.view", "agents.configure"]}
        onSave={vi.fn()}
      />,
    );

    expect((screen.getByRole("button", { name: /save/i }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("shows the current effective values, not the code defaults", () => {
    // qualify_lead's code default is active/false. The form must open showing what actually
    // governs, or an administrator edits from a starting point that is already wrong.
    render(
      <AgentPolicyForm
        agent={{ ...AGENT, status: "inactive" }}
        versions={[]}
        capabilities={["agents.view", "agents.configure"]}
        onSave={vi.fn()}
      />,
    );

    // The status control is a Radix Select, a button-role combobox rather than a native
    // <select>, so `toHaveValue` does not apply to it (jest-dom's `toHaveValue` only supports
    // form elements with a real `.value` property, and a Radix Select trigger is a <button>).
    // `src/components/sales/filter-toolbar.tsx` exposes its Select the same way (an
    // `aria-label` on the trigger, matched by `getByLabelText` too since it also queries the
    // `aria-label` attribute) and its test (`filter-toolbar.test.tsx`) asserts on the
    // combobox's `textContent` instead — that is the codebase's established way of reading a
    // Radix Select's displayed value, so this follows it rather than weakening the assertion.
    const statusControl = screen.getByLabelText(/status/i);
    expect(statusControl.textContent).toContain("Inactive");
  });

  it("Restore fills the form from that version and writes nothing by itself", async () => {
    // Rollback shares one write path with every other change: Restore only populates the form,
    // and the administrator saves. So it cannot bypass the capability check or skip the reason,
    // and it cannot drift from the path it shares.
    const onSave = vi.fn();
    const actor = userEvent.setup();
    render(
      <AgentPolicyForm
        agent={{ workflow_type: "qualify_lead", status: "active", human_approval: false }}
        versions={[RESTORABLE_VERSION]}
        capabilities={["agents.view", "agents.configure"]}
        onSave={onSave}
      />,
    );

    await actor.click(screen.getByRole("button", { name: /restore/i }));

    expect(screen.getByLabelText(/status/i).textContent).toContain("Inactive");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("Restore is disabled without agents.configure", () => {
    // A restore that a viewer can trigger would populate a form they cannot submit, which is
    // a smaller lie but still one.
    render(
      <AgentPolicyForm
        agent={AGENT}
        versions={[RESTORABLE_VERSION]}
        capabilities={["agents.view"]}
        onSave={vi.fn()}
      />,
    );

    expect((screen.getByRole("button", { name: /restore/i }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
