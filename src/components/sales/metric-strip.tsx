import type { LucideIcon } from "lucide-react";

import { MetricCard } from "@/components/metric-card";

export interface SalesMetric {
  label: string;
  value: string | number;
  hint?: string;
  delta?: number;
  icon?: LucideIcon;
}

export function MetricStrip({ metrics, columns = 4 }: { metrics: SalesMetric[]; columns?: 3 | 4 }) {
  const desktopClass = columns === 3 ? "xl:grid-cols-3" : "xl:grid-cols-4";

  return (
    <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${desktopClass}`}>
      {metrics.map((metric) => (
        <MetricCard key={metric.label} {...metric} />
      ))}
    </div>
  );
}
