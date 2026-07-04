import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Copy, Eye, EyeOff, KeyRound, Plus } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { APP_USERS, type AppUser } from "@/lib/users";
import { AGENT_DEFINITIONS } from "@/lib/agents";
import {
  createProduct,
  getProducts,
  updateProduct,
  deactivateProductFn,
} from "@/server-functions/products";
import type { Product } from "@/lib/types";

type User = AppUser & { role: "admin" | "manager" | "sales" | "cs" };

type PricingRule = {
  id: string;
  name: string;
  threshold: number;
  unit: "%" | "HKD";
  description: string;
};

const pricingRules: PricingRule[] = [
  {
    id: "pr-1",
    name: "Max discount without approval",
    threshold: 10,
    unit: "%",
    description: "Sales can apply up to this discount without manager sign-off.",
  },
  {
    id: "pr-2",
    name: "Manager approval threshold",
    threshold: 400000,
    unit: "HKD",
    description: "Quotes above this value require manager approval.",
  },
  {
    id: "pr-3",
    name: "Director approval threshold",
    threshold: 1000000,
    unit: "HKD",
    description: "Quotes above this value require director approval.",
  },
  {
    id: "pr-4",
    name: "Min margin",
    threshold: 25,
    unit: "%",
    description: "Quotes below this margin are flagged for review.",
  },
];

