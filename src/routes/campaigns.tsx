import { useState } from "react";
import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { CalendarDays, Plus, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { APP_USERS } from "@/lib/users";
import type { CampaignStatus, CampaignType } from "@/lib/types";
import { createCampaign, getCampaigns } from "@/server-functions/campaigns";
import { useIsExactPath } from "@/lib/routing-utils";
import { toast } from "sonner";

export const Route = createFileRoute("/campaigns")({
  loader: async () => ({ campaigns: await getCampaigns({}) }),
  head: () => ({
    meta: [{ title: "Campaigns & Events - Fimmick ClientOps" }],
  }),
  component: CampaignsRoute,
});

function CampaignsRoute() {
  const isIndexRoute = useIsExactPath("/campaigns");

  if (!isIndexRoute) return <Outlet />;

  return <CampaignsIndex />;
}

function CampaignsIndex() {
  const { campaigns } = Route.useLoaderData();
  const navigate = useNavigate();
  const [newCampaignOpen, setNewCampaignOpen] = useState(false);
  const activeCount = campaigns.filter((campaign) => campaign.status === "active").length;
  const completedCount = campaigns.filter((campaign) => campaign.status === "completed").length;

  const create = async (payload: CreateCampaignPayload) => {
    const campaign = await createCampaign({ data: payload });
    toast.success("Campaign created.");
    setNewCampaignOpen(false);
    navigate({ to: "/campaigns/$id", params: { id: campaign.id } });
  };

  return (
    <>
      <PageHeader
        title="Campaigns & Events"
        description="Track event follow-up, attendee imports, and post-event account coverage across campaigns, workshops, webinars, and client events."
        actions={
          <Dialog open={newCampaignOpen} onOpenChange={setNewCampaignOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={() => setNewCampaignOpen(true)}>
                <Plus aria-hidden="true" className="mr-2 h-4 w-4" />
                New campaign
              </Button>
            </DialogTrigger>
            <NewCampaignDialog onCreate={create} />
          </Dialog>
        }
      />
      <main className="space-y-4 px-6 py-6">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <SummaryCard label="Campaigns" value={campaigns.length} hint="follow-up workspaces" />
          <SummaryCard label="Active" value={activeCount} hint="currently running" />
          <SummaryCard label="Completed" value={completedCount} hint="ready for follow-up" />
        </div>

        {campaigns.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
            No campaigns yet. Create an event or campaign record before importing attendees.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {campaigns.map((campaign) => (
              <Link
                key={campaign.id}
                to="/campaigns/$id"
                params={{ id: campaign.id }}
                className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Card className="h-full border-border transition-colors hover:bg-accent/30">
                  <CardContent className="space-y-4 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{campaign.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {campaign.objective ?? "Event follow-up workspace"}
                        </p>
                      </div>
                      <StatusBadge value={campaign.status} />
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                      <div className="rounded-md border border-border/70 p-3">
                        <div className="flex items-center gap-2">
                          <CalendarDays className="h-4 w-4" />
                          <span>Type</span>
                        </div>
                        <p className="mt-2 font-medium text-foreground">
                          {campaign.type.replace(/_/g, " ")}
                        </p>
                      </div>
                      <div className="rounded-md border border-border/70 p-3">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          <span>Channel</span>
                        </div>
                        <p className="mt-2 font-medium text-foreground">
                          {(campaign.channel ?? "unknown").replace(/_/g, " ")}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <p className="text-xs uppercase text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

type CreateCampaignPayload = {
  name: string;
  type?: CampaignType;
  status?: CampaignStatus;
  objective?: string;
  owner?: string;
  starts_at?: string;
  ends_at?: string;
  notes?: string;
};

function NewCampaignDialog({
  onCreate,
}: {
  onCreate: (campaign: CreateCampaignPayload) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<CampaignType>("client_event");
  const [status, setStatus] = useState<CampaignStatus>("planned");
  const [owner, setOwner] = useState(APP_USERS[0]?.id ?? "");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [objective, setObjective] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Campaign name is required.");
      return;
    }
    setSaving(true);
    try {
      await onCreate({
        name: trimmedName,
        type,
        status,
        owner: owner || undefined,
        starts_at: startsAt ? `${startsAt}T00:00:00.000Z` : undefined,
        ends_at: endsAt ? `${endsAt}T00:00:00.000Z` : undefined,
        objective: objective.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setName("");
      setObjective("");
      setNotes("");
      setStartsAt("");
      setEndsAt("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>New campaign</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="new-campaign-name" className="text-xs">
            Name
          </Label>
          <Input
            id="new-campaign-name"
            name="name"
            autoComplete="off"
            className="mt-1"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="new-campaign-type" className="text-xs">
            Type
          </Label>
          <Select value={type} onValueChange={(value) => setType(value as CampaignType)}>
            <SelectTrigger id="new-campaign-type" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="client_event">Client event</SelectItem>
              <SelectItem value="campaign">Campaign</SelectItem>
              <SelectItem value="webinar">Webinar</SelectItem>
              <SelectItem value="workshop">Workshop</SelectItem>
              <SelectItem value="activation">Activation</SelectItem>
              <SelectItem value="outbound">Outbound</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="new-campaign-status" className="text-xs">
            Status
          </Label>
          <Select value={status} onValueChange={(value) => setStatus(value as CampaignStatus)}>
            <SelectTrigger id="new-campaign-status" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="planned">Planned</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="new-campaign-start" className="text-xs">
            Start date
          </Label>
          <Input
            id="new-campaign-start"
            name="starts_at"
            type="date"
            className="mt-1"
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="new-campaign-end" className="text-xs">
            End date
          </Label>
          <Input
            id="new-campaign-end"
            name="ends_at"
            type="date"
            className="mt-1"
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="new-campaign-owner" className="text-xs">
            Owner
          </Label>
          <Select value={owner} onValueChange={setOwner}>
            <SelectTrigger id="new-campaign-owner" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {APP_USERS.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="new-campaign-objective" className="text-xs">
            Objective
          </Label>
          <Textarea
            id="new-campaign-objective"
            name="objective"
            className="mt-1"
            value={objective}
            onChange={(event) => setObjective(event.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="new-campaign-notes" className="text-xs">
            Notes
          </Label>
          <Textarea
            id="new-campaign-notes"
            name="notes"
            className="mt-1"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={saving}>
          {saving ? "Creating..." : "Create campaign"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
