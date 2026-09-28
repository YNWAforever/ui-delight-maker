import { z } from "zod";

const ids = z
  .array(z.string().min(1).max(128))
  .min(1)
  .max(100)
  .refine((values) => new Set(values).size === values.length, "Bulk IDs must be distinct");

export const BulkActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("task.assign"), profileId: z.string().min(1) }),
  z.object({ type: z.literal("task.due"), dueDate: z.iso.date().nullable() }),
  z.object({ type: z.literal("task.priority"), priority: z.enum(["low", "medium", "high"]) }),
  z.object({ type: z.literal("task.status"), status: z.enum(["open", "in_progress", "done"]) }),
  z.object({
    type: z.literal("approval.decide"),
    decision: z.enum(["approved", "rejected"]),
    notes: z.string().max(2000).optional(),
  }),
  z.object({ type: z.literal("approval.assign"), profileId: z.string().min(1).nullable() }),
  z.object({
    type: z.literal("team.add_member"),
    teamId: z.uuid(),
    startsAt: z.iso.datetime().nullable().optional(),
    endsAt: z.iso.datetime().nullable().optional(),
  }),
  z.object({ type: z.literal("lead.assign"), profileId: z.string().min(1) }),
  z.object({ type: z.literal("lead.status"), status: z.enum(["qualified", "lost"]) }),
]);
export const BulkPreviewRequestSchema = z.object({ action: BulkActionSchema, ids });
export const BulkCommitRequestSchema = z.object({
  previewToken: z.uuid(),
  idempotencyKey: z.uuid(),
});
export const BulkResumeRequestSchema = z.object({ operationId: z.uuid() });

export type BulkAction = z.infer<typeof BulkActionSchema>;
export type BulkPreviewRequest = z.infer<typeof BulkPreviewRequestSchema>;
export type BulkItemStatus = "succeeded" | "failed" | "forbidden" | "stale" | "not_found";
export type BulkItemResult = {
  id: string;
  status: BulkItemStatus;
  code?: string;
  message?: string;
  retryable: boolean;
  resultingVersion?: number;
};
export type BulkResult = {
  operationId: string;
  state: "paused" | "running" | "completed";
  processed: number;
  total: number;
  /** All non-success IDs, including pending and terminal failures, for refresh recovery. */
  remainingIds: string[];
  results: BulkItemResult[];
};
export type BulkPreview = {
  operationId: string;
  token: string;
  expiresAt: string;
  rows: Array<{
    id: string;
    eligible: boolean;
    summary: string | null;
    expectedVersion: number | null;
  }>;
  eligibleCount: number;
};
