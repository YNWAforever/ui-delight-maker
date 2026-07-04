import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Upload } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { parseClientImportCsv, type ImportRow, type ImportRowError } from "@/lib/csv-import";
import { commitClientImportFn, validateClientImportRows } from "@/server-functions/client-import";

export const Route = createFileRoute("/clients/import")({
  head: () => ({ meta: [{ title: "Import clients — Fimmick ClientOps" }] }),
  component: ImportWizard,
});

function ImportWizard() {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [valid, setValid] = useState<ImportRow[]>([]);
  const [errors, setErrors] = useState<ImportRowError[]>([]);
  const [summary, setSummary] = useState<{
    created: number;
    updated: number;
    skipped: number;
  } | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);

  const onFile = async (file: File) => {
    setIsValidating(true);
    try {
      const text = await file.text();
      const parsed = parseClientImportCsv(text);
      setRows(parsed);
      setSummary(null);
      const result = await validateClientImportRows({ data: { rows: parsed } });
      setValid(result.valid);
      setErrors(result.errors);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to parse or validate CSV");
    } finally {
      setIsValidating(false);
    }
  };

  const commit = async () => {
    setIsCommitting(true);
    try {
      const result = await commitClientImportFn({ data: { rows: valid } });
      setSummary({ ...result, skipped: errors.length });
      toast.success(`Import complete: ${result.created} created, ${result.updated} updated`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to commit import");
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Import clients"
        description="Upload a CSV of clients, contacts, and engagements."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/clients">
              <ArrowLeft className="mr-2 h-4 w-4" /> All clients
            </Link>
          </Button>
        }
      />

      <div className="space-y-4 px-6 py-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Upload</CardTitle>
          </CardHeader>
          <CardContent>
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground hover:bg-accent/30">
              <Upload className="h-4 w-4" />
              {isValidating ? "Validating…" : "Choose a CSV file"}
              <input
                type="file"
                accept=".csv"
                className="hidden"
                disabled={isValidating}
                onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
              />
            </label>
          </CardContent>
        </Card>

        {rows.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                2. Preview — {valid.length} valid, {errors.length} error
                {errors.length === 1 ? "" : "s"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {errors.length > 0 && (
                <ul className="mb-4 space-y-1 text-sm text-destructive">
                  {errors.map((e, i) => (
                    <li key={i}>
                      {e.row.company_name || "(no company)"}: {e.reason}
                    </li>
                  ))}
                </ul>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {valid.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{r.company_name}</TableCell>
                      <TableCell>{r.owner_email}</TableCell>
                      <TableCell>{r.product_name}</TableCell>
                      <TableCell>{r.value}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Button
                className="mt-4"
                onClick={commit}
                disabled={valid.length === 0 || isCommitting}
              >
                {isCommitting
                  ? "Committing…"
                  : `Commit ${valid.length} row${valid.length === 1 ? "" : "s"}`}
              </Button>
            </CardContent>
          </Card>
        )}

        {summary && (
          <Card>
            <CardContent className="p-4 text-sm">
              3. Done — Created {summary.created}, updated {summary.updated}, skipped{" "}
              {summary.skipped}.
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
