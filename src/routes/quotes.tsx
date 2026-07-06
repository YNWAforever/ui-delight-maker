import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Archive, Copy, MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";

import { CommandHeader, MetricStrip, WorkSurfaceEmpty } from "@/components/sales";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrencyAmount, formatDate, formatHKD } from "@/lib/format";
import { getQuotes } from "@/server-functions/quotes";
import { USER_RECORD } from "@/lib/users";
import type { Quote } from "@/lib/types";

const userById = (id: string | null | undefined) =>
  id && USER_RECORD[id] ? { name: USER_RECORD[id] } : undefined;
// Lead names are not available here — show the lead ID directly
const leadById = (_id: string | null | undefined): { company_name: string } | undefined =>
  undefined;

export const Route = createFileRoute("/quotes")({
  loader: () => getQuotes({}),
  head: () => ({
    meta: [
      { title: "Quotes — Fimmick ClientOps" },
      { name: "description", content: "All quotes with status, value, and approval state." },
    ],
  }),
  component: QuotesPage,
});

const TABS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "pending_approval", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "sent", label: "Sent" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
];

function QuotesPage() {
  const loaderQuotes = Route.useLoaderData();
  const [rows, setRows] = useState<Quote[]>(loaderQuotes);
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    return rows.filter((q) => {
      if (tab !== "all" && q.status !== tab) return false;
      if (query && !`${q.number} ${q.lead_id}`.toLowerCase().includes(query.toLowerCase()))
        return false;
      return true;
    });
  }, [rows, tab, query]);

  const totals = useMemo(
    () => ({
      pipeline: rows
        .filter((q) => ["pending_approval", "sent", "viewed"].includes(q.status))
        .reduce((s, q) => s + (q.total_value ?? 0), 0),
      won: rows
        .filter((q) => q.status === "accepted")
        .reduce((s, q) => s + (q.total_value ?? 0), 0),
      draft: rows.filter((q) => q.status === "draft").reduce((s, q) => s + (q.total_value ?? 0), 0),
    }),
    [rows],
  );

  // Keep local-only duplicate / archive until a server fn is available
  const duplicate = (id: string) => {
    const q = rows.find((r) => r.id === id);
    if (!q) return;
    toast.success(`Duplicated ${q.number} (local preview — save to persist)`);
  };
  const archive = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    toast.message("Quote archived");
  };

  return (
    <>
      <CommandHeader
        title="Deal Desk"
        status="Convert"
        description={`${filtered.length} of ${rows.length} quotes across draft, approval, sent, and accepted states.`}
        actions={
          <Button size="sm" asChild>
            <Link to="/quotes/new">
              <Plus className="mr-2 h-4 w-4" /> New quote
            </Link>
          </Button>
        }
      />

      <div className="space-y-4 px-6 py-6">
        <MetricStrip
          metrics={[
            {
              label: "Active value",
              value: formatHKD(totals.pipeline),
              hint: "pending + sent + viewed",
            },
            { label: "Won", value: formatHKD(totals.won), hint: "accepted quotes" },
            { label: "Draft", value: formatHKD(totals.draft), hint: "not yet submitted" },
          ]}
          columns={3}
        />

        <Card className="min-w-0 p-3">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <Tabs value={tab} onValueChange={setTab} className="min-w-0 max-w-full">
              <div className="max-w-full overflow-x-auto pb-1">
                <TabsList className="w-max">
                  {TABS.map((t) => (
                    <TabsTrigger key={t.value} value={t.value}>
                      {t.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            </Tabs>
            <Input
              aria-label="Search quotes"
              name="quote-search"
              autoComplete="off"
              placeholder="Search number, lead…"
              className="h-9 max-w-xs"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <div className="min-w-0 max-w-full overflow-hidden">
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Quote</TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Valid until</TableHead>
                  <TableHead>Created by</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((q) => {
                  const lead = leadById(q.lead_id);
                  const creator = userById(q.created_by);
                  return (
                    <TableRow key={q.id}>
                      <TableCell>
                        <Link
                          to="/quotes/$id"
                          params={{ id: q.id }}
                          className="text-sm font-medium hover:text-primary hover:underline"
                        >
                          {q.number}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {q.line_items.length} line items
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{lead?.company_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{q.lead_id}</div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge value={q.status} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrencyAmount(q.total_value, q.currency)}
                      </TableCell>
                      <TableCell className="text-sm">{formatDate(q.valid_until)}</TableCell>
                      <TableCell className="text-sm">{creator?.name ?? "—"}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={`Open actions for ${q.number}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => duplicate(q.id)}>
                              <Copy className="mr-2 h-4 w-4" /> Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => archive(q.id)}>
                              <Archive className="mr-2 h-4 w-4" /> Archive
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="p-4">
                      <WorkSurfaceEmpty
                        title="No quotes match this deal desk view"
                        description="Change the status tab or create a new quote from an active lead."
                        action={
                          <Button size="sm" variant="outline" asChild>
                            <Link to="/quotes/new">Create quote</Link>
                          </Button>
                        }
                      />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </>
  );
}
