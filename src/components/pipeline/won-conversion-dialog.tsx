import { useState } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { convertWonLead } from "@/server-functions/leads";
import type { Engagement, Lead, Product, Quote } from "@/lib/types";

interface WonConversionDialogProps {
  lead: Lead | null;
  products: Product[];
  matchingQuote: Quote | null;
  onClose: () => void;
  onDone: () => void;
}

export function WonConversionDialog({ lead, products, matchingQuote, onClose, onDone }: WonConversionDialogProps) {
  const navigate = useNavigate();
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [value, setValue] = useState(matchingQuote?.total_value ?? 0);
  const [billingPeriod, setBillingPeriod] = useState<Engagement["billing_period"]>("monthly");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));

  const confirm = async () => {
    if (!lead) return;
    const result = await convertWonLead({
      data: {
        leadId: lead.id,
        productId,
        value,
        billingPeriod,
        startDate,
        quoteId: matchingQuote?.id,
      },
    });
    toast.success(`${lead.company_name} is now a client engagement`);
    onDone();
    navigate({ to: "/clients/$id", params: { id: result.clientId } });
  };

  return (
    <Dialog open={lead !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set up the client engagement</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className="text-xs">Product</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger className="mt-1">
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
            <Label className="text-xs">Value (HKD)</Label>
            <Input type="number" className="mt-1" value={value} onChange={(e) => setValue(Number(e.target.value) || 0)} />
          </div>
          <div>
            <Label className="text-xs">Billing period</Label>
            <Select value={billingPeriod} onValueChange={(v) => setBillingPeriod(v as Engagement["billing_period"])}>
              <SelectTrigger className="mt-1">
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
          <div className="sm:col-span-2">
            <Label className="text-xs">Start date</Label>
            <Input type="date" className="mt-1" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={confirm} disabled={!productId}>
            Create engagement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