export const Route = createFileRoute("/settings")({
  loader: () => getProducts({}),
  head: () => ({
    meta: [
      { title: "Settings — Fimmick ClientOps" },
      {
        name: "description",
        content: "Profile, team, pricing rules, products, agents, notifications, and API keys.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Profile, team, pricing rules, agents, notifications, and API keys."
      />

      <div className="px-6 py-6">
        <Tabs defaultValue="profile">
          <TabsList>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="pricing">Pricing</TabsTrigger>
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="agents">Agents</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="apikeys">API keys</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="mt-4">
            <ProfileTab />
          </TabsContent>
          <TabsContent value="team" className="mt-4">
            <TeamTab />
          </TabsContent>
          <TabsContent value="pricing" className="mt-4">
            <PricingTab />
          </TabsContent>
          <TabsContent value="products" className="mt-4">
            <ProductsTab />
          </TabsContent>
          <TabsContent value="agents" className="mt-4">
            <AgentsTab />
          </TabsContent>
          <TabsContent value="notifications" className="mt-4">
            <NotificationsTab />
          </TabsContent>
          <TabsContent value="apikeys" className="mt-4">
            <ApiKeysTab />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function ProfileTab() {
  const [name, setName] = useState("Ada Wong");
  const [email, setEmail] = useState("ada@fimmick.com");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Your profile</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Name</Label>
          <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Email</Label>
          <Input className="mt-1" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Button size="sm" onClick={() => toast.success("Profile saved")}>
            Save changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TeamTab() {
  const [rows, setRows] = useState<User[]>(APP_USERS as User[]);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Team members</CardTitle>
          <CardDescription>{rows.length} users</CardDescription>
        </div>
        <Button size="sm" onClick={() => toast.message("Invite mocked")}>
          <Plus className="mr-2 h-4 w-4" /> Invite
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                <TableCell>
                  <Select
                    value={u.role}
                    onValueChange={(v) =>
                      setRows((prev) =>
                        prev.map((x) => (x.id === u.id ? { ...x, role: v as User["role"] } : x)),
                      )
                    }
                  >
                    <SelectTrigger className="h-8 w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="sales">Sales</SelectItem>
                      <SelectItem value="cs">Client success</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => toast.message("Mocked")}>
                    Remove
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function PricingTab() {
  const [rows, setRows] = useState(pricingRules);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pricing & approval rules</CardTitle>
        <CardDescription>Edit thresholds that route quotes for approval.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((r) => (
          <div
            key={r.id}
            className="grid grid-cols-1 gap-3 rounded-md border border-border p-3 sm:grid-cols-[1fr_140px]"
          >
            <div>
              <p className="text-sm font-medium">{r.name}</p>
              <p className="text-xs text-muted-foreground">{r.description}</p>
            </div>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                className="h-9"
                value={r.threshold}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((x) =>
                      x.id === r.id ? { ...x, threshold: Number(e.target.value) || 0 } : x,
                    ),
                  )
                }
              />
              <span className="text-xs text-muted-foreground">{r.unit}</span>
            </div>
          </div>
        ))}
        <Button size="sm" onClick={() => toast.success("Rules saved")}>
          Save rules
        </Button>
      </CardContent>
    </Card>
  );
}

function ProductsTab() {
  const products = Route.useLoaderData();
  const router = useRouter();
  const [rows, setRows] = useState<Product[]>(products);
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Product["category"]>("custom");
  const [billingType, setBillingType] = useState<Product["billing_type"]>("retainer");
  const [termMonths, setTermMonths] = useState(12);

  const create = async () => {
    const created = await createProduct({
      data: {
        name: name || "Untitled product",
        category,
        billing_type: billingType,
        default_term_months: termMonths,
      },
    });
    setRows((prev) => [...prev, created]);
    setNewOpen(false);
    setName("");
    router.invalidate();
    toast.success(`Added product ${created.name}`);
  };

  const toggleActive = async (product: Product) => {
    const updated = product.active
      ? await deactivateProductFn({ data: { id: product.id } })
      : await updateProduct({ data: { id: product.id, updates: { active: true } } });
    setRows((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    router.invalidate();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Fimmick products & solutions</CardTitle>
          <CardDescription>
            The catalog engagements, pricing templates, and quotes reference.
          </CardDescription>
        </div>
        <Dialog open={newOpen} onOpenChange={setNewOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" /> New product
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New product</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label className="text-xs">Name</Label>
                <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Category</Label>
                <Select
                  value={category ?? "custom"}
                  onValueChange={(v) => setCategory(v as Product["category"])}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["AI transformation", "CRM", "KOC", "campaign", "data", "custom"].map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Billing type</Label>
                <Select
                  value={billingType}
                  onValueChange={(v) => setBillingType(v as Product["billing_type"])}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="retainer">Retainer</SelectItem>
                    <SelectItem value="one_off">One-off</SelectItem>
                    <SelectItem value="usage">Usage</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Default term (months)</Label>
                <Input
                  type="number"
                  min={1}
                  className="mt-1"
                  value={termMonths}
                  onChange={(e) => setTermMonths(Number(e.target.value) || 12)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={create}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Billing</TableHead>
              <TableHead>Default term</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{p.category}</TableCell>
                <TableCell className="text-sm capitalize">
                  {p.billing_type.replace("_", " ")}
                </TableCell>
                <TableCell className="text-sm">
                  {p.default_term_months ? `${p.default_term_months}mo` : "—"}
                </TableCell>
                <TableCell>
                  <StatusBadge value={p.active ? "active" : "inactive"} />
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => toggleActive(p)}>
                    {p.active ? "Deactivate" : "Reactivate"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function AgentsTab() {
  const [state, setState] = useState(() =>
    Object.fromEntries(
      AGENT_DEFINITIONS.map((a) => [
        a.name,
        { enabled: a.status === "active", approval: a.human_approval },
      ]),
    ),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Agent configuration</CardTitle>
        <CardDescription>Toggle agents and switch approval requirements.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {AGENT_DEFINITIONS.map((a) => (
          <div
            key={a.name}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
          >
            <div>
              <p className="text-sm font-medium">{a.display_name}</p>
              <p className="text-xs text-muted-foreground">{a.description}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Model <code>{a.model}</code>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Approval</span>
                <Switch
                  checked={state[a.name].approval}
                  onCheckedChange={(v) =>
                    setState((p) => ({ ...p, [a.name]: { ...p[a.name], approval: v } }))
                  }
                />
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge value={state[a.name].enabled ? "active" : "paused"} />
                <Switch
                  checked={state[a.name].enabled}
                  onCheckedChange={(v) =>
                    setState((p) => ({ ...p, [a.name]: { ...p[a.name], enabled: v } }))
                  }
                />
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function NotificationsTab() {
  const channels = [
    { id: "email", label: "Email digest (daily)" },
    { id: "slack", label: "Slack — #clientops channel" },
    { id: "whatsapp", label: "WhatsApp — urgent only" },
    { id: "push", label: "In-app push" },
  ];
  const events = [
    { id: "new_lead", label: "New high-score lead" },
    { id: "approval", label: "Approval needed" },
    { id: "quote_won", label: "Quote accepted" },
    { id: "task_overdue", label: "Task overdue" },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Channels</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {channels.map((c) => (
            <label
              key={c.id}
              className="flex items-center gap-3 rounded-md border border-border p-3 text-sm"
            >
              <Checkbox defaultChecked />
              {c.label}
            </label>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Events</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {events.map((e) => (
            <label
              key={e.id}
              className="flex items-center gap-3 rounded-md border border-border p-3 text-sm"
            >
              <Checkbox defaultChecked />
              {e.label}
            </label>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ApiKeysTab() {
  const [keys, setKeys] = useState([
    {
      id: "k1",
      name: "Production API",
      value: "sk_live_8a4b…f9d2",
      revealed: false,
      created: "2026-02-12",
    },
    {
      id: "k2",
      name: "Webhook signer",
      value: "whk_a72…91ce",
      revealed: false,
      created: "2026-04-08",
    },
  ]);
  const generate = () => {
    const k = {
      id: `k${keys.length + 1}`,
      name: `New key ${keys.length + 1}`,
      value: `sk_${Math.random().toString(36).slice(2, 8)}…${Math.random().toString(36).slice(2, 6)}`,
      revealed: true,
      created: "2026-05-20",
    };
    setKeys((prev) => [k, ...prev]);
    toast.success("New API key generated");
  };
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">API keys</CardTitle>
          <CardDescription>Used for webhooks and external integrations.</CardDescription>
        </div>
        <Button size="sm" onClick={generate}>
          <KeyRound className="mr-2 h-4 w-4" /> Generate key
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Created</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((k) => (
              <TableRow key={k.id}>
                <TableCell className="font-medium">{k.name}</TableCell>
                <TableCell>
                  <code className="rounded bg-muted px-2 py-0.5 text-xs">
                    {k.revealed ? k.value : "•".repeat(16)}
                  </code>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{k.created}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setKeys((prev) =>
                        prev.map((x) => (x.id === k.id ? { ...x, revealed: !x.revealed } : x)),
                      )
                    }
                  >
                    {k.revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => toast.success("Copied")}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
