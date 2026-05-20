import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
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
import { formatCompactHKD } from "@/lib/format";
import { clients as seedClients, userById, users, type Client } from "@/lib/mock-data";

export const Route = createFileRoute("/clients")({
  head: () => ({
    meta: [
      { title: "Clients — Fimmick ClientOps" },
      { name: "description", content: "Active clients with health score, tier, and renewal date." },
    ],
  }),
  component: ClientsPage,
});

function healthClass(score: number) {
  if (score >= 75) return "bg-success/15 text-success border-success/30";
  if (score >= 55) return "bg-warning/15 text-warning-foreground border-warning/30";
  return "bg-destructive/10 text-destructive border-destructive/30";
}

function ClientsPage() {
  const [rows, setRows] = useState<Client[]>(seedClients);
  const [tier, setTier] = useState("all");
  const [sortKey, setSortKey] = useState<"arr" | "health" | "renewal">("arr");
  const [newOpen, setNewOpen] = useState(false);

  const filtered = useMemo(() => {
    const out = rows.filter((c) => (tier === "all" ? true : c.tier === tier));
    const sortFn = {
      arr: (a: Client, b: Client) => b.arr - a.arr,
      health: (a: Client, b: Client) => b.health_score - a.health_score,
      renewal: (a: Client, b: Client) => a.renewal_date.localeCompare(b.renewal_date),
    }[sortKey];
    return [...out].sort(sortFn);
  }, [rows, tier, sortKey]);

  const totalARR = rows.reduce((s, c) => s + c.arr, 0);
  const avgHealth = Math.round(rows.reduce((s, c) => s + c.health_score, 0) / rows.length);

  return (
    <>
      <PageHeader
        title="Clients"
        description={`${rows.length} active accounts`}
        actions={
          <Dialog open={newOpen} onOpenChange={setNewOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" /> New client
              </Button>
            </DialogTrigger>
            <NewClientDialog
              onCreate={(c) => {
                setRows((prev) => [c, ...prev]);
                setNewOpen(false);
                toast.success(`Created client ${c.company_name}`);
              }}
            />
          </Dialog>
        }
      />

      <div className="space-y-4 px-6 py-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard label="Total ARR" value={formatCompactHKD(totalARR)} hint="all active accounts" />
          <MetricCard label="Avg health" value={`${avgHealth}/100`} hint="across portfolio" />
          <MetricCard
            label="Renewals next 90d"
            value={rows.filter((c) => c.renewal_date <= "2026-08-20").length}
            hint="schedule QBRs early"
          />
        </div>

        <Card className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={tier} onValueChange={setTier}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue placeholder="Tier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tiers</SelectItem>
                <SelectItem value="SME">SME</SelectItem>
                <SelectItem value="mid-market">Mid-market</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortKey} onValueChange={(v) => setSortKey(v as typeof sortKey)}>
              <SelectTrigger className="h-9 w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="arr">Sort: ARR</SelectItem>
                <SelectItem value="health">Sort: Health</SelectItem>
                <SelectItem value="renewal">Sort: Renewal</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>

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
              {filtered.map((c) => {
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
                    <TableCell className="text-right">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums ${healthClass(c.health_score)}`}
                      >
                        {c.health_score}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.arr.toLocaleString()}
                    </TableCell>
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

function NewClientDialog({ onCreate }: { onCreate: (c: Client) => void }) {
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [tier, setTier] = useState<Client["tier"]>("SME");
  const [owner, setOwner] = useState(users[0].id);

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>New client</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label className="text-xs">Company</Label>
          <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Industry</Label>
          <Input className="mt-1" value={industry} onChange={(e) => setIndustry(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Tier</Label>
          <Select value={tier} onValueChange={(v) => setTier(v as Client["tier"])}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SME">SME</SelectItem>
              <SelectItem value="mid-market">Mid-market</SelectItem>
              <SelectItem value="enterprise">Enterprise</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs">Account owner</Label>
          <Select value={owner} onValueChange={setOwner}>
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
      </div>
      <DialogFooter>
        <Button
          onClick={() =>
            onCreate({
              id: `C-${Math.floor(Math.random() * 9000) + 500}`,
              company_name: name || "Untitled",
              industry: industry || "—",
              tier,
              account_owner: owner,
              health_score: 70,
              onboarding_status: "not_started",
              renewal_date: "2027-05-20",
              arr: 0,
              created_at: new Date("2026-05-20T10:00:00Z").toISOString(),
            })
          }
        >
          Create
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
