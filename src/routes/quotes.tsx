import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { leadById, quotes, userById } from "@/lib/mock-data";

export const Route = createFileRoute("/quotes")({
  head: () => ({
    meta: [
      { title: "Quotes — Fimmick ClientOps" },
      { name: "description", content: "All quotes with status, value, and approval state." },
    ],
  }),
  component: QuotesPage,
});

function QuotesPage() {
  return (
    <>
      <PageHeader
        title="Quotes"
        description={`${quotes.length} quotes in the system`}
        actions={
          <Button size="sm" asChild>
            <Link to="/quotes/new">
              <Plus className="mr-2 h-4 w-4" /> New quote
            </Link>
          </Button>
        }
      />

      <div className="px-6 py-6">
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quote</TableHead>
                <TableHead>Lead / Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>Valid until</TableHead>
                <TableHead>Created by</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotes.map((q) => {
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
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </div>
    </>
  );
}
