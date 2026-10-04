import { useEffect, useId, useState } from "react";
import { crmQueryKeys } from "@/lib/query-keys";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  listAssignableProfilesFn,
  resolveAssignableProfileFn,
} from "@/server-functions/assignable-profiles";
import type { AssignableProfile, ProfilePurpose } from "@/server/repositories/assignable-profiles";

const FILTER_PRESETS = [
  { value: "all", label: "All owners" },
  { value: "mine", label: "My tasks" },
  { value: "unassigned", label: "Unassigned" },
] as const;

export function ProfileSearchCombobox({
  purpose,
  label,
  value,
  onChange,
  onSelected,
  resourceId,
  emptyLabel,
}: {
  purpose: ProfilePurpose;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSelected?: (person: AssignableProfile) => void;
  resourceId?: string;
  /** What "nobody selected" means here, e.g. "Anyone" for a filter. Defaults per purpose. */
  emptyLabel?: string;
}) {
  // The id comes from React, not the label, so two pickers can share a visible label (the
  // inline and panel reviewer pickers did, which is why one was labelled "(inline)", UX-18).
  const inputId = useId();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [extra, setExtra] = useState<
    Array<{ id: string; displayName: string; isEligible: boolean; reason: string | null }>
  >([]);
  const [nextCursor, setNextCursor] = useState<string | null | undefined>(undefined);
  const selectedId = value && !["all", "mine", "unassigned"].includes(value) ? value : null;
  const selected = useQuery({
    queryKey: [...crmQueryKeys.people.all(), "selected", purpose, resourceId ?? null, selectedId],
    queryFn: () =>
      resolveAssignableProfileFn({
        data: { purpose, id: selectedId!, resourceId },
      }),
    enabled: Boolean(selectedId),
  });
  const matches = useQuery({
    queryKey: [
      ...crmQueryKeys.people.all(),
      "search",
      purpose,
      resourceId ?? null,
      debouncedSearch,
    ],
    queryFn: () =>
      listAssignableProfilesFn({
        data: { purpose, query: debouncedSearch, limit: 50, resourceId },
      }),
    enabled: debouncedSearch.length > 0,
  });
  const suggestions =
    debouncedSearch === search.trim() ? [...(matches.data?.items ?? []), ...extra] : [];

  function updateSearch(next: string) {
    setSearch(next);
    setExtra([]);
    setNextCursor(undefined);
  }

  async function loadMore() {
    const cursor = nextCursor === undefined ? matches.data?.nextCursor : nextCursor;
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await listAssignableProfilesFn({
        data: { purpose, query: debouncedSearch, cursor, limit: 50, resourceId },
      });
      setExtra((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-2">
      {purpose === "task_filter" && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={label + " presets"}>
          {FILTER_PRESETS.map((preset) => (
            <Button
              key={preset.value}
              type="button"
              size="sm"
              variant={value === preset.value ? "secondary" : "outline"}
              onClick={() => onChange(preset.value)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      )}
      {(purpose === "task_assign" || purpose === "approval_reviewer") && (
        <Button type="button" size="sm" variant="outline" onClick={() => onChange("")}>
          Unassigned
        </Button>
      )}
      {selectedId &&
      (purpose === "admin_directory" || purpose === "successor" || purpose === "admin_access") ? (
        <Button type="button" size="sm" variant="outline" onClick={() => onChange("")}>
          Clear {label}
        </Button>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Selected:{" "}
        {selectedId
          ? (selected.data?.displayName ?? "Name unavailable")
          : emptyLabel
            ? emptyLabel
            : purpose === "task_filter"
              ? (FILTER_PRESETS.find((preset) => preset.value === value)?.label ?? "All owners")
              : purpose === "job_sheet_owner_filter"
                ? "All owners"
                : "Unassigned"}
      </p>
      <label htmlFor={inputId} className="text-sm font-medium">
        {label} search
      </label>
      <Input
        id={inputId}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={suggestions.length > 0}
        value={search}
        onChange={(event) => updateSearch(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") updateSearch("");
          if (event.key === "Enter" && suggestions[0]) {
            event.preventDefault();
            onChange(suggestions[0].id);
            onSelected?.(suggestions[0]);
            updateSearch("");
          }
        }}
        placeholder={"Search " + label.toLowerCase() + " by name"}
      />
      {search.trim() && (
        <div className="max-h-48 overflow-auto rounded-md border border-border" role="listbox">
          {matches.isLoading && <p className="p-2 text-sm">Searching people…</p>}
          {!matches.isLoading && suggestions.length === 0 && (
            <p className="p-2 text-sm text-muted-foreground">No eligible people found</p>
          )}
          {suggestions.map((person) => (
            <Button
              key={person.id}
              type="button"
              variant="ghost"
              className="w-full justify-start"
              disabled={!person.isEligible}
              onClick={() => {
                onChange(person.id);
                onSelected?.(person);
                updateSearch("");
              }}
            >
              {person.displayName}
            </Button>
          ))}
          {(nextCursor === undefined ? matches.data?.nextCursor : nextCursor) && (
            <Button
              type="button"
              variant="ghost"
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              Load more people
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
