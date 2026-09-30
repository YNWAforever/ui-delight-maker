import { useEffect, useState } from "react";
import { ProfileSearchCombobox } from "@/components/people/profile-search-combobox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toSafeErrorMessage } from "@/lib/errors";
import type { JobSheet } from "@/lib/types";
import type { UpdateJobSheetHeaderInput } from "@/server/repositories/job-sheets";

export function HandoffHeaderForm({
  jobSheet,
  editable,
  onSave,
}: {
  jobSheet: JobSheet;
  editable: boolean;
  onSave: (input: UpdateJobSheetHeaderInput) => Promise<void>;
}) {
  const [accountingOwner, setAccountingOwner] = useState(jobSheet.accounting_owner ?? "");
  const [poNumber, setPoNumber] = useState(jobSheet.po_number ?? "");
  const [noPoReason, setNoPoReason] = useState(jobSheet.no_po_reason ?? "");
  const [clientOrder, setClientOrder] = useState(jobSheet.client_order_number ?? "");
  const [billingInstructions, setBillingInstructions] = useState(
    jobSheet.special_billing_instructions ?? "",
  );
  const [acceptedScopeSummary, setAcceptedScopeSummary] = useState(
    jobSheet.accepted_scope_summary ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = jobSheet.status === "accepted" || Boolean(jobSheet.locked_at);

  useEffect(() => {
    setAccountingOwner(jobSheet.accounting_owner ?? "");
    setPoNumber(jobSheet.po_number ?? "");
    setNoPoReason(jobSheet.no_po_reason ?? "");
    setClientOrder(jobSheet.client_order_number ?? "");
    setBillingInstructions(jobSheet.special_billing_instructions ?? "");
    setAcceptedScopeSummary(jobSheet.accepted_scope_summary ?? "");
  }, [
    jobSheet.id,
    jobSheet.updated_at,
    jobSheet.accounting_owner,
    jobSheet.po_number,
    jobSheet.no_po_reason,
    jobSheet.client_order_number,
    jobSheet.special_billing_instructions,
    jobSheet.accepted_scope_summary,
  ]);

  async function submit() {
    if (busy) return;
    setError(null);
    if (!accountingOwner) {
      setError("Select an active accounting owner.");
      return;
    }
    setBusy(true);
    try {
      await onSave({
        accountingOwner,
        poNumber: poNumber.trim() || null,
        noPoReason: poNumber.trim() ? null : noPoReason.trim() || null,
        clientOrder: clientOrder.trim() || null,
        billingInstructions: billingInstructions.trim() || null,
        acceptedScopeSummary: acceptedScopeSummary.trim() || null,
      });
    } catch (reason) {
      setError(toSafeErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Handoff header</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Set the accounting owner and record the purchase order or a documented reason before
          acceptance. Accepted commercial fields are locked.
        </p>
        {editable ? (
          <fieldset disabled={locked || busy}>
            <ProfileSearchCombobox
              purpose="job_sheet_owner"
              label="Accounting owner"
              value={accountingOwner}
              onChange={setAccountingOwner}
              resourceId={jobSheet.id}
            />
          </fieldset>
        ) : (
          <p className="text-sm">Accounting owner: {jobSheet.accounting_owner ?? "Unassigned"}</p>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="job-sheet-po">PO number</Label>
            <Input
              id="job-sheet-po"
              value={poNumber}
              onChange={(event) => setPoNumber(event.target.value)}
              disabled={!editable || busy || locked}
              maxLength={100}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="job-sheet-client-order">Client order</Label>
            <Input
              id="job-sheet-client-order"
              value={clientOrder}
              onChange={(event) => setClientOrder(event.target.value)}
              disabled={!editable || busy || locked}
              maxLength={100}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="job-sheet-no-po-reason">No PO reason</Label>
          <Textarea
            id="job-sheet-no-po-reason"
            value={noPoReason}
            onChange={(event) => setNoPoReason(event.target.value)}
            disabled={!editable || busy || locked || Boolean(poNumber.trim())}
            maxLength={500}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="job-sheet-scope">Accepted scope summary</Label>
          <Textarea
            id="job-sheet-scope"
            value={acceptedScopeSummary}
            onChange={(event) => setAcceptedScopeSummary(event.target.value)}
            disabled={!editable || busy || locked}
            maxLength={2000}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="job-sheet-billing-instructions">Billing instructions</Label>
          <Textarea
            id="job-sheet-billing-instructions"
            value={billingInstructions}
            onChange={(event) => setBillingInstructions(event.target.value)}
            disabled={!editable || busy}
            maxLength={2000}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {editable && (
          <Button type="button" disabled={busy} onClick={() => void submit()}>
            {busy ? "Saving…" : "Save handoff header"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
