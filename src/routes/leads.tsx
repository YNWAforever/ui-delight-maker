import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, Filter, Plus, Sparkles } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { leads, userById } from "@/lib/mock-data";

export const Route = createFileRoute("/leads")({
  head: () => ({
    meta: [
      { title: "Leads — Fimmick ClientOps" },
      { name: "description", content: "All inbound leads with status, source, and qualification score." },
    ],
  }),
  component: LeadsPage,
});

function LeadsPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [source, setSource] = useState<string>("all");

  const filtered = useMemo(
    () =>
      leads.filter((l) => {
        if (status !== "all" && l.status !== status) return false;
        if (source !== "all" && l.source !== source) return false;
        if (
          query &&
          !`${l.company_name} ${l.contact_name} ${l.contact_email}`
            .toLowerCase()
            .includes(query.toLowerCase())
        )
          return false;
        return true;
      }),
    [query, status, source],
  );

  return (
    <>
      <PageHeader
        title="Lead Inbox"
        description={`${filtered.length} of ${leads.length} leads`}
        actions={
          <>
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" /> Import CSV
            </Button>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" /> New lead
            </Button>
          </>
        }
      />

      <div className="space-y-4 px-6 py-6">
        <Card className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Input
                placeholder="Search company, contact, email…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-9"
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {["new", "qualified", "replied", "quoted", "approved", "won", "lost"].map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {["website", "whatsapp", "email", "linkedin", "csv", "event"].map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" className="ml-auto">
              <Filter className="mr-2 h-4 w-4" /> More filters
            </Button>
          </div>
        </Card>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Agent suggestion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((lead) => {
                const owner = userById(lead.assigned_to);
                return (
                  <TableRow key={lead.id} className="cursor-pointer">
                    <TableCell className="font-medium">
                      <Link
                        to="/leads/$id"
                        params={{ id: lead.id }}
                        className="hover:text-primary hover:underline"
                      >
                        {lead.company_name}
                      </Link>
                      <div className="text-xs text-muted-foreground">{lead.id}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{lead.contact_name}</div>
                      <div className="text-xs text-muted-foreground">{lead.contact_email}</div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs capitalize text-muted-foreground">{lead.source}</span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={lead.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{lead.lead_score}</TableCell>
                    <TableCell>
                      <span className="text-sm">{owner?.name ?? "—"}</span>
                    </TableCell>
                    <TableCell>
                      {lead.qualification_data ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs text-primary">
                          <Sparkles className="h-3 w-3" />
                          {lead.qualification_data.recommended_next_action.replace(/_/g, " ")}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">awaiting qualification</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    No leads match your filters.
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
