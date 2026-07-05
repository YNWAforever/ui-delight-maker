import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const aiReviewSource = readFileSync(new URL("../ai-review.tsx", import.meta.url), "utf8");

describe("AI Review route source", () => {
  it("clears reviewer notes when changing approval selection", () => {
    expect(aiReviewSource).toMatch(
      /onClick=\{\(\) => \{\s*setSelectedId\(approval\.id\);\s*setNotes\(""\);\s*\}\}/,
    );
  });

  it("guards approval decisions while submitting and reports failures", () => {
    expect(aiReviewSource).toContain(
      "const [submittingId, setSubmittingId] = useState<string | null>(null);",
    );
    expect(aiReviewSource).toMatch(
      /setSubmittingId\(approval\.id\);[\s\S]*try \{[\s\S]*await decideApproval[\s\S]*await router\.invalidate\(\);[\s\S]*catch[\s\S]*toast\.error[\s\S]*finally \{[\s\S]*setSubmittingId\(null\);/,
    );

    const disabledDecisionButtons = aiReviewSource.match(/disabled=\{isSubmitting\}/g) ?? [];
    expect(disabledDecisionButtons).toHaveLength(3);
  });

  it("labels reviewer notes and improves selected item semantics", () => {
    expect(aiReviewSource).toContain('import { Label } from "@/components/ui/label";');
    expect(aiReviewSource).toContain('<Label htmlFor="reviewer-notes">Reviewer notes</Label>');
    expect(aiReviewSource).toContain('id="reviewer-notes"');
    expect(aiReviewSource).toContain("aria-pressed={selected?.id === approval.id}");
    expect(aiReviewSource).toContain("break-words text-sm");
  });
});
