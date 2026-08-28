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
import { routeQueryOptions } from "@/lib/route-query";
import { parseImportCsv, type ImportRow, type ImportRowError } from "@/lib/csv-import";
import { commitClientImportFn, validateClientImportRowsFn } from "@/server-functions/client-import";
import { getProducts } from "@/server-functions/products";

/**
 * The one piece of wizard state worth putting in the URL.
 *
 * The uploaded file cannot survive a reload, so a `step` parameter would be a promise this
 * route cannot keep. Which slice of the preview a reviewer is reading is a genuine, restorable
 * preference: on a 400-row file with 30 rejections, "errors only" is the view you want to send
 * to a colleague, and it costs nothing when no file is loaded.
 */
const clientImportSearchSchema = z.object({
  show: z.enum(["all", "valid", "errors"]).default("all").catch("all"),
});

export const Route = createFileRoute("/clients/import")({
  validateSearch: clientImportSearchSchema,
  /**
   * Validation rejects any `product_name` that is not an active product, and until now the
   * wizard gave the user no way to know what those names are — the first they heard of it was
   * "Unknown product: …" on a row they had already typed. The catalogue is a real read behind a
   * real capability, and every role that can reach this page holds it.
   */
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(
      routeQueryOptions({
        queryKey: crmQueryKeys.products.list({ activeOnly: true }),
        queryFn: () => getProducts({ data: { activeOnly: true } }),
      }),
    ),
  head: () => ({
    meta: [
      { title: "Import clients — Fimmick ClientOps" },
      {
        name: "description",
        content: "Validate a CSV of clients, contacts and engagements, then commit it.",
      },
    ],
  }),
  errorComponent: ImportErrorState,
  component: ImportWizard,
});

function ImportErrorState({ error }: { error: unknown }) {
  const router = useRouter();

  return (
    <div className="px-4 py-6 md:px-6">
      <ErrorState
        kind="server"
        error={error}
        title="The import screen did not load"
        onRetry={() => {
          void router.invalidate({ filter: (match) => match.routeId === "/clients/import" });
        }}
      />
    </div>
  );
}

type CommitSummary = { created: number; updated: number; skipped: number };

/** The four columns of the CSV this wizard actually reads back to the user. */
type PreviewRow = { key: string; row: ImportRow; reason: string | null };

const PARSE_HELP =
  "The file needs a header row plus at least one data row. company_name is required; owner_email, product_name, start_date, value, billing_period, contact_name, contact_email, industry and tier are optional.";

function ImportWizard() {
  const products = Route.useLoaderData();
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
        // `parseImportCsv` returns [] for an empty, headers-only or non-CSV file. The
        // preview card is keyed off `rows.length`, so this used to end with the label flipping
        // back to "Choose a CSV file" and nothing else said at all.
        setValid([]);
        setErrors([]);
        return;
      }

      const result = await validateClientImportRowsFn({ data: { rows: parsed } });
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
      const skipped = errors.length;
      const result = await commitClientImportFn({ data: { rows: valid } });
      setSummary({ ...result, skipped });
      /**
       * Step 3 is terminal. The commit used to leave `valid` loaded and re-enable its own
       * button: the repository dedupes clients, contacts and engagements, so a second click did
       * not duplicate rows — it appended another `activity_logs` entry and flipped every count
       * from "created" to "updated", which reads exactly like a second successful import.
       */
      setValid([]);
      setRows([]);
      setErrors([]);
      /**
       * `/clients` and `/accounts` are cached list routes with a 30s stale time, and this file
       * previously invalidated nothing — so "All clients" returned the user to the pre-import
       * list for up to half a minute after a successful import. Query keys rather than a router
       * invalidate: neither route is mounted from here, so there is no match to filter on, and
       * their loaders read through these keys on the next navigation.
       */
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: crmQueryKeys.clients.lists() }),
        queryClient.invalidateQueries({ queryKey: crmQueryKeys.accounts.lists() }),
        queryClient.invalidateQueries({ queryKey: crmQueryKeys.engagements.lists() }),
      ]);
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
      id: "owner",
      header: "Owner email",
      priority: "secondary",
      cell: (entry) => (
        <span className="block truncate text-sm">{entry.row.owner_email || "—"}</span>
      ),
    },
    {
      id: "product",
      header: "Product",
      priority: "secondary",
      cell: (entry) => (
        <span className="block truncate text-sm">{entry.row.product_name || "—"}</span>
      ),
    },
    {
      id: "value",
      header: "Value",
      priority: "tertiary",
      numeric: true,
      cell: (entry) => entry.row.value || "—",
    },
  ];

  const hasPreview = previewRows.length > 0;

  return (
    <>
      <WorkspaceHeader
        context="Retain & Grow"
        title="Import clients"
        description="Two steps: the file is validated against live products and owners, then committed. Nothing is written until you commit."
        backHref={{ to: "/clients", label: "All clients" }}
      />

      <div className="space-y-6 px-4 py-6 md:px-6">
        <section className="space-y-3">
          <SectionHeader
            title="1. Choose a file"
            description={PARSE_HELP}
            action={
              products.length > 0 ? (
                <span className="text-xs text-muted-foreground">
                  {formatCount(products.length)} active products accepted
                </span>
              ) : undefined
            }
          />

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

              {products.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">product_name</span> must be one of:{" "}
                  {products.map((product) => product.name).join(", ")}. Any other value skips the
                  row.
                </p>
              )}
            </CardContent>
          </Card>

          {parsedEmpty && !isValidating && (
            <EmptyWorkspaceState title="No data rows found in that file" description={PARSE_HELP} />
          )}
        </section>

        {hasPreview && (
          <section className="space-y-3">
            <SectionHeader
              title="2. Review what will happen"
              description="Companies already on file are updated in place rather than duplicated; contacts and engagements that already exist are left alone."
            />

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
                    {entry.row.owner_email || "no owner"} · {entry.row.product_name || "no product"}
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
                  {formatCount(summary.created)} client
                  {summary.created === 1 ? "" : "s"} created, {formatCount(summary.updated)}{" "}
                  updated, {formatCount(summary.skipped)} skipped.
                </p>
                <p className="text-xs text-muted-foreground">
                  Choose another file above to run a second import. Re-running the same file will
                  not duplicate anything, but it will report every row as updated.
                </p>
                <Button size="sm" variant="outline" asChild>
                  <Link to="/clients">
                    <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" /> All clients
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
