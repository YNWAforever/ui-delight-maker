import { useState, useEffect, useRef } from "react";
import { Search } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { WorkspaceSearchResult } from "@/server/repositories/workspace-search";
import { searchWorkspace } from "@/server-functions/search";

export function GlobalSearch({ iconOnly = false }: { iconOnly?: boolean }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [results, setResults] = useState<WorkspaceSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setPanelOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (iconOnly) setPanelOpen(true);
        wrapRef.current?.querySelector("input")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [iconOnly]);

  useEffect(() => {
    if (panelOpen) wrapRef.current?.querySelector("input")?.focus();
  }, [panelOpen]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 3) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    const timeout = window.setTimeout(() => {
      void searchWorkspace({ data: { query: term, limit: 20 } })
        .then((nextResults) => {
          if (!cancelled) setResults(nextResults);
        })
        .catch(() => {
          if (!cancelled) setError("Search failed. Check your connection and try again.");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [q, retryKey]);

  useEffect(() => setActive(0), [q]);

  const go = (r: WorkspaceSearchResult) => {
    setOpen(false);
    setPanelOpen(false);
    setQ("");
    navigate({ to: r.href as never });
  };

  const onResultClick = (event: React.MouseEvent<HTMLAnchorElement>, r: WorkspaceSearchResult) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey
    ) {
      return;
    }
    event.preventDefault();
    go(r);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      go(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setPanelOpen(false);
    }
  };

  const field = (
    <div className="relative w-full">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        aria-label="Search workspace"
        name="global-search"
        autoComplete="off"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => q.trim().length >= 3 && setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search companies, people, leads, quotes, clients, tasks..."
        className="h-9 pl-9"
      />
      {open && q.trim().length >= 3 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-96 overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
          {loading ? (
            <div role="status" className="px-3 py-6 text-center text-sm text-muted-foreground">
              Searching...
            </div>
          ) : error ? (
            <div role="alert" className="space-y-3 px-3 py-5 text-center text-sm">
              <p className="text-destructive">{error}</p>
              <Button variant="outline" size="sm" onClick={() => setRetryKey((value) => value + 1)}>
                Retry search
              </Button>
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No results for "{q.trim()}"
            </div>
          ) : (
            results.map((r, i) => (
              <a
                key={`${r.type}-${r.id}`}
                href={r.href}
                onMouseEnter={() => setActive(i)}
                onClick={(event) => onResultClick(event, r)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-sm px-3 py-2 text-left text-sm",
                  i === active && "bg-accent text-accent-foreground",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{r.title}</div>
                  <div className="truncate text-xs text-muted-foreground">{r.subtitle}</div>
                </div>
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {r.type}
                </span>
              </a>
            ))
          )}
        </div>
      )}
    </div>
  );

  if (iconOnly) {
    return (
      <div ref={wrapRef}>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Search"
          onClick={() => setPanelOpen((v) => !v)}
        >
          <Search className="h-4 w-4" />
        </Button>
        {panelOpen && (
          <div className="fixed inset-x-0 top-14 z-30 border-b border-border bg-background p-3 shadow-md">
            {field}
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="w-full">
      {field}
    </div>
  );
}
