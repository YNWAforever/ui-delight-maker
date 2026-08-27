import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { convertWonLead } from "@/server-functions/leads";
import { addMonthsToDateString } from "@/lib/engagement-utils";
import { toSafeErrorMessage } from "@/lib/errors";
import type { Engagement, Lead, Product, Quote } from "@/lib/types";

const DEFAULT_TERM_MONTHS = 12;

interface WonConversionDialogProps {
  lead: Lead | null;
  products: Product[];
  matchingQuote: Quote | null;
  onClose: () => void;
  onDone: () => void;
}

export function WonConversionDialog({
  lead,
  products,
  matchingQuote,
  onClose,
  onDone,
}: WonConversionDialogProps) {
  const navigate = useNavigate();
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [value, setValue] = useState(matchingQuote?.total_value ?? 0);
  const [billingPeriod, setBillingPeriod] = useState<Engagement["billing_period"]>("monthly");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [renewalDate, setRenewalDate] = useState("");
  const [renewalDateTouched, setRenewalDateTouched] = useState(false);
  /**
   * `convertWonLead` creates a client *and* an engagement, so a second click is an
   * expensive duplicate rather than a wasted request. The flag is set before the await and
   * cleared only on failure: on success the dialog unmounts through `onDone`.
   */
  const [submitting, setSubmitting] = useState(false);

  // Auto-fill the renewal date from start_date + the selected product's
  // default_term_months (falling back to 12 months), matching the same
  // date-math markEngagementRenewed uses for existing engagements. Once the
  // user edits the field directly we stop overwriting their choice — a
  // salesperson may need to override it for a negotiated term.
  useEffect(() => {
    if (renewalDateTouched) return;
    if (!startDate) return;
    const selectedProduct = products.find((p) => p.id === productId);
    const termMonths = selectedProduct?.default_term_months ?? DEFAULT_TERM_MONTHS;
    setRenewalDate(addMonthsToDateString(startDate, termMonths));
  }, [productId, startDate, products, renewalDateTouched]);

  const confirm = async () => {
    if (!lead || submitting) return;
    setSubmitting(true);
    try {
      const result = await convertWonLead({
        data: {
          leadId: lead.id,
          productId,
          value,
          billingPeriod,
          startDate,
          renewalDate: renewalDate || undefined,
          quoteId: matchingQuote?.id,
        },
      });
      toast.success(`${lead.company_name} is now a client engagement`);
      onDone();
      navigate({ to: "/clients/$id", params: { id: result.clientId } });
    } catch (error) {
      // The dialog stays open with the entered values so the conversion can be retried.
      setSubmitting(false);
      toast.error(toSafeErrorMessage(error));
    }
  };

  return (
    <Dialog
      open={lead !== null}
      onOpenChange={(open) => {
        if (submitting) return;
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set up the client engagement</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="conversion-product" className="text-xs">
              Product
            </Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger id="conversion-product" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="conversion-value" className="text-xs">
              Value (HKD)
            </Label>
            <Input
              id="conversion-value"
              name="value"
              type="number"
              inputMode="numeric"
              className="mt-1"
              value={value}
              onChange={(e) => setValue(Number(e.target.value) || 0)}
            />
          </div>
          <div>
            <Label htmlFor="conversion-billing-period" className="text-xs">
              Billing period
            </Label>
            <Select
              value={billingPeriod}
              onValueChange={(v) => setBillingPeriod(v as Engagement["billing_period"])}
            >
              <SelectTrigger id="conversion-billing-period" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
                <SelectItem value="one_off">One-off</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="conversion-start-date" className="text-xs">
              Start date
            </Label>
            <Input
              id="conversion-start-date"
              name="start-date"
              type="date"
              className="mt-1"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="conversion-renewal-date" className="text-xs">
              Renewal date
            </Label>
            <Input
              id="conversion-renewal-date"
              name="renewal-date"
              type="date"
              className="mt-1"
              value={renewalDate}
              onChange={(e) => {
                setRenewalDateTouched(true);
                setRenewalDate(e.target.value);
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => void confirm()} disabled={!productId || submitting}>
            {submitting ? "Creating…" : "Create engagement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
