import { useMemo, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Bot, CheckCircle2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { CommandHeader, MetricStrip, WorkSurfaceEmpty } from "@/components/sales";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime, formatPercent } from "@/lib/format";
import type { HumanApproval } from "@/lib/types";
import { cn } from "@/lib/utils";
import { getAgentRuns } from "@/server-functions/agent-runs";
import { decideApproval, getApprovals } from "@/server-functions/approvals";

export const Route = createFileRoute("/ai-review")({
  loader: async () => {
    const [approvals, agentRuns] = await Promise.all([getApprovals({}), getAgentRuns({})]);
    return { approvals, agentRuns };
  },
  head: () => ({
    meta: [
      { title: "AI Review - Fimmick ClientOps" },
      { name: "description", content: "Human review queue for AI-generated sales work." },
    ],
  }),
  component: AiReviewPage,
});

function AiReviewPage() {
  const { approvals, agentRuns } = Route.useLoaderData();
  const router = useRouter();
  const pending = approvals.filter((approval) => approval.status === "pending");
  const humanReviewRuns = agentRuns.filter((run) => run.human_review_required);
  const [selectedId, setSelectedId] = useState<string | null>(pending[0]?.id ?? null);
  const [notes, setNotes] = useState("");
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const selected = useMemo(
    () => pending.find((approval) => approval.id === selectedId) ?? pending[0] ?? null,
    [pending, selectedId],
  );
  const isSubmitting = submittingId != null;

  const decide = async (
    approval: HumanApproval,
    decision: "approved" | "rejected" | "escalated",
  ) => {
    if (submittingId) return;

    setSubmittingId(approval.id);

    try {
      await decideApproval({ data: { id: approval.id, decision, notes: notes || undefined } });
      await router.invalidate();
      toast.success(decision === "approved" ? "AI action approved" : "AI action updated");
      setNotes("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update AI action");
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <>
      <CommandHeader
        title="AI Review"
        status="Acquire"
        description={`${pending.length} AI-generated sales actions need human judgment before they move forward.`}
        actions={
          <Button size="sm" variant="outline" onClick={() => router.invalidate()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        }
      />

      <div className="space-y-4 px-6 py-6">
        <MetricStrip
          metrics={[
            { label: "Pending review", value: pending.length, hint: "approval requests" },
            {
              label: "Human-review runs",
              value: humanReviewRuns.length,
              hint: "agent outputs flagged",
            },
            {
              label: "Avg confidence",
              value: formatPercent(
                humanReviewRuns.length
                  ? humanReviewRuns.reduce((sum, run) => sum + (run.confidence_score ?? 0), 0) /
                      humanReviewRuns.length
                  : null,
              ),
              hint: "flagged runs",
            },
          ]}
          columns={3}
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <Card>
            {pending.length === 0 ? (
              <div className="p-4">
                <WorkSurfaceEmpty
                  title="No AI work waiting"
                  description="Qualification reviews, quote sends, and message approvals will appear here."
                  action={
                    <Button size="sm" variant="outline" asChild>
                      <Link to="/agents">Open Agent Monitor</Link>
                    </Button>
                  }
                />
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {pending.map((approval) => {
                  const isSelected = selected?.id === approval.id;

                  return (
                    <li key={approval.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(approval.id);
                          setNotes("");
                        }}
                        aria-pressed={selected?.id === approval.id}
                        className={cn(
                          "block w-full px-4 py-3 text-left transition-colors hover:bg-muted/40",
                          isSelected && "bg-primary/5 ring-1 ring-inset ring-primary/20",
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-medium">
                            {approval.approval_type?.replace(/_/g, " ") ?? "AI review"}
                          </p>
                          <StatusBadge value={approval.status} />
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {approval.context_summary ?? "Review agent-proposed action."}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardContent className="p-5">
              {selected ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold">
                        {selected.approval_type?.replace(/_/g, " ") ?? "AI review"}
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        Requested {formatDateTime(selected.created_at)}
                      </p>
                    </div>
                    <StatusBadge value={selected.status} className="ml-auto" />
                  </div>

                  <p className="break-words text-sm">
                    {selected.context_summary ?? "No summary provided."}
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="reviewer-notes">Reviewer notes</Label>
                    <Textarea
                      id="reviewer-notes"
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Reviewer notes"
                      className="h-24"
                    />
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isSubmitting}
                      onClick={() => decide(selected, "escalated")}
                    >
                      Request changes
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isSubmitting}
                      onClick={() => decide(selected, "rejected")}
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      disabled={isSubmitting}
                      onClick={() => decide(selected, "approved")}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
                    </Button>
                  </div>
                </div>
              ) : (
                <WorkSurfaceEmpty
                  title="Select an AI review item"
                  description="Choose a pending item to inspect the proposed action and decide what happens next."
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
