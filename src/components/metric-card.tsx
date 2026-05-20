import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string | number;
  hint?: string;
  delta?: number;
  icon?: LucideIcon;
}

export function MetricCard({ label, value, hint, delta, icon: Icon }: MetricCardProps) {
  const up = (delta ?? 0) >= 0;
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
            {(hint || typeof delta === "number") && (
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                {typeof delta === "number" && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5 font-medium",
                      up ? "text-success" : "text-destructive",
                    )}
                  >
                    {up ? (
                      <ArrowUpRight className="h-3 w-3" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3" />
                    )}
                    {up ? "+" : ""}
                    {delta}%
                  </span>
                )}
                {hint && <span>{hint}</span>}
              </div>
            )}
          </div>
          {Icon && (
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
