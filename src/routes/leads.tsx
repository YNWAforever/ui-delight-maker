import { useMemo, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Download, Plus, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CommandHeader, MetricStrip, WorkSurfaceEmpty } from "@/components/sales";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { Lead } from "@/lib/types";
import { getLeads, createLead, updateLead } from "@/server-functions/leads";

export const Route = createFileRoute("/leads")({
  head: () => ({
    meta: [
      { title: "Leads — Fimmick ClientOps" },
      {
        name: "description",
        content: "All inbound leads with status, source, and qualification score.",
      },
    ],
  }),
  loader: () => getLeads({}),
  component: LeadsPage,
});

const STATUSES = ["new", "qualified", "replied", "quoted", "approved", "won", "lost"];
const SOURCES = ["website", "whatsapp", "email", "linkedin", "csv", "event"];

function LeadsPage() {
  const loaderLeads = Route.useLoaderData();
  const router = useRouter();
  const [rows, setRows] = useState<Lead[]>(loaderLeads);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [owner, setOwner] = useState("all");
  const [sort, setSort] = useState<"recent" | "score">("recent");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newOpen, setNewOpen] = useState(false);

  const handleCreateLead = async (formData: {
    company_name: string;
    enquiry_text?: string;
    source?: Lead["source"];
    contact_name?: string;
    contact_email?: string;
  }) => {
    await createLead({ data: formData });
    router.invalidate();
    setNewOpen(false);
    toast.success("Lead created");
  };

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
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
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
      label: owner,
      clear: () => setOwner("all"),
    },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];

  return (
    <>
      <CommandHeader
        title="Lead Inbox"
        status="Acquire"
        description={`${filtered.length} of ${rows.length} leads ready for triage, assignment, or follow-up.`}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => toast.message("CSV import is mocked in this prototype.")}
            >
              <Download className="mr-2 h-4 w-4" /> Import CSV
            </Button>
            <NewLeadDialog open={newOpen} onOpenChange={setNewOpen} onCreate={handleCreateLead} />
          </>
        }
      />

      <div className="space-y-4 px-6 py-6">
        <MetricStrip
          metrics={[
            {
              label: "Hot leads",
              value: rows.filter((lead) => lead.lead_score >= 75).length,
              hint: "score 75+",
            },
            {
              label: "Unassigned",
              value: rows.filter((lead) => !lead.assigned_to).length,
              hint: "needs owner",
            },
            {
              label: "Qualified",
              value: rows.filter((lead) => lead.status === "qualified").length,
              hint: "ready to convert",
            },
          ]}
          columns={3}
        />

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
              <button
                onClick={clearFilters}
                className="text-xs text-muted-foreground hover:underline"
              >
                Clear all
              </button>
            </div>
          )}
        </Card>

        {selected.size > 0 && (
          <LeadsBulkBar
            count={selected.size}
            onAssign={async (uid) => {
              await Promise.all(
                Array.from(selected).map((id) =>
                  updateLead({ data: { id, updates: { assigned_to: uid } } }),
                ),
              );
              setSelected(new Set());
              router.invalidate();
            }}
            onMarkStatus={(s) => {
              setRows((prev) => prev.map((l) => (selected.has(l.id) ? { ...l, status: s } : l)));
              toast.success(`Marked ${selected.size} lead${selected.size > 1 ? "s" : ""} as ${s}`);
              setSelected(new Set());
            }}
            onConvert={() => {
              toast.success(`Created ${selected.size} draft quote${selected.size > 1 ? "s" : ""}`);
              setSelected(new Set());
            }}
            onClear={() => setSelected(new Set())}
          />
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
                      <span className="text-xs capitalize text-muted-foreground">
                        {lead.source}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={lead.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{lead.lead_score}</TableCell>
                    <TableCell>
                      <span className="text-sm">{lead.assigned_to ?? "—"}</span>
                    </TableCell>
                    <TableCell>
                      {lead.qualification_data ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs text-primary">
                          <Sparkles className="h-3 w-3" />
                          {lead.qualification_data.next_action}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          awaiting qualification
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="p-4">
                    <WorkSurfaceEmpty
                      title="No leads match this view"
                      description="Clear filters or add a new lead to keep the sales queue moving."
                      action={
                        <Button size="sm" variant="outline" onClick={clearFilters}>
                          Clear filters
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
  onCreate: (formData: {
    company_name: string;
    enquiry_text?: string;
    source?: Lead["source"];
    contact_name?: string;
    contact_email?: string;
  }) => Promise<void>;
}) {
  const [company, setCompany] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [enquiry, setEnquiry] = useState("");
  const [source, setSource] = useState("website");

  const submit = async () => {
    if (!company || !contact) {
      toast.error("Company and contact name are required.");
      return;
    }
    await onCreate({
      company_name: company,
      contact_name: contact,
      contact_email: email || undefined,
      source: source as Lead["source"],
      enquiry_text: enquiry || undefined,
    });
    setCompany("");
    setContact("");
    setEmail("");
    setEnquiry("");
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

function LeadsBulkBar({
  count,
  onAssign,
  onMarkStatus,
  onConvert,
  onClear,
}: {
  count: number;
  onAssign: (uid: string) => void;
  onMarkStatus: (s: Lead["status"]) => void;
  onConvert: () => void;
  onClear: () => void;
}) {
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignee, setAssignee] = useState("");
  const [confirm, setConfirm] = useState<null | {
    title: string;
    description: string;
    action: () => void;
    label: string;
  }>(null);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
      <span className="font-medium">{count} selected</span>
      <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)}>
        Assign owner
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          setConfirm({
            title: `Mark ${count} lead${count > 1 ? "s" : ""} as qualified?`,
            description: "This updates the status for every selected lead.",
            label: "Mark qualified",
            action: () => onMarkStatus("qualified"),
          })
        }
      >
        Mark qualified
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          setConfirm({
            title: `Mark ${count} lead${count > 1 ? "s" : ""} as lost?`,
            description: "Lost leads stay in history but won't appear in active pipelines.",
            label: "Mark lost",
            action: () => onMarkStatus("lost"),
          })
        }
      >
        Mark lost
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          setConfirm({
            title: `Create ${count} draft quote${count > 1 ? "s" : ""}?`,
            description: "Each selected lead becomes a new draft quote, ready to edit.",
            label: "Create drafts",
            action: onConvert,
          })
        }
      >
        Convert to quote
      </Button>
      <Button size="sm" variant="ghost" className="ml-auto" onClick={onClear}>
        Clear
      </Button>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Assign {count} lead{count > 1 ? "s" : ""}
            </DialogTitle>
            <DialogDescription>Pick a new owner. Reassignment is logged.</DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs">Owner UUID</Label>
            <Input
              className="mt-1"
              placeholder="Paste user UUID…"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                onAssign(assignee);
                setAssignOpen(false);
              }}
            >
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                confirm?.action();
                setConfirm(null);
              }}
            >
              {confirm?.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
