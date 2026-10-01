import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseOperationInput, OperationError } from "@/lib/operations/errors";
import {
  ApprovalDecisionSchema,
  ImportRowsSchema,
  JobSheetMutationSchema,
  QuoteMutationSchema,
  TaskCreateSchema,
} from "@/lib/operations/input-schemas";
import { toSafeErrorMessage } from "@/lib/errors";

function invalid(schema: z.ZodType, data: unknown) {
  try {
    parseOperationInput(schema, data);
    throw new Error("Expected validation failure");
  } catch (error) {
    expect(error).toBeInstanceOf(OperationError);
    return error as OperationError;
  }
}

describe("localized safe write validation across the error transport", () => {
  it("keeps an impossible Due date locatable after custom error fields are stripped", () => {
    const error = invalid(TaskCreateSchema, { title: "Retained draft", due_date: "2026-02-30" });
    expect(error.fieldErrors.due_date).toBeDefined();
    expect(toSafeErrorMessage(new Error(error.message))).toBe("Invalid input. Check Due date.");
  });
  it("names only the known Title and Priority fields without echoing their values", () => {
    const error = invalid(TaskCreateSchema, { title: "", priority: "private-value" });
    expect(toSafeErrorMessage(new Error(error.message))).toBe(
      "Invalid input. Check Title, Priority.",
    );
    expect(error.message).not.toContain("private-value");
  });
  it("locates a nested commercial Total value while retaining the machine field path", () => {
    const error = invalid(QuoteMutationSchema, {
      id: "11111111-1111-4111-8111-111111111111",
      updates: { total_value: 1.234 },
    });
    expect(error.fieldErrors["updates.total_value"]).toBeDefined();
    expect(toSafeErrorMessage(new Error(error.message))).toBe("Invalid input. Check Total value.");
  });
  it("locates decision and notes without exposing untrusted enum/notes contents", () => {
    const error = invalid(ApprovalDecisionSchema, {
      id: "11111111-1111-4111-8111-111111111111",
      decision: "private-decision",
      notes: "x".repeat(10001),
    });
    expect(error.message).toBe("Invalid input. Check Decision, Notes.");
  });
  it("names an invalid portion invoice date without printing raw object paths", () => {
    const error = invalid(JobSheetMutationSchema, {
      id: "11111111-1111-4111-8111-111111111111",
      portions: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Synthetic portion",
          source_quote_line_item_ids: [],
          description: "",
          amount: 10,
          currency: "HKD",
          target_invoice_date: "2026-02-30",
          billing_type: "final",
          status: "planned",
          sort_order: 0,
        },
      ],
    });
    expect(error.message).toBe("Invalid input. Check Portion 1: Invoice date.");
  });
  it("identifies the specific quote line item using a bounded user-facing row number", () => {
    const error = invalid(QuoteMutationSchema, {
      id: "11111111-1111-4111-8111-111111111111",
      updates: {
        line_items: [
          { id: "li-1", service: "Synthetic", description: "", qty: 1, unit_price: 10 },
          { id: "li-2", service: "Synthetic", description: "", qty: 1, unit_price: 1.234 },
        ],
      },
    });
    expect(error.message).toBe("Invalid input. Check Line item 2: Unit price.");
  });
  it("names the row collection when an import exceeds its existing limit", () => {
    const error = invalid(ImportRowsSchema, {
      rows: Array.from({ length: 5001 }, () => ({ company_name: "Synthetic" })),
    });
    expect(error.message).toBe("Invalid input. Check Import rows.");
  });
  it("does not echo unknown keys or custom schema messages", () => {
    const schema = z.strictObject({
      title: z.string().refine(() => false, { message: "postgres://private-host/secret" }),
    });
    const error = invalid(schema, { title: "private-value", "private-key": "private-value" });
    expect(error.message).toBe("Invalid input. Check Title.");
    expect(error.message).not.toMatch(/private|postgres|secret/);
  });
  it("uses a safe fallback for entirely unrecognized paths", () => {
    const error = invalid(z.strictObject({ privateKey: z.string().min(1) }), { privateKey: "" });
    expect(error.message).toBe("Invalid input. Check the entered values.");
  });
  it("deduplicates and caps displayed fields while keeping all server field errors", () => {
    const schema = z.strictObject({
      title: z.string().min(1),
      priority: z.string().min(1),
      notes: z.string().min(1),
      reason: z.string().min(1),
    });
    const error = invalid(schema, { title: "", priority: "", notes: "", reason: "" });
    expect(error.message).toBe("Invalid input. Check Title, Priority, Notes.");
    expect(Object.keys(error.fieldErrors)).toHaveLength(4);
  });
});
