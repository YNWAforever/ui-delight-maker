import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, Plus, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { leads as seedLeads, users, userById, type Lead } from "@/lib/mock-data";

export const Route = createFileRoute("/leads")({
  head: () => ({
    meta: [
      { title: "Leads — Fimmick ClientOps" },
      { name: "description", content: "All inbound leads with status, source, and qualification score." },
    ],
  }),
  component: LeadsPage,
});

const STATUSES = ["new", "qualified", "replied", "quoted", "approved", "won", "lost"];
const SOURCES = ["website", "whatsapp", "email", "linkedin", "csv", "event"];

function LeadsPage() {
  const [rows, setRows] = useState<Lead[]>(seedLeads);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [owner, setOwner] = useState("all");
  const [sort, setSort] = useState<"recent" | "score">("recent");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newOpen, setNewOpen] = useState(false);

  const filtered = useMemo(() => {
    const out = rows.filter((l) => {
      if (status !== "all" && l.status !== status) return false;
      if (source !== "all" && l.source !== source) return false;
      if (owner !== "all" && l.assigned_to !== owner) return false;
      if (
        query &&
        !`${l.company_name} ${l.contact_name} ${l.contact_email}`
          .toLowerCase()
          .includes(query.toLowerCase())
      )
        return false;
      return true;
    });
    return sort === "score"
      ? [...out].sort((a, b) => b.lead_score - a.lead_score)
      : [...out].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [rows, query, status, source, owner, sort]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const clearFilters = () => {
    setQuery("");
    setStatus("all");
    setSource("all");
    setOwner("all");
  };
  const activeChips = [
    status !== "all" && { key: "status", label: status, clear: () => setStatus("all") },
    source !== "all" && { key: "source", label: source, clear: () => setSource("all") },
    owner !== "all" && {
      key: "owner",
      label: userById(owner)?.name ?? owner,
      clear: () => setOwner("all"),
    },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];

  return (
    <>
      <PageHeader
        title="Lead Inbox"
        description={`${filtered.length} of ${rows.length} leads`}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => toast.message("CSV import is mocked in this prototype.")}
            >
              <Download className="mr-2 h-4 w-4" /> Import CSV
            </Button>
            <NewLeadDialog
              open={newOpen}
              onOpenChange={setNewOpen}
              onCreate={(lead) => {
                setRows((prev) => [lead, ...prev]);
                toast.success(`Lead created: ${lead.company_name}`);
              }}
            />
          </>
        }
      />

      <div className="space-y-4 px-6 py-6">
        <Card className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Search company, contact, email…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 min-w-[220px] flex-1"
            />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9 w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="h-9 w-[150px]">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {SOURCES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={owner} onValueChange={setOwner}>
              <SelectTrigger className="h-9 w-[150px]">
                <SelectValue placeholder="Owner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All owners</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(v) => setSort(v as "recent" | "score")}>
              <SelectTrigger className="h-9 w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Most recent</SelectItem>
                <SelectItem value="score">Highest score</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {activeChips.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {activeChips.map((c) => (
                <button
                  key={c.key}
                  onClick={c.clear}
                  className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs capitalize text-secondary-foreground hover:bg-secondary/70"
                >
                  {c.key}: {c.label}
                  <X className="h-3 w-3" />
                </button>
              ))}
              <button onClick={clearFilters} className="text-xs text-muted-foreground hover:underline">
                Clear all
              </button>
            </div>
          )}
        </Card>

        {selected.size > 0 && (
          <div className="flex items-center gap-3 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
            <span className="font-medium">{selected.size} selected</span>
            <Button size="sm" variant="outline" onClick={() => toast.success(`Assigned ${selected.size} leads`)}>
              Assign owner
            </Button>
            <Button size="sm" variant="outline" onClick={() => toast.success(`Created ${selected.size} draft quotes`)}>
              Convert to quote
            </Button>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        )}

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onCheckedChange={(v) =>
                      setSelected(v ? new Set(filtered.map((l) => l.id)) : new Set())
                    }
                  />
                </TableHead>
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
                const ownerUser = userById(lead.assigned_to);
                return (
                  <TableRow key={lead.id} className="cursor-pointer">
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(lead.id)}
                        onCheckedChange={() => toggle(lead.id)}
                      />
                    </TableCell>
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
                      <span className="text-sm">{ownerUser?.name ?? "—"}</span>
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
                  <TableCell colSpan={8} className="py-10">
                    <EmptyState
                      title="No leads match your filters"
                      description="Try clearing a filter or adding a new lead."
                      action={
                        <Button size="sm" onClick={() => setNewOpen(true)}>
                          <Plus className="mr-2 h-4 w-4" /> New lead
                        </Button>
                      }
                    />
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

function NewLeadDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (lead: Lead) => void;
}) {
  const [company, setCompany] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [enquiry, setEnquiry] = useState("");
  const [source, setSource] = useState("website");
  const [ownerId, setOwnerId] = useState(users[2].id);

  const submit = () => {
    if (!company || !contact) {
      toast.error("Company and contact name are required.");
      return;
    }
    onCreate({
      id: `L-${Math.floor(Math.random() * 9000) + 2000}`,
      company_name: company,
      contact_name: contact,
      contact_email: email || "—",
      contact_phone: "—",
      source: source as Lead["source"],
      status: "new",
      assigned_to: ownerId,
      lead_score: 0,
      enquiry_text: enquiry,
      qualification_data: null,
      created_at: new Date("2026-05-20T10:00:00Z").toISOString(),
      updated_at: new Date("2026-05-20T10:00:00Z").toISOString(),
    });
    setCompany("");
    setContact("");
    setEmail("");
    setEnquiry("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" /> New lead
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New lead</DialogTitle>
          <DialogDescription>
            The Qualification Agent will pick it up automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className="text-xs">Company</Label>
            <Input className="mt-1" value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Contact name</Label>
            <Input className="mt-1" value={contact} onChange={(e) => setContact(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Contact email</Label>
            <Input className="mt-1" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Source</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Owner</Label>
            <Select value={ownerId} onValueChange={setOwnerId}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Enquiry</Label>
            <Textarea
              className="mt-1"
              rows={3}
              value={enquiry}
              onChange={(e) => setEnquiry(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>Create lead</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
