import { useState } from "react";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Upload } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import {
  EmptyWorkspaceState,
  ErrorState,
  MetricStrip,
  ResponsiveRecordList,
  SectionHeader,
  WorkspaceHeader,
  type ColumnDef,
} from "@/components/sales";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toSafeErrorMessage } from "@/lib/errors";
import { formatCount } from "@/lib/format";
import { crmQueryKeys } from "@/lib/query-keys";
import { parseImportCsv, type ImportRow, type ImportRowError } from "@/lib/csv-import";
import { commitLeadImportFn, validateLeadImportRowsFn } from "@/server-functions/lead-import";

/**
 * The one piece of wizard state worth putting in the URL, for the same reason as
 * `/clients/import`: the uploaded file cannot survive a reload, but which slice of the
 * preview a reviewer is reading is a restorable preference worth sharing.
 */
const leadImportSearchSchema = z.object({
  show: z.enum(["all", "valid", "errors"]).default("all").catch("all"),
});

/**
 * No loader. `/clients/import` loads the product catalogue because validation rejects any
 * `product_name` outside it and the user cannot otherwise know the accepted values. Lead
 * validation has no such closed list — `owner_email` is checked against profiles, which is
 * not a list worth printing — so there is nothing to fetch and an empty loader would only
 * add a round trip.
 */
export const Route = createFileRoute("/leads/import")({
  validateSearch: leadImportSearchSchema,
  head: () => ({
    meta: [
      { title: "Import leads — Fimmick ClientOps" },
      {
        name: "description",
        content: "Validate a CSV of leads and contacts, then commit it to the lead inbox.",
      },
    ],
  }),
  errorComponent: LeadImportErrorState,
  component: LeadImportWizard,
});

function LeadImportErrorState({ error }: { error: unknown }) {
  const router = useRouter();

  return (
    <div className="px-4 py-6 md:px-6">
      <ErrorState
        kind="server"
        error={error}
        title="The import screen did not load"
        onRetry={() => {
          void router.invalidate({ filter: (match) => match.routeId === "/leads/import" });
        }}
      />
    </div>
  );
}

type CommitSummary = { created: number; updated: number; skipped: number };

type PreviewRow = { key: string; row: ImportRow; reason: string | null };

const PARSE_HELP =
  "The file needs a header row plus at least one data row. company_name and contact_email are required; contact_name, contact_phone, owner_email and enquiry_text are optional.";

/**
 * The dedupe rule, spelled out. It is not inferable from the columns, and it is the
 * difference between a safe re-import and one that resets a lead someone is working.
 */
const DUPLICATE_HELP =
  "A lead that already exists keeps everything it has. Blank fields are filled in; nothing is overwritten, and a lead's status and owner are never changed.";

