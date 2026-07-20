import { useEffect, useState } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { TouchpointLogger } from "@/components/touchpoint-logger";
import { MarkRenewedEndedDialog } from "@/components/renewals/mark-renewed-ended-dialog";
import { triggerRiskScoreAgent } from "@/server-functions/engagements";
import { getClientContacts } from "@/server-functions/client-contacts";
import { getEngagementsByClient } from "@/server-functions/engagements";
import { annualizeValue } from "@/lib/engagement-utils";
import { formatCompactHKD, formatDate } from "@/lib/format";
import type { Engagement } from "@/lib/types";

type RenewalRow = Engagement & { client_company_name: string; product_name: string };

export function RenewalsPreviewPanel({
  engagement,
  onClose,
}: {
  engagement: RenewalRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const navigate = useNavigate();
  const [dialogAction, setDialogAction] = useState<"renew" | "end" | null>(null);
  const [scoreStatus, setScoreStatus] = useState<"idle" | "running" | "failed">("idle");
  const annualizedValue = engagement
    ? annualizeValue(engagement.value, engagement.billing_period)
    : 0;

  useEffect(() => {
    setScoreStatus("idle");
  }, [engagement?.id]);

  const rescore = async () => {
    if (!engagement) return;
    setScoreStatus("running");
    try {
      const result = await triggerRiskScoreAgent({ data: { engagementId: engagement.id } });
      if (result.reason === "already_running") {
        toast.message("A risk score is already running for this engagement.");
      } else if (result.reason === "missing_webhook") {
        toast.error("N8N_SCORE_RENEWAL_RISK_WEBHOOK_URL isn't configured.");
        setScoreStatus("idle");
        return;
      } else {
        toast.success("Renewal risk scoring started.");
      }
      router.invalidate();
      setScoreStatus("idle");
    } catch {
      toast.error("Renewal risk scoring failed to start.");
      setScoreStatus("failed");
    }
  };

  return (
    <Sheet open={engagement !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {engagement && (
          <div className="space-y-4 p-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold">{engagement.client_company_name}</h2>
                <p className="text-sm text-muted-foreground">{engagement.product_name}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Risk</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  <span className="text-muted-foreground">Renewal date:</span>{" "}
                  {formatDate(engagement.renewal_date)}
                </p>
                <p>
                  <span className="text-muted-foreground">Annualized value:</span>{" "}
                  {formatCompactHKD(annualizedValue)}
                </p>
                {scoreStatus === "running" ? (
                  <div className="space-y-2">
                    <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                    <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                    <p className="text-xs text-muted-foreground">Scoring renewal risk…</p>
                  </div>
                ) : !engagement.risk_reasoning ? (
                  <p className="text-muted-foreground">
                    Not yet scored. Click "Re-score risk" below to run the Renewal Risk Agent.
                  </p>
                ) : (
                  <>
                    <p>
                      <span className="text-muted-foreground">Health score:</span>{" "}
                      {engagement.health_score}/100
                    </p>
                    <p>
                      <span className="text-muted-foreground">Renewal risk:</span>{" "}
                      {engagement.renewal_risk}
                    </p>
                    <p className="text-muted-foreground">{engagement.risk_reasoning}</p>
                    {engagement.next_action && (
                      <p className="font-medium">Next: {engagement.next_action}</p>
                    )}
                  </>
                )}
                {scoreStatus === "failed" && (
                  <p className="text-xs text-destructive">Scoring failed to start — try again.</p>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-2">
              <TouchpointLoggerLoader
                clientId={engagement.client_id}
                engagementId={engagement.id}
                onLogged={() => router.invalidate()}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={rescore}
                disabled={scoreStatus === "running"}
              >
                {scoreStatus === "running"
                  ? "Scoring…"
                  : scoreStatus === "failed"
                    ? "Retry re-score"
                    : "Re-score risk"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  navigate({
                    to: "/quotes/new",
                    search: { clientId: engagement.client_id, productId: engagement.product_id },
                  })
                }
              >
                Draft renewal quote
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDialogAction("renew")}>
                Mark renewed
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setDialogAction("end")}>
                Mark ended
              </Button>
            </div>
          </div>
        )}

        {engagement && (
          <MarkRenewedEndedDialog
            engagementId={engagement.id}
            action={dialogAction}
            onClose={() => setDialogAction(null)}
            onDone={() => {
              setDialogAction(null);
              router.invalidate();
              onClose();
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function TouchpointLoggerLoader({
  clientId,
  engagementId,
  onLogged,
}: {
  clientId: string;
  engagementId: string;
  onLogged: () => void;
}) {
  // Contacts/engagements are fetched lazily on click via TouchpointLogger's own
  // trigger-wrapped dialog rather than blocking the panel's initial render.
  type TouchpointData = {
    engagements: Engagement[];
    contacts: Awaited<ReturnType<typeof getClientContacts>>;
  };
  const [touchpointDataByClientId, setTouchpointDataByClientId] = useState<
    Record<string, TouchpointData>
  >({});
  const [loadingByClientId, setLoadingByClientId] = useState<Record<string, boolean>>({});
  const touchpointData = touchpointDataByClientId[clientId];

  return (
    <TouchpointLogger
      clientId={clientId}
      engagements={touchpointData?.engagements ?? []}
      contacts={touchpointData?.contacts ?? []}
      defaultEngagementId={engagementId}
      onLogged={onLogged}
      trigger={
        <Button
          variant="outline"
          size="sm"
          disabled={loadingByClientId[clientId] === true}
          onClick={async () => {
            if (touchpointData || loadingByClientId[clientId]) return;
            setLoadingByClientId((current) => ({ ...current, [clientId]: true }));
            try {
              const [engagements, contacts] = await Promise.all([
                getEngagementsByClient({ data: { clientId } }),
                getClientContacts({ data: { clientId } }),
              ]);
              setTouchpointDataByClientId((current) => ({
                ...current,
                [clientId]: { engagements, contacts },
              }));
            } finally {
              setLoadingByClientId((current) => ({ ...current, [clientId]: false }));
            }
          }}
        >
          Log touchpoint
        </Button>
      }
    />
  );
}
