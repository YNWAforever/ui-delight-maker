// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { AiSalesDesk } from "../ai-sales-desk";
import type { Lead } from "@/lib/types";

const lead: Lead = {
  id: "lead-1",
  contact_id: null,
  account_id: null,
  source_campaign_id: null,
  campaign_member_id: null,
  company_name: "Northstar Retail",
  contact_name: "Ada Chan",
  contact_email: "ada@northstar.example",
  contact_phone: null,
  source: "website",
  status: "new",
  assigned_to: null,
  lead_score: 64,
  qualification_data: null,
  enquiry_text: "Needs a retainer",
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
};

const agentActions = ["Qualify", "Draft reply", "Draft quote"] as const;

afterEach(cleanup);

describe("AiSalesDesk", () => {
  it("greys every agent action while one dispatch is in flight", () => {
    // The three actions share a single in-flight lock in the route, because all three
    // create an agent_runs row for this same lead. If only the pressed button greyed out,
    // the other two would still be live and would each bill another n8n execution.
    const handlers = {
      onQualify: vi.fn(),
      onDraftReply: vi.fn(),
      onDraftQuote: vi.fn(),
    };
    render(<AiSalesDesk lead={lead} approvals={[]} agentRuns={[]} pending {...handlers} />);

    for (const name of agentActions) {
      const control = screen.getByRole("button", { name });
      expect(control.hasAttribute("disabled")).toBe(true);
      fireEvent.click(control);
    }

    expect(handlers.onQualify).not.toHaveBeenCalled();
    expect(handlers.onDraftReply).not.toHaveBeenCalled();
    expect(handlers.onDraftQuote).not.toHaveBeenCalled();
  });

  it("leaves all three live when nothing is dispatching", () => {
    const handlers = {
      onQualify: vi.fn(),
      onDraftReply: vi.fn(),
      onDraftQuote: vi.fn(),
    };
    render(<AiSalesDesk lead={lead} approvals={[]} agentRuns={[]} {...handlers} />);

    for (const name of agentActions) {
      fireEvent.click(screen.getByRole("button", { name }));
    }

    expect(handlers.onQualify).toHaveBeenCalledOnce();
    expect(handlers.onDraftReply).toHaveBeenCalledOnce();
    expect(handlers.onDraftQuote).toHaveBeenCalledOnce();
  });

  it("offers no control that has no server path behind it", () => {
    // "Summarize" was removed rather than disabled: there is no summarization server
    // function, workflow or webhook at any layer, so the button could only ever fail.
    render(
      <AiSalesDesk
        lead={lead}
        approvals={[]}
        agentRuns={[]}
        onQualify={vi.fn()}
        onDraftReply={vi.fn()}
        onDraftQuote={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([...agentActions]);
  });
});
