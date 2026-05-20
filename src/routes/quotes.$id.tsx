import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Check, Download, FileText, Send } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { leadById, quoteById, userById, type QuoteStatus } from "@/lib/mock-data";

export const Route = createFileRoute("/quotes/$id")({
  loader: ({ params }) => {
    const quote = quoteById(params.id);
    if (!quote) throw notFound();
    return { quote };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.quote.number ?? "Quote"} — ClientOps` },
      { name: "description", content: `Quote details, approval status, and PDF preview.` },
    ],
  }),
  notFoundComponent: () => (
    <div className="p-8">
      <h1 className="text-xl font-semibold">Quote not found</h1>
      <Link to="/quotes" className="mt-2 inline-block text-sm text-primary hover:underline">
        ← Back to quotes
      </Link>
    </div>
  ),
  component: QuoteDetail,
});

const TIMELINE: QuoteStatus[] = [
  "draft",
  "pending_approval",
  "approved",
  "sent",
  "viewed",
  "accepted",
];

function QuoteDetail() {
  const { quote } = Route.useLoaderData();
  const lead = leadById(quote.lead_id);
  const creator = userById(quote.created_by);
  const approver = quote.approved_by ? userById(quote.approved_by) : null;

  const reachedIdx = TIMELINE.indexOf(quote.status as QuoteStatus);

  return (
    <>
      <PageHeader
        title={quote.number}
        description={`${lead?.company_name ?? "—"} · ${quote.currency} ${quote.total_value.toLocaleString()}`}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/quotes">
                <ArrowLeft className="mr-2 h-4 w-4" /> All quotes
              </Link>
            </Button>
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" /> Download PDF
            </Button>
            <Button size="sm" onClick={() => toast.success("Quote sent to client.")}>
              <Send className="mr-2 h-4 w-4" /> Send to client
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Line items</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 text-left font-medium">Service</th>
                    <th className="py-2 text-right font-medium">Qty</th>
                    <th className="py-2 text-right font-medium">Unit</th>
                    <th className="py-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {quote.line_items.map((li) => (
                    <tr key={li.id}>
                      <td className="py-3">
                        <div className="font-medium">{li.service}</div>
                        <div className="text-xs text-muted-foreground">{li.description}</div>
                      </td>
                      <td className="py-3 text-right tabular-nums">{li.qty}</td>
                      <td className="py-3 text-right tabular-nums">
                        {li.unit_price.toLocaleString()}
                      </td>
                      <td className="py-3 text-right font-medium tabular-nums">
                        {(li.qty * li.unit_price).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border">
                    <td colSpan={3} className="py-3 text-right text-sm font-semibold">
                      Total
                    </td>
                    <td className="py-3 text-right text-base font-semibold tabular-nums">
                      {quote.currency} {quote.total_value.toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">PDF preview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex aspect-[1/1.2] items-center justify-center rounded-md border-2 border-dashed border-border bg-muted/30">
                <div className="text-center">
                  <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
                  <p className="mt-3 text-sm font-medium">{quote.number}.pdf</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Generated when the quote is approved.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {TIMELINE.map((stage, idx) => {
                  const reached = idx <= reachedIdx;
                  const current = idx === reachedIdx;
                  return (
                    <li key={stage} className="flex items-center gap-3">
                      <div
                        className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                          reached
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-muted-foreground"
                        }`}
                      >
                        {reached ? <Check className="h-3 w-3" /> : <span className="text-[10px]">{idx + 1}</span>}
                      </div>
                      <span
                        className={`text-sm capitalize ${
                          current ? "font-semibold" : reached ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {stage.replace(/_/g, " ")}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Meta</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Status">
                <StatusBadge value={quote.status} />
              </Row>
              <Row label="Lead">
                {lead ? (
                  <Link to="/leads/$id" params={{ id: lead.id }} className="text-primary hover:underline">
                    {lead.company_name}
                  </Link>
                ) : (
                  "—"
                )}
              </Row>
              <Row label="Created by">{creator?.name ?? "—"}</Row>
              <Row label="Approved by">{approver?.name ?? "Pending"}</Row>
              <Separator />
              <Row label="Valid until">{quote.valid_until}</Row>
              <Row label="Created">{new Date(quote.created_at).toLocaleString()}</Row>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{children}</span>
    </div>
  );
}
