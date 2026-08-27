import { Bot, FileText, Send, Sparkles } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getLeadAiState, getLeadPendingApprovals } from "@/lib/pipeline";
import type { AgentRun, HumanApproval, Lead } from "@/lib/types";

/**
 * "Summarize" used to be the fourth button here. It is gone rather than disabled: a
 * timeline summary has no server path at any layer — no `summar*` export in
 * `src/server-functions/`, no workflow JSON, no webhook env var — and the panel already
 * renders the real timeline two cards below, so nothing is lost by removing it. A control
 * that can never do anything is not a "coming soon", it is a dead end that costs a click.
 */
interface AiSalesDeskProps {
  lead: Lead;
  approvals: HumanApproval[];
  agentRuns: AgentRun[];
  /** True while any AI dispatch for this lead is in flight. Blocks a second dispatch. */
  pending?: boolean;
  onQualify: () => void;
  onDraftReply: () => void;
  onDraftQuote: () => void;
}

export function AiSalesDesk({
  lead,
  approvals,
  agentRuns,
  pending = false,
  onQualify,
  onDraftReply,
  onDraftQuote,
}: AiSalesDeskProps) {
  const aiState = getLeadAiState(lead, approvals, agentRuns);
  const pendingApprovals = getLeadPendingApprovals(lead, approvals);

  return (
    <Card className="rounded-md">
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4 text-primary" />
            AI Sales Desk
          </CardTitle>
          <StatusBadge
            value={aiState.state === "ready_for_review" ? "waiting_approval" : aiState.state}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {pendingApprovals.length > 0 && (
          <div className="rounded-md border border-info/30 bg-info/10 p-3 text-xs text-info">
            {pendingApprovals.length} approval request
            {pendingApprovals.length > 1 ? "s" : ""} ready for review.
          </div>
        )}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onQualify}>
            <Sparkles className="mr-2 h-4 w-4" />
            Qualify
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={onDraftReply}
          >
            <Send className="mr-2 h-4 w-4" />
            Draft reply
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={onDraftQuote}
          >
            <FileText className="mr-2 h-4 w-4" />
            Draft quote
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
