import { useId, useRef, useState, type ReactNode } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, FileUp } from "lucide-react";
import { toast } from "sonner";
import { EventAttendeeTable } from "@/components/relationship/event-attendee-table";
import { StatusBadge } from "@/components/status-badge";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { parseEventAttendeeCsv, type EventImportError, type EventImportRow } from "@/lib/relationship/event-import";
import { formatDate } from "@/lib/format";
import { getCampaign } from "@/server-functions/campaigns";
import { commitEventImportFn, validateEventImportRowsFn } from "@/server-functions/event-import";

type CommitEventImportResponse = Awaited<ReturnType<typeof commitEventImportFn>>;

function isCommitValidationFailure(
  result: CommitEventImportResponse,
): result is Extract<CommitEventImportResponse, { ok: false }> {
  return "ok" in result && result.ok === false;
}

export const Route = createFileRoute("/campaigns/$id")({
  loader: async ({ params }) => getCampaign({ data: { id: params.id } }),
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.campaign.name ?? "Campaign"} - Fimmick ClientOps` }],
  }),
  component: CampaignDetailRoute,
});

function CampaignDetailRoute() {
  const { campaign, members } = Route.useLoaderData();
  const router = useRouter();
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [rows, setRows] = useState<EventImportRow[]>([]);
  const [errors, setErrors] = useState<EventImportError[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const visibleErrors = errors.slice(0, 6);

  const resetInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const onFile = async (file: File) => {
    setIsValidating(true);
    setRows([]);
    setErrors([]);

    try {
      const parsedRows = parseEventAttendeeCsv(await file.text());
      if (parsedRows.length === 0) {
        toast.error("No attendee rows found in the CSV.");
        resetInput();
        return;
      }

      const result = await validateEventImportRowsFn({ data: { rows: parsedRows } });
      setRows(parsedRows);
      setErrors(result.errors);

      if (result.errors.length > 0) {
        toast.error(
          `${result.errors.length} attendee row${result.errors.length === 1 ? "" : "s"} need review before import.`,
        );
        resetInput();
        return;
      }

      toast.success(
        `${result.valid.length} attendee row${result.valid.length === 1 ? "" : "s"} ready to import.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to parse attendee CSV");
      resetInput();
    } finally {
      setIsValidating(false);
    }
  };

  const importRows = async () => {
    if (rows.length === 0 || errors.length > 0 || isImporting) {
      return;
    }

    setIsImporting(true);

    try {
      const result = await commitEventImportFn({ data: { campaignId: campaign.id, rows } });

      if (isCommitValidationFailure(result)) {
        setErrors(result.errors);
        toast.error(
          `${result.errors.length} attendee row${result.errors.length === 1 ? "" : "s"} failed validation on import.`,
        );
        resetInput();
        return;
      }

      await router.invalidate();
      setRows([]);
      setErrors([]);
      resetInput();
      toast.success(
        `Imported ${result.createdMembers} attendee${result.createdMembers === 1 ? "" : "s"} and matched ${result.createdAccounts} account${result.createdAccounts === 1 ? "" : "s"}, ${result.createdContacts} contact${result.createdContacts === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to import attendees");
      resetInput();
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title={campaign.name}
        description={`${campaign.type.replace(/_/g, " ")} follow-up workspace`}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/campaigns">
              <ArrowLeft className="h-4 w-4" />
              Campaigns
            </Link>
          </Button>
        }
      />

      <main className="space-y-4 px-6 py-6">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <SummaryCard label="Campaign status" value={<StatusBadge value={campaign.status} />} />
          <SummaryCard
            label="Attendees"
            value={<span>{members.length}</span>}
            hint="current imported records"
          />
          <SummaryCard
            label="Scheduled"
            value={<span>{formatDate(campaign.starts_at ?? campaign.scheduled_at ?? null)}</span>}
          />
          <SummaryCard
            label="Follow-up state"
            value={<span>{members.filter((member) => member.follow_up_status !== "completed").length}</span>}
            hint="attendees still in progress"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(360px,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Attendee follow-up</CardTitle>
            </CardHeader>
            <CardContent>
              <EventAttendeeTable
                members={members}
                onCreateTasks={() =>
                  toast.message("Task creation will use selected attendees in the next implementation step.")
                }
              />
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Import attendee CSV</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-md border border-dashed border-border p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-md bg-accent p-2 text-accent-foreground">
                      <FileUp className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-3">
                      <div>
                        <p className="text-sm font-medium">Upload attendee list</p>
                        <p className="text-sm text-muted-foreground">
                          Use CSV columns for company, contact, email, phone, attendee status,
                          interests, and notes.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={isValidating}
                          onClick={() => fileInputRef.current?.click()}
                        >
                          {isValidating ? "Validating..." : "Choose CSV"}
                        </Button>
                        <input
                          id={inputId}
                          ref={fileInputRef}
                          type="file"
                          accept=".csv,text/csv"
                          className="sr-only"
                          disabled={isValidating}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) {
                              void onFile(file);
                            }
                          }}
                        />
                        <span className="text-xs text-muted-foreground">
                          {rows.length === 0
                            ? "No file loaded"
                            : `${rows.length} row${rows.length === 1 ? "" : "s"} loaded`}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-md border border-border/70 p-3">
                    <p className="text-xs uppercase text-muted-foreground">Ready</p>
                    <p className="mt-2 text-2xl font-semibold">
                      {rows.length > 0 ? rows.length - errors.length : 0}
                    </p>
                  </div>
                  <div className="rounded-md border border-border/70 p-3">
                    <p className="text-xs uppercase text-muted-foreground">Needs review</p>
                    <p className="mt-2 text-2xl font-semibold">{errors.length}</p>
                  </div>
                </div>

                {errors.length > 0 ? (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                    <p className="text-sm font-medium text-destructive">Validation issues</p>
                    <ul className="mt-2 space-y-1 text-sm text-destructive">
                      {visibleErrors.map((error) => (
                        <li key={`${error.index}-${error.reason}`}>
                          Row {error.index + 1}: {error.reason}
                        </li>
                      ))}
                    </ul>
                    {errors.length > 6 ? (
                      <p className="mt-2 text-xs text-destructive">{`+${errors.length - 6} more`}</p>
                    ) : null}
                  </div>
                ) : null}

                <Button
                  className="w-full"
                  onClick={() => void importRows()}
                  disabled={rows.length === 0 || errors.length > 0 || isImporting || isValidating}
                >
                  {isImporting
                    ? "Importing attendees..."
                    : `Import ${rows.length} attendee row${rows.length === 1 ? "" : "s"}`}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Campaign scope</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <SummaryRow label="Type" value={campaign.type.replace(/_/g, " ")} />
                <SummaryRow label="Status" value={<StatusBadge value={campaign.status} />} />
                <SummaryRow
                  label="Objective"
                  value={campaign.objective ?? "Post-event follow-up and relationship coverage"}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </>
  );
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <p className="text-xs uppercase text-muted-foreground">{label}</p>
        <div className="text-2xl font-semibold text-foreground">{value}</div>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-border/70 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}
