import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { getCampaigns } from "@/server-functions/campaigns";

export const Route = createFileRoute("/campaigns")({
  loader: async () => ({ campaigns: await getCampaigns({}) }),
  head: () => ({
    meta: [{ title: "Campaigns & Events - Fimmick ClientOps" }],
  }),
  component: CampaignsRoute,
});

function CampaignsRoute() {
  const { campaigns } = Route.useLoaderData();
  const activeCount = campaigns.filter((campaign) => campaign.status === "active").length;
  const completedCount = campaigns.filter((campaign) => campaign.status === "completed").length;

  return (
    <>
      <PageHeader
        title="Campaigns & Events"
        description="Track event follow-up, attendee imports, and post-event account coverage across campaigns, workshops, webinars, and client events."
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
