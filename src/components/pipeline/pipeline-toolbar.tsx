import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AiReviewState, PipelineFilters, SlaState } from "@/lib/pipeline";
import type { LeadSource } from "@/lib/types";

const SOURCES: Array<LeadSource | "all"> = [
  "all",
  "website",
  "whatsapp",
  "email",
  "linkedin",
  "csv",
  "event",
  "manual",
];

const URGENCY: Array<SlaState | "all"> = ["all", "overdue", "due_today", "clear"];
const AI_STATES: Array<AiReviewState | "all"> = [
  "all",
  "running",
  "ready_for_review",
  "approved",
  "sent",
  "failed",
  "idle",
];

interface PipelineToolbarProps {
  filters: PipelineFilters;
  /**
   * Assignable owners, from the server. Empty means there is no owner source yet — the
   * Select is then disabled with the reason spelled out rather than offered with a single
   * inert option, and rather than filled from a fixture list whose ids match no profile
   * row (every selection would filter the board to nothing).
   */
  owners: Array<{ id: string; name: string }>;
  onFiltersChange: (filters: PipelineFilters) => void;
}

const OWNER_UNAVAILABLE_ID = "pipeline-owner-filter-unavailable";
const OWNER_UNAVAILABLE_REASON =
  "Filtering by owner needs an assignable-owner list from the server, which does not exist yet.";

export function PipelineToolbar({ filters, owners, onFiltersChange }: PipelineToolbarProps) {
  const patch = (next: Partial<PipelineFilters>) => onFiltersChange({ ...filters, ...next });
  const ownerFilterUnavailable = owners.length === 0;
  const hasFilters =
    Boolean(filters.search) ||
    (filters.source != null && filters.source !== "all") ||
    (filters.owner != null && filters.owner !== "all") ||
    (filters.urgency != null && filters.urgency !== "all") ||
    (filters.aiState != null && filters.aiState !== "all");

  return (
    <Card className="rounded-md p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Search leads"
            value={filters.search ?? ""}
            onChange={(event) => patch({ search: event.target.value })}
            placeholder="Search company, contact, email, phone, enquiry"
            className="h-9 pl-8"
          />
        </div>

        <Select
          value={filters.source ?? "all"}
          onValueChange={(source) => patch({ source: source as PipelineFilters["source"] })}
        >
          <SelectTrigger className="h-9 w-[150px]" aria-label="Filter by source">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SOURCES.map((source) => (
              <SelectItem key={source} value={source} className="capitalize">
                {source === "all" ? "All sources" : source}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.owner ?? "all"}
          disabled={ownerFilterUnavailable}
          onValueChange={(owner) => patch({ owner })}
        >
          <SelectTrigger
            className="h-9 w-[160px]"
            aria-label="Filter by owner"
            aria-describedby={ownerFilterUnavailable ? OWNER_UNAVAILABLE_ID : undefined}
            title={ownerFilterUnavailable ? OWNER_UNAVAILABLE_REASON : undefined}
          >
            <SelectValue placeholder="All owners" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All owners</SelectItem>
            {owners.map((owner) => (
              <SelectItem key={owner.id} value={owner.id}>
                {owner.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.urgency ?? "all"}
          onValueChange={(urgency) => patch({ urgency: urgency as PipelineFilters["urgency"] })}
        >
          <SelectTrigger className="h-9 w-[150px]" aria-label="Filter by urgency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {URGENCY.map((urgency) => (
              <SelectItem key={urgency} value={urgency}>
                {urgency === "all" ? "All urgency" : urgency.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.aiState ?? "all"}
          onValueChange={(aiState) => patch({ aiState: aiState as PipelineFilters["aiState"] })}
        >
          <SelectTrigger className="h-9 w-[170px]" aria-label="Filter by AI status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AI_STATES.map((aiState) => (
              <SelectItem key={aiState} value={aiState}>
                {aiState === "all" ? "All AI states" : aiState.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              onFiltersChange({
                search: "",
                source: "all",
                owner: "all",
                urgency: "all",
                aiState: "all",
              })
            }
          >
            <X className="mr-2 h-4 w-4" />
            Clear
          </Button>
        )}
      </div>

      {ownerFilterUnavailable && (
        <p id={OWNER_UNAVAILABLE_ID} className="mt-2 text-xs text-muted-foreground">
          {OWNER_UNAVAILABLE_REASON}
        </p>
      )}
    </Card>
  );
}
