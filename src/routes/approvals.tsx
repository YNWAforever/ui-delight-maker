import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Bot, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { approvals as seedApprovals, type Approval, type ApprovalStatus } from "@/lib/mock-data";

export const Route = createFileRoute("/approvals")({
  head: () => ({
    meta: [
      { title: "Approvals — Fimmick ClientOps" },
      { name: "description", content: "Pending agent actions awaiting human approval." },
    ],
  }),
  component: ApprovalsInbox,
});

const SLA_HOURS = 4;
const NOW_MS = new Date("2026-05-20T10:00:00Z").getTime();

function slaChip(createdAt: string) {
  const elapsed = (NOW_MS - new Date(createdAt).getTime()) / 36e5;
  const remaining = SLA_HOURS - elapsed;
  if (remaining <= 0) return { text: "SLA breached", className: "bg-destructive/15 text-destructive" };
  if (remaining < 1) return { text: `${(remaining * 60).toFixed(0)}m left`, className: "bg-warning/15 text-warning-foreground" };
  return { text: `${remaining.toFixed(1)}h left`, className: "bg-info/10 text-info" };
}

function ApprovalsInbox() {
  const [rows, setRows] = useState<Approval[]>(seedApprovals);
  const [typeFilter, setTypeFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [bulk, setBulk] = useState<Set<string>>(new Set());

  const pending = useMemo(
    () =>
      rows
        .filter((a) => a.status === "pending")
        .filter((a) => typeFilter === "all" || a.approval_type === typeFilter)
        .filter((a) => agentFilter === "all" || a.agent_name === agentFilter),
    [rows, typeFilter, agentFilter],
  );
  const decided = rows.filter((a) => a.status !== "pending");
  const selected = pending.find((a) => a.id === selectedId) ?? pending[0];

  const decide = (id: string, status: ApprovalStatus, msg: string) => {
    setRows((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    toast.success(msg);
    setReason("");
  };

  const bulkApprove = () => {
    setRows((prev) =>
      prev.map((a) => (bulk.has(a.id) ? { ...a, status: "approved" as ApprovalStatus } : a)),
    );
    toast.success(`${bulk.size} approvals processed`);
    setBulk(new Set());
  };

  const agentNames = Array.from(new Set(rows.map((a) => a.agent_name)));

  return (
    <>
      <PageHeader
        title="Approval Inbox"
        description={`${pending.length} pending · ${decided.length} decided`}
      />

      <div className="space-y-4 px-6 py-6">
        <Card className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-9 w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="quote_send">Quote send</SelectItem>
                <SelectItem value="message_send">Message send</SelectItem>
                <SelectItem value="discount">Discount</SelectItem>
                <SelectItem value="scope_change">Scope change</SelectItem>
              </SelectContent>
            </Select>
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="h-9 w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All agents</SelectItem>
                {agentNames.map((n) => (
                  <SelectItem key={n} value={n}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {bulk.size > 0 && (
              <Button size="sm" className="ml-auto" onClick={bulkApprove}>
                <CheckCircle2 className="mr-2 h-4 w-4" /> Approve {bulk.size}
              </Button>
            )}
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-2">
            <ul className="divide-y divide-border">
              {pending.map((a) => {
                const sla = slaChip(a.created_at);
                return (
                  <li
                    key={a.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-2 p-4 transition-colors hover:bg-muted/40",
                      selected?.id === a.id && "bg-muted/50",
                    )}
                    onClick={() => setSelectedId(a.id)}
                  >
                    <Checkbox
                      checked={bulk.has(a.id)}
                      onCheckedChange={(v) => {
                        const next = new Set(bulk);
                        v ? next.add(a.id) : next.delete(a.id);
                        setBulk(next);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{a.agent_name}</span>
                        <span
                          className={cn(
                            "rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                            sla.className,
                          )}
                        >
                          {sla.text}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {a.context_summary}
                      </p>
                      <p className="mt-1 text-[10px] capitalize text-muted-foreground">
                        {a.approval_type.replace(/_/g, " ")} · conf {(a.confidence * 100).toFixed(0)}%
                      </p>
                    </div>
                  </li>
                );
              })}
              {pending.length === 0 && (
                <li className="p-6 text-center text-sm text-muted-foreground">
                  Nothing pending.
                </li>
              )}
            </ul>
          </Card>

          <div className="lg:col-span-3">
            {selected ? (
              <Card>
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Bot className="h-4 w-4" />
                    </div>
                    <span className="text-sm font-semibold">{selected.agent_name}</span>
                    <span className="rounded-md bg-secondary px-2 py-0.5 text-xs capitalize text-secondary-foreground">
                      {selected.approval_type.replace(/_/g, " ")}
                    </span>
                    <StatusBadge value={selected.status} />
                    <span className="ml-auto text-xs text-muted-foreground">
                      {formatDateTime(selected.created_at)}
                    </span>
                  </div>
                  <p className="mt-3 text-sm">{selected.context_summary}</p>
                  <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                    {selected.payload_preview}
                  </pre>
                  <Textarea
                    placeholder="Reviewer notes / reason for decision"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="mt-3 h-20 text-sm"
                  />
                  <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => decide(selected.id, "escalated", "Escalated to manager")}
                    >
                      <AlertTriangle className="mr-2 h-4 w-4" /> Escalate
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => decide(selected.id, "rejected", "Approval rejected")}
                    >
                      <XCircle className="mr-2 h-4 w-4" /> Reject
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => decide(selected.id, "approved", "Approved — agent will proceed")}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-10 text-center text-sm text-muted-foreground">
                  Select an approval on the left to review.
                </CardContent>
              </Card>
            )}
          </div>
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
                  <span className="truncate text-muted-foreground">{a.context_summary}</span>
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
