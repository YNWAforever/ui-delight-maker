import { describe, expect, it } from "vitest";
import { normalizeQualificationData } from "@/lib/workflows/qualification";

/**
 * `qualification_data` is free-form model output. The n8n workflow takes it whole whenever it is
 * a plain object — its `safeJsonValue` bounds depth and size but checks no field — so the shapes
 * below are all things that could reach the database, and did: the lead Insights tab read
 * `.service_interest.map(...)` off the column and threw during render, taking the whole page
 * down rather than degrading one panel.
 */
describe("normalizeQualificationData", () => {
  it("passes a well-formed qualification through unchanged", () => {
    const valid = {
      urgency_score: 8,
      fit_score: 7,
      qualification_score: 75,
      service_interest: ["CRM", "AI"],
      budget_range: "HKD 50k-200k",
      next_action: "Schedule discovery call",
      reason: "Strong fit",
      confidence: 0.82,
      human_review_required: false,
    };

    expect(normalizeQualificationData(valid)).toEqual(valid);
  });

  it.each([
    ["an object with none of the fields", { notes: "looks good" }],
    ["a bare string", "looks good"],
    ["a number", 42],
    ["an array", ["CRM"]],
    ["null", null],
    ["undefined", undefined],
  ])("returns a renderable qualification for %s", (_label, input) => {
    const result = normalizeQualificationData(input);

    // The property the Insights tab depends on: every field is present and of the right type,
    // so no reader has to guard individually.
    expect(Array.isArray(result.service_interest)).toBe(true);
    expect(typeof result.budget_range).toBe("string");
    expect(typeof result.reason).toBe("string");
    expect(Number.isFinite(result.urgency_score)).toBe(true);
    expect(Number.isFinite(result.fit_score)).toBe(true);
    expect(Number.isFinite(result.qualification_score)).toBe(true);
    expect(Number.isFinite(result.confidence)).toBe(true);
    expect(typeof result.human_review_required).toBe("boolean");
    expect(() => result.service_interest.map((entry) => entry)).not.toThrow();
    expect(() => (result.confidence * 100).toFixed(0)).not.toThrow();
  });

  it("keeps only the string entries of a mixed service_interest array", () => {
    expect(
      normalizeQualificationData({ service_interest: ["CRM", 7, null, "AI", { a: 1 }] })
        .service_interest,
    ).toEqual(["CRM", "AI"]);
  });

  it("clamps scores into the ranges the UI renders them against", () => {
    // The tab prints "{urgency_score} / 10" and "{qualification_score} / 100", so a model
    // returning 9000 would render "9000 / 10".
    const result = normalizeQualificationData({
      urgency_score: 9000,
      fit_score: -4,
      qualification_score: 1000,
      confidence: 12,
    });

    expect(result.urgency_score).toBe(10);
    expect(result.fit_score).toBe(0);
    expect(result.qualification_score).toBe(100);
    expect(result.confidence).toBe(1);
  });

  it("coerces numeric strings, which JSON from a model routinely carries", () => {
    expect(normalizeQualificationData({ urgency_score: "8", confidence: "0.5" })).toMatchObject({
      urgency_score: 8,
      confidence: 0.5,
    });
  });

  it("falls back to a known next action rather than echoing an unknown one", () => {
    expect(normalizeQualificationData({ next_action: "Fire the client" }).next_action).toBe(
      "Request more info",
    );
    expect(normalizeQualificationData({ next_action: "Disqualify" }).next_action).toBe(
      "Disqualify",
    );
  });

  it("requires human review when the model did not say either way", () => {
    // The one field that defaults to the cautious value: every other field degrades to something
    // harmless, this one decides whether a person looks at the result.
    expect(normalizeQualificationData({}).human_review_required).toBe(true);
    expect(normalizeQualificationData({ human_review_required: "no" }).human_review_required).toBe(
      true,
    );
    expect(normalizeQualificationData({ human_review_required: false }).human_review_required).toBe(
      false,
    );
  });
});
