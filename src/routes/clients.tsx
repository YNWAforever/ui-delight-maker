import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { clients, userById } from "@/lib/mock-data";

export const Route = createFileRoute("/clients")({
  head: () => ({
    meta: [
      { title: "Clients — Fimmick ClientOps" },
      { name: "description", content: "Active clients with health score, tier, and renewal date." },
    ],
  }),
  component: ClientsPage,
});

function healthColor(score: number) {
  if (score >= 75) return "text-success";
  if (score >= 55) return "text-warning-foreground";
  return "text-destructive";
}

function ClientsPage() {
  return (
    <>
      <PageHeader
        title="Clients"
        description={`${clients.length} active accounts`}
        actions={
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" /> New client
          </Button>
        }
      />

      <div className="px-6 py-6">
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Onboarding</TableHead>
                <TableHead className="text-right">Health</TableHead>
                <TableHead className="text-right">ARR (HKD)</TableHead>
                <TableHead>Renewal</TableHead>
                <TableHead>Owner</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((c) => {
                const owner = userById(c.account_owner);
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <Link
                        to="/clients/$id"
                        params={{ id: c.id }}
                        className="hover:text-primary hover:underline"
                      >
                        {c.company_name}
                      </Link>
                      <div className="text-xs text-muted-foreground">{c.id}</div>
                    </TableCell>
                    <TableCell className="text-sm">{c.industry}</TableCell>
                    <TableCell>
                      <span className="rounded-md bg-secondary px-2 py-0.5 text-xs capitalize text-secondary-foreground">
                        {c.tier}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={c.onboarding_status} />
                    </TableCell>
                    <TableCell className={`text-right font-medium tabular-nums ${healthColor(c.health_score)}`}>
                      {c.health_score}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{c.arr.toLocaleString()}</TableCell>
                    <TableCell className="text-sm">{c.renewal_date}</TableCell>
                    <TableCell className="text-sm">{owner?.name ?? "—"}</TableCell>
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
