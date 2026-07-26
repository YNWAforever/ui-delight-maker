import { describe, expect, it } from "vitest";
import { crmQueryKeys } from "@/lib/query-keys";
import { getOperationalMutationKeys } from "@/lib/operational-invalidation";

describe("operational mutation invalidation", () => {
  it("targets task detail and lists for status changes", () => {
    expect(getOperationalMutationKeys({ type: "task-status", id: "task-1" })).toEqual([
      crmQueryKeys.tasks.detail("task-1"),
      crmQueryKeys.tasks.lists(),
    ]);
  });

  it("targets approval queues and AI review for decisions", () => {
    expect(getOperationalMutationKeys({ type: "approval-decision", id: "approval-1" })).toEqual([
      crmQueryKeys.approvals.detail("approval-1"),
      crmQueryKeys.approvals.lists(),
      crmQueryKeys.aiReview.all(),
    ]);
  });

  it("targets notification state without unrelated queues", () => {
    expect(getOperationalMutationKeys({ type: "notification-read", id: "notification-1" })).toEqual(
      [
        crmQueryKeys.notifications.detail("notification-1"),
        crmQueryKeys.notifications.lists(),
        crmQueryKeys.shell(),
      ],
    );
  });

  it("targets every agent history page, list, and AI review after agent runs change", () => {
    expect(getOperationalMutationKeys({ type: "agent-run", agent: "Renewal Risk Agent" })).toEqual([
      crmQueryKeys.agents.section("Renewal Risk Agent", "history"),
      crmQueryKeys.agents.lists(),
      crmQueryKeys.aiReview.all(),
    ]);
  });
});
