import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { agents, serviceTemplates, users } from "@/lib/mock-data";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Fimmick ClientOps" },
      { name: "description", content: "Users, pricing rules, service taxonomy, and agent configuration." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Workspace configuration: users, pricing rules, services, and agents."
      />

      <div className="px-6 py-6">
        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users">Users & roles</TabsTrigger>
            <TabsTrigger value="pricing">Pricing rules</TabsTrigger>
            <TabsTrigger value="services">Service taxonomy</TabsTrigger>
            <TabsTrigger value="agents">Agent config</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Team members</CardTitle>
                  <CardDescription>{users.length} users</CardDescription>
                </div>
                <Button size="sm">Invite user</Button>
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
                    {users.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                        <TableCell>
                          <span className="rounded-md bg-secondary px-2 py-0.5 text-xs capitalize text-secondary-foreground">
                            {u.role}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm">
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pricing" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pricing & approval rules</CardTitle>
                <CardDescription>
                  Thresholds that route quotes to managers automatically.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Max discount without approval (%)" defaultValue="10" />
                <Field label="Manager approval threshold (HKD)" defaultValue="400000" />
                <Field label="Director approval threshold (HKD)" defaultValue="1000000" />
                <Field label="Min margin (%)" defaultValue="25" />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="services" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Service templates</CardTitle>
                <CardDescription>
                  Templates the Quotation Agent draws from when drafting proposals.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Template</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Base price (HKD)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {serviceTemplates.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{t.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {t.description}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {t.base_price.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="agents" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Agent configuration</CardTitle>
                <CardDescription>
                  Toggle agents on/off and review whether each one requires human approval.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {agents.map((a) => (
                  <div
                    key={a.name}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{a.display_name}</p>
                      <p className="text-xs text-muted-foreground">{a.role}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Model <code>{a.model}</code> · approval{" "}
                        {a.human_approval ? "required" : "auto"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge value={a.status} />
                      <Switch defaultChecked={a.status === "active"} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function Field({ label, defaultValue }: { label: string; defaultValue: string }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input className="mt-1.5" defaultValue={defaultValue} />
    </div>
  );
}
