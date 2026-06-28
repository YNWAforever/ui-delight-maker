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
  owners: Array<{ id: string; name: string }>;
  onFiltersChange: (filters: PipelineFilters) => void;
}

export function PipelineToolbar({ filters, owners, onFiltersChange }: PipelineToolbarProps) {
  const patch = (next: Partial<PipelineFilters>) => onFiltersChange({ ...filters, ...next });
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

        <Select value={filters.owner ?? "all"} onValueChange={(owner) => patch({ owner })}>
          <SelectTrigger className="h-9 w-[160px]" aria-label="Filter by owner">
            <SelectValue />
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
    </Card>
  );
}