function LeadImportWizard() {
  const { show } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();

  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [valid, setValid] = useState<ImportRow[]>([]);
  const [errors, setErrors] = useState<ImportRowError[]>([]);
  /** True once a file has been read and produced no data rows at all. */
  const [parsedEmpty, setParsedEmpty] = useState(false);
  const [summary, setSummary] = useState<CommitSummary | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);

  const onFile = async (file: File) => {
    if (isValidating || isCommitting) return;

    setIsValidating(true);
    try {
      const text = await file.text();
      const parsed = parseImportCsv(text);
      setFileName(file.name);
      setRows(parsed);
      setSummary(null);
      setParsedEmpty(parsed.length === 0);

      if (parsed.length === 0) {
        // `parseImportCsv` returns [] for an empty, headers-only or non-CSV file. Reported
        // rather than passed on: an empty commit would otherwise end in a success message
        // about zero rows, which reads like the file was accepted.
        setValid([]);
        setErrors([]);
        return;
      }

      const result = await validateLeadImportRowsFn({ data: { rows: parsed } });
      setValid(result.valid);
      setErrors(result.errors);
    } catch (error) {
      setValid([]);
      setErrors([]);
      toast.error(toSafeErrorMessage(error));
    } finally {
      setIsValidating(false);
    }
  };

  const commit = async () => {
    if (isCommitting || valid.length === 0) return;

    setIsCommitting(true);
    try {
      const rejected = errors.length;
      const result = await commitLeadImportFn({ data: { rows: valid } });
      // The repository's own `skipped` counts matched leads that had nothing left to fill.
      // Rows rejected by validation never reached it, so both are reported.
      setSummary({ ...result, skipped: result.skipped + rejected });
      /**
       * Step 3 is terminal. Leaving `valid` loaded would re-enable the button: the
       * repository dedupes, so a second click does not duplicate leads — it appends another
       * `activity_logs` entry and reports every row as skipped or updated, which reads like
       * a second successful import.
       */
      setValid([]);
      setRows([]);
      setErrors([]);
      // `/leads` is a cached list route, so without this "Lead Inbox" returns the user to
      // the pre-import list until the entry goes stale.
      await queryClient.invalidateQueries({ queryKey: crmQueryKeys.leads.lists() });
      toast.success(
        `Import complete: ${formatCount(result.created)} created, ${formatCount(
          result.updated,
        )} updated`,
      );
    } catch (error) {
      toast.error(toSafeErrorMessage(error));
    } finally {
      setIsCommitting(false);
    }
  };

  const previewRows: PreviewRow[] = [
    ...valid.map((row, index) => ({ key: `valid-${index}`, row, reason: null })),
    ...errors.map((entry, index) => ({
      key: `error-${index}`,
      row: entry.row,
      reason: entry.reason,
    })),
  ];
  const shownRows = previewRows.filter((entry) =>
    show === "valid" ? entry.reason === null : show === "errors" ? entry.reason !== null : true,
  );

  const columns: ColumnDef<PreviewRow>[] = [
    {
      id: "company",
      header: "Company",
      priority: "primary",
      sticky: true,
      width: "14rem",
      cell: (entry) => (
        <span className="font-medium">{entry.row.company_name || "(no company)"}</span>
      ),
    },
    {
      id: "outcome",
      header: "Outcome",
      priority: "primary",
      cell: (entry) =>
        entry.reason === null ? (
          <span className="text-sm">Will be imported</span>
        ) : (
          <span className="text-sm text-destructive">Skipped — {entry.reason}</span>
        ),
    },
    {
      id: "contact_email",
      header: "Contact email",
      priority: "primary",
      cell: (entry) => (
        <span className="block truncate text-sm">{entry.row.contact_email || "—"}</span>
      ),
    },
    {
      id: "contact_name",
      header: "Contact",
      priority: "secondary",
      cell: (entry) => (
        <span className="block truncate text-sm">{entry.row.contact_name || "—"}</span>
      ),
    },
    {
      id: "owner",
      header: "Owner email",
      priority: "tertiary",
      cell: (entry) => (
        <span className="block truncate text-sm">{entry.row.owner_email || "—"}</span>
      ),
    },
  ];

  const hasPreview = previewRows.length > 0;

  return (
    <>
      <WorkspaceHeader
        context="Acquire"
        title="Import leads"
        description="Two steps: the file is validated against live owners, then committed. Nothing is written until you commit."
        backHref={{ to: "/leads", label: "Lead Inbox" }}
      />

      <div className="space-y-6 px-4 py-6 md:px-6">
        <section className="space-y-3">
          <SectionHeader title="1. Choose a file" description={PARSE_HELP} />

          <Card>
            <CardContent className="space-y-3 p-4">
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground hover:bg-accent/30">
                <Upload className="h-4 w-4" aria-hidden="true" />
                {isValidating ? "Validating…" : (fileName ?? "Choose a CSV file")}
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  disabled={isValidating || isCommitting}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    // Reset the input so re-picking the same file after a failed parse fires
                    // `change` again instead of doing nothing.
                    e.target.value = "";
                    if (file) void onFile(file);
                  }}
                />
              </label>

              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">company_name</span> and{" "}
                <span className="font-medium text-foreground">contact_email</span> are required.{" "}
                <span className="font-medium text-foreground">contact_name</span>,{" "}
                <span className="font-medium text-foreground">contact_phone</span>,{" "}
                <span className="font-medium text-foreground">owner_email</span> and{" "}
                <span className="font-medium text-foreground">enquiry_text</span> are optional. An{" "}
                <span className="font-medium text-foreground">owner_email</span> that matches no one
                skips the row.
              </p>
              <p className="text-xs text-muted-foreground">{DUPLICATE_HELP}</p>
            </CardContent>
          </Card>

          {parsedEmpty && !isValidating && (
            <EmptyWorkspaceState title="No data rows found in that file" description={PARSE_HELP} />
          )}
        </section>

        {hasPreview && (
          <section className="space-y-3">
            <SectionHeader title="2. Review what will happen" description={DUPLICATE_HELP} />

            <MetricStrip
              metrics={[
                {
                  label: "Rows in file",
                  value: rows.length,
                  hint: fileName ?? "parsed rows",
                },
                {
                  label: "Will be imported",
                  value: valid.length,
                  hint: "passed validation",
                  tone: valid.length > 0 ? "success" : "neutral",
                },
                {
                  label: "Will be skipped",
                  value: errors.length,
                  hint: "rejected by validation",
                  tone: errors.length > 0 ? "warning" : "neutral",
                },
              ]}
              columns={3}
            />

            <Card className="p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={show}
                  onValueChange={(value) =>
                    navigate({
                      search: (current) => ({
                        ...current,
                        show: value as "all" | "valid" | "errors",
                      }),
                      replace: true,
                    })
                  }
                >
                  <SelectTrigger className="h-9 w-[200px]" aria-label="Filter preview rows">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All rows</SelectItem>
                    <SelectItem value="valid">Will be imported</SelectItem>
                    <SelectItem value="errors">Will be skipped</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground" aria-live="polite">
                  Showing {formatCount(shownRows.length)} of {formatCount(previewRows.length)} rows
                </span>
              </div>
            </Card>

            <ResponsiveRecordList
              caption="Import preview"
              columns={columns}
              rows={shownRows}
              rowKey={(entry) => entry.key}
              renderCard={(entry) => (
                <div className="space-y-1">
                  <span className="font-medium">{entry.row.company_name || "(no company)"}</span>
                  <p className="text-xs text-muted-foreground">
                    {entry.row.contact_email || "no contact email"} ·{" "}
                    {entry.row.owner_email || "no owner"}
                  </p>
                  <p
                    className={
                      entry.reason === null
                        ? "text-xs text-muted-foreground"
                        : "text-xs text-destructive"
                    }
                  >
                    {entry.reason === null ? "Will be imported" : `Skipped — ${entry.reason}`}
                  </p>
                </div>
              )}
            />

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => void commit()} disabled={valid.length === 0 || isCommitting}>
                {isCommitting
                  ? "Committing…"
                  : `Commit ${formatCount(valid.length)} row${valid.length === 1 ? "" : "s"}`}
              </Button>
              <span className="text-xs text-muted-foreground">
                {valid.length === 0
                  ? "No row passed validation, so there is nothing to commit."
                  : `${formatCount(errors.length)} row${
                      errors.length === 1 ? "" : "s"
                    } will be skipped.`}
              </span>
            </div>
          </section>
        )}

        {summary && (
          <section className="space-y-3">
            <SectionHeader title="3. Done" description="This import is complete." />
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                  Imported
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-4 pt-0 text-sm">
                <p className="tabular-nums">
                  {formatCount(summary.created)} lead{summary.created === 1 ? "" : "s"} created,{" "}
                  {formatCount(summary.updated)} updated, {formatCount(summary.skipped)} skipped.
                </p>
                <p className="text-xs text-muted-foreground">
                  Choose another file above to run a second import. Re-running the same file will
                  not duplicate anything — every row it already covers is reported as skipped.
                </p>
                <Button size="sm" variant="outline" asChild>
                  <Link to="/leads">
                    <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" /> Lead Inbox
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </section>
        )}
      </div>
    </>
  );
}
