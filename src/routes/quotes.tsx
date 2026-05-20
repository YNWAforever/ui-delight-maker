import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Archive, Copy, Plus } from "lucide-react";
import { toast } from "sonner";

import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatHKD } from "@/lib/format";
import { leadById, quotes as seedQuotes, userById, type QuoteStatus } from "@/lib/mock-data";
import { MoreHorizontal } from "lucide-react";

export const Route = createFileRoute("/quotes")({
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
  const [rows, setRows] = useState(seedQuotes);
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
        .reduce((s, q) => s + q.total_value, 0),
      won: rows.filter((q) => q.status === "accepted").reduce((s, q) => s + q.total_value, 0),
      draft: rows.filter((q) => q.status === "draft").reduce((s, q) => s + q.total_value, 0),
    }),
    [rows],
  );

  const duplicate = (id: string) => {
    const q = rows.find((r) => r.id === id);
    if (!q) return;
    const copy = {
      ...q,
      id: `Q-${Math.floor(Math.random() * 9000) + 1000}`,
      number: `${q.number}-COPY`,
      status: "draft" as QuoteStatus,
    };
    setRows((prev) => [copy, ...prev]);
    toast.success(`Duplicated ${q.number}`);
  };
  const archive = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    toast.message("Quote archived");
  };

  return (
    <>
      <PageHeader
        title="Quotes"
        description={`${filtered.length} of ${rows.length} quotes`}
        actions={
          <Button size="sm" asChild>
            <Link to="/quotes/new">
              <Plus className="mr-2 h-4 w-4" /> New quote
            </Link>
          </Button>
        }
      />

      <div className="space-y-4 px-6 py-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard label="In pipeline" value={formatHKD(totals.pipeline)} hint="pending + sent + viewed" />
          <MetricCard label="Won" value={formatHKD(totals.won)} hint="this quarter" />
          <MetricCard label="In draft" value={formatHKD(totals.draft)} hint="not yet submitted" />
        </div>

        <Card className="p-3">
          <div className="flex flex-wrap items-center gap-3">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                {TABS.map((t) => (
                  <TabsTrigger key={t.value} value={t.value}>
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Input
              placeholder="Search number, lead…"
              className="h-9 max-w-xs"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </Card>

        <Card>
          <Table>
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
                      {q.currency} {q.total_value.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm">{q.valid_until}</TableCell>
                    <TableCell className="text-sm">{creator?.name ?? "—"}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
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
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    No quotes match.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </>
  );
}
