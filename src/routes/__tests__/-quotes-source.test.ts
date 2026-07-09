import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readRoute = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

describe("quote detail lifecycle source", () => {
  it("routes approval review edits through the dedicated approve-and-issue workflow", () => {
    const source = readRoute("quotes.$id.tsx");

    expect(source).toContain("approveAndIssueQuote");
    expect(source).toContain("await approveAndIssueQuote({");
    expect(source).not.toContain('updates: { line_items: editItems, total_value: totalValue, status: "sent" }');
  });

  it("does not expose a generic status advance helper backed by updateQuote", () => {
    const source = readRoute("quotes.$id.tsx");

    expect(source).toContain("approveQuote");
    expect(source).toContain("rejectQuote");
    expect(source).not.toContain("const advance = async");
    expect(source).not.toContain("updates: { status:");
  });

  it("saves review edits before every approve-and-issue path", () => {
    const source = readRoute("quotes.$id.tsx");

    expect(source).toContain("const saveEditableQuoteFields = async () =>");
    expect(source).toContain("const approveAndIssueReviewedQuote = async () =>");
    expect(source).toContain("await saveEditableQuoteFields();");
    expect(source).toContain("Approve & Issue");
  });
});

describe("quote creation source", () => {
  it("opens the created quote detail after submit", () => {
    const source = readRoute("quotes.new.tsx");

    expect(source).toContain("const quote = await createQuote({ data: payload });");
    expect(source).toContain('navigate({ to: "/quotes/$id", params: { id: quote.id } });');
  });
});
