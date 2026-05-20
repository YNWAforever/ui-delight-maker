import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Bot, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { approvals } from "@/lib/mock-data";

export const Route = createFileRoute("/approvals")({
  head: () => ({
    meta: [
      { title: "Approvals — Fimmick ClientOps" },
      { name: "description", content: "Pending agent actions awaiting human approval." },
    ],
  }),
  component: ApprovalsInbox,
});

function ApprovalsInbox() {
  const pending = approvals.filter((a) => a.status === "pending");
  const decided = approvals.filter((a) => a.status !== "pending");

  return (
    <>
      <PageHeader
        title="Approval Inbox"
        description={`${pending.length} pending · ${decided.length} decided this week`}
      />

      <div className="space-y-6 px-6 py-6">
        <div className="space-y-4">
          {pending.map((a) => (
            <Card key={a.id}>
              <CardContent className="p-5">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{a.agent_name}</span>
                      <span className="rounded-md bg-secondary px-2 py-0.5 text-xs capitalize text-secondary-foreground">
                        {a.approval_type.replace(/_/g, " ")}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        conf {(a.confidence * 100).toFixed(0)}%
                      </span>
                      <StatusBadge value={a.status} />
                    </div>
                    <p className="mt-2 text-sm">{a.context_summary}</p>
                    <pre className="mt-3 max-h-40 overflow-auto rounded-md bg-muted/50 p-3 text-xs whitespace-pre-wrap text-muted-foreground">
                      {a.payload_preview}
                    </pre>
                    <Textarea
                      placeholder="Reviewer notes (optional)"
                      className="mt-3 h-20 text-sm"
                    />
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toast.message("Escalated to manager.")}
                  >
                    <AlertTriangle className="mr-2 h-4 w-4" /> Escalate
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toast.error("Request rejected.")}
                  >
                    <XCircle className="mr-2 h-4 w-4" /> Reject
                  </Button>
                  <Button size="sm" onClick={() => toast.success("Approved. Agent will proceed.")}>
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div>
          <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Recently decided
          </h2>
          <Card>
            <ul className="divide-y divide-border">
              {decided.map((a) => (
                <li key={a.id} className="flex items-center gap-3 p-4 text-sm">
                  <Bot className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{a.agent_name}</span>
                  <span className="text-muted-foreground">{a.context_summary}</span>
                  <StatusBadge value={a.status} className="ml-auto" />
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
