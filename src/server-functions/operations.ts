import { createServerFn } from "@tanstack/react-start";
import { requireCapability, requireCapabilityChecks } from "@/server/auth/authorization.server";
import {
  loadJobSheetRead,
  loadRenewalsRead,
  loadReportDataset,
  loadReportSummary,
  type ReportId,
  type ReportRange,
} from "@/server/read-models/operations";
import type { RenewalWindowFilter, RenewalsReadFilters } from "@/server/repositories/engagements";
import type { RenewalRisk } from "@/lib/types";

const REPORT_RANGES = new Set<ReportRange>(["7d", "30d", "90d"]);
const REPORT_IDS = new Set<ReportId>(["revenue", "pipeline", "conversion", "agents", "tasks"]);
const RENEWAL_WINDOWS = new Set<RenewalWindowFilter>(["all", "overdue", "30", "60", "90", "later"]);
const RENEWAL_RISKS = new Set<RenewalRisk>(["low", "medium", "high"]);

function requiredText(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function parseJobSheetInput(data: unknown) {
  const candidate = (data ?? {}) as Record<string, unknown>;
  return { id: requiredText(candidate.id, "Job sheet ID") };
}

function dateOnly(value: unknown) {
  const candidate =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? value
      : new Date().toISOString().slice(0, 10);
  if (Number.isNaN(Date.parse(`${candidate}T00:00:00Z`))) throw new Error("Invalid as-of date");
  return candidate;
}

function parseRenewalsInput(data: unknown): RenewalsReadFilters {
  const candidate = (data ?? {}) as Record<string, unknown>;
  const renewalWindow = String(candidate.renewalWindow ?? "all") as RenewalWindowFilter;
  if (!RENEWAL_WINDOWS.has(renewalWindow)) throw new Error("Invalid renewal window");

  const riskValue = candidate.risk === "all" ? undefined : candidate.risk;
  if (riskValue !== undefined && !RENEWAL_RISKS.has(riskValue as RenewalRisk)) {
    throw new Error("Invalid renewal risk");
  }

  const productValue = candidate.productId === "all" ? undefined : candidate.productId;
  return {
    renewalWindow,
    risk: riskValue as RenewalRisk | undefined,
    productId:
      typeof productValue === "string" && productValue.trim() ? productValue.trim() : undefined,
    asOf: dateOnly(candidate.asOf),
    page: typeof candidate.page === "number" ? candidate.page : undefined,
    limit: typeof candidate.limit === "number" ? candidate.limit : undefined,
  };
}

function parseRange(data: unknown): { range: ReportRange } {
  const candidate = (data ?? {}) as Record<string, unknown>;
  const range = String(candidate.range ?? "30d") as ReportRange;
  if (!REPORT_RANGES.has(range)) throw new Error("Invalid report range");
  return { range };
}

function parseDatasetInput(data: unknown): { report: ReportId; range: ReportRange } {
  const candidate = (data ?? {}) as Record<string, unknown>;
  const report = String(candidate.report) as ReportId;
  if (!REPORT_IDS.has(report)) throw new Error("Invalid report");
  return { report, ...parseRange(candidate) };
}

export const getJobSheetRead = createServerFn({ method: "GET" })
  .validator(parseJobSheetInput)
  .handler(async ({ data }) => {
    await requireCapabilityChecks([
      {
        capability: "job_sheets.view",
        target: { resourceType: "job_sheet", resourceId: data.id },
      },
      { capability: "quotes.view" },
      { capability: "accounts.view" },
    ]);
    return loadJobSheetRead(data.id);
  });

export const getRenewalsRead = createServerFn({ method: "GET" })
  .validator(parseRenewalsInput)
  .handler(async ({ data }) => {
    await requireCapabilityChecks([
      { capability: "engagements.view" },
      { capability: "products.view" },
    ]);
    return loadRenewalsRead(data);
  });

export const getReportSummary = createServerFn({ method: "GET" })
  .validator(parseRange)
  .handler(async ({ data }) => {
    await requireCapability("reports.view");
    return loadReportSummary(data);
  });

export const getReportDataset = createServerFn({ method: "GET" })
  .validator(parseDatasetInput)
  .handler(async ({ data }) => {
    await requireCapability("reports.view");
    return loadReportDataset(data);
  });
