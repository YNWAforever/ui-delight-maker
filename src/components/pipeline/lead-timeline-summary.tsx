import { useEffect, useState } from "react";
import { AlertTriangle, ListChecks } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useClientNow } from "@/hooks/use-client-now";
import { toSafeErrorMessage } from "@/lib/errors";
import { formatCount, formatDateTime, relativeTime } from "@/lib/format";
import { getLeadTimelineSummary } from "@/server-functions/leads";
import type { LeadTimelineSummary } from "@/server/read-models/lead-timeline";

/**
 * Three states, deliberately unalike.
 *
 * `loaded` with `total: 0` is a real answer — the lead has no recorded activity — and must
 * never render like `failed`, which means the rollup did not run. The control this replaces
 * toasted "not connected yet" and summarised nothing; collapsing "nothing happened" into
 * "we could not tell you" would reproduce exactly the defect it was removed for.
 */
type SummaryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; summary: LeadTimelineSummary }
  | { status: "failed"; message: string };

/**
 * A deterministic rollup of what has happened on a lead, fetched on demand.
 *
 * On demand, never in the route loader: the Revenue Desk renders a card per lead and its
 * budget is `maxQueries: 8`, so a board of twenty leads must not cost twenty extra queries
 * on load. The summary is a count, not prose — no LLM, no dispatch, no agent run — so it is
 * gated on `leads.view` like every other lead read.
 */
export function LeadTimelineSummaryCard({ leadId }: { leadId: string }) {
  const [state, setState] = useState<SummaryState>({ status: "idle" });
  const now = useClientNow();

  useEffect(() => {
    // A summary belongs to the lead it was fetched for. The preview panel swaps leads in
    // place, so without this reset the previous lead's counts would sit under a new name.
    setState({ status: "idle" });
  }, [leadId]);

  const load = async () => {
    setState({ status: "loading" });
    try {
      const summary = await getLeadTimelineSummary({ data: { leadId } });
      setState({ status: "loaded", summary });
    } catch (error) {
      setState({ status: "failed", message: toSafeErrorMessage(error) });
    }
  };

  return (
    <Card className="rounded-md">
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-4 w-4 text-primary" />
            Timeline summary
          </CardTitle>
          {/* Not in the failed state: the retry lives beside the message that explains it. */}
          {(state.status === "idle" || state.status === "loaded") && (
            <Button type="button" variant="outline" size="sm" onClick={load}>
              {state.status === "idle" ? "Summarise" : "Refresh"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {state.status === "idle" && (
          <p className="text-muted-foreground">
            Count every recorded activity on this lead, grouped by what happened.
          </p>
        )}

        {state.status === "loading" && <p className="text-muted-foreground">Summarising…</p>}

        {state.status === "failed" && (
          <div className="space-y-2">
            <p className="flex items-start gap-2 text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{state.message}</span>
            </p>
            <Button type="button" variant="outline" size="sm" onClick={load}>
              Try again
            </Button>
          </div>
        )}

        {/*
          Emptiness is an answer, not a failure, and says so in its own words. "No summary
          available" would claim the summariser broke on a lead that simply has no history.
        */}
        {state.status === "loaded" && state.summary.total === 0 && (
          <p className="text-muted-foreground">No recorded activity yet.</p>
        )}

        {state.status === "loaded" && state.summary.total > 0 && (
          <div className="space-y-3">
            <p>
              <span className="font-medium tabular-nums">{formatCount(state.summary.total)}</span>{" "}
              recorded {state.summary.total === 1 ? "activity" : "activities"}
              {state.summary.lastActivityAt && (
                <>
                  {", last "}
                  {/*
                    `now` is null until mount, so server and first client render both emit
                    the absolute timestamp and hydration stays stable.
                  */}
                  <span className="text-muted-foreground">
                    {now === null
                      ? formatDateTime(state.summary.lastActivityAt)
                      : relativeTime(state.summary.lastActivityAt, now)}
                  </span>
                </>
              )}
              .
            </p>
            <ul className="space-y-1.5">
              {state.summary.byAction.map((entry) => (
                <li key={entry.action} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate">{entry.action}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    <span className="font-medium tabular-nums text-foreground">
                      {formatCount(entry.count)}
                    </span>{" "}
                    ·{" "}
                    {now === null ? formatDateTime(entry.lastAt) : relativeTime(entry.lastAt, now)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
