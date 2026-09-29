import { describe, expect, it } from "vitest";
import {
  TaskCreateSchema,
  TaskMutationSchema,
  ApprovalAssignmentSchema,
  RequestQuoteApprovalSchema,
} from "../operations/input-schemas";
const ID = "11111111-1111-4111-8111-111111111111";
describe("text profile IDs at operation boundaries", () => {
  it.each(["demo-sales-user", "legacy|staff-42", ID])(
    "accepts profile %s for tasks and reviewers",
    (profileId) => {
      expect(
        TaskCreateSchema.parse({ title: "Synthetic task", assigned_to: profileId }).assigned_to,
      ).toBe(profileId);
      expect(
        TaskMutationSchema.parse({ id: ID, updates: { assigned_to: profileId } }).updates
          .assigned_to,
      ).toBe(profileId);
      expect(ApprovalAssignmentSchema.parse({ id: ID, assignedTo: profileId }).assignedTo).toBe(
        profileId,
      );
      expect(RequestQuoteApprovalSchema.parse({ id: ID, assignedTo: profileId }).assignedTo).toBe(
        profileId,
      );
    },
  );
  it.each(["", "   ", "x".repeat(256)])("rejects empty or oversized profile IDs", (profileId) => {
    expect(TaskCreateSchema.safeParse({ title: "Task", assigned_to: profileId }).success).toBe(
      false,
    );
    expect(ApprovalAssignmentSchema.safeParse({ id: ID, assignedTo: profileId }).success).toBe(
      false,
    );
  });
  it("retains nullable clears and UUID validation for business record IDs", () => {
    expect(
      TaskMutationSchema.parse({ id: ID, updates: { assigned_to: null } }).updates.assigned_to,
    ).toBeNull();
    expect(TaskCreateSchema.safeParse({ title: "Task", lead_id: "demo-sales-user" }).success).toBe(
      false,
    );
    expect(
      TaskMutationSchema.safeParse({ id: "demo-sales-user", updates: { status: "done" } }).success,
    ).toBe(false);
  });
});
