import { useMemo, useState, useEffect, useRef } from "react";
import { Search } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

import { Input } from "@/components/ui/input";
import { formatCurrencyAmount } from "@/lib/format";
import { cn } from "@/lib/utils";

// Search data — will be replaced with a server-side full-text search in a future task.
// Using empty arrays until the backend search endpoint is available.
const leads: {
  id: string;
  company_name: string;
  contact_name: string;
  contact_email: string;
  status: string;
}[] = [];
const quotes: {
  id: string;
  number: string;
  status: string;
  currency: string;
  total_value: number;
}[] = [];
const clients: { id: string; company_name: string; industry: string; tier: string }[] = [];
const tasks: {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  due_date: string;
}[] = [];

type Result = {
  id: string;
  type: "Lead" | "Quote" | "Client" | "Task";
  title: string;
  subtitle: string;
  href: string;
};

export function GlobalSearch() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        wrapRef.current?.querySelector("input")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo<Result[]>(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    const out: Result[] = [];

    for (const l of leads) {
      if (
        l.company_name.toLowerCase().includes(term) ||
        l.contact_name.toLowerCase().includes(term) ||
        l.contact_email.toLowerCase().includes(term)
      ) {
        out.push({
          id: l.id,
          type: "Lead",
          title: l.company_name,
          subtitle: `${l.contact_name} · ${l.status}`,
          href: `/leads/${l.id}`,
        });
      }
    }
    for (const qt of quotes) {
      if (
        qt.number.toLowerCase().includes(term) ||
        qt.id.toLowerCase().includes(term) ||
        qt.status.toLowerCase().includes(term)
      ) {
        out.push({
          id: qt.id,
          type: "Quote",
          title: qt.number,
          subtitle: `${qt.status} · ${formatCurrencyAmount(qt.total_value, qt.currency)}`,
          href: `/quotes/${qt.id}`,
        });
      }
    }
    for (const c of clients) {
      if (c.company_name.toLowerCase().includes(term) || c.industry.toLowerCase().includes(term)) {
        out.push({
          id: c.id,
          type: "Client",
          title: c.company_name,
          subtitle: `${c.industry} · ${c.tier}`,
          href: `/clients/${c.id}`,
        });
      }
    }
    for (const t of tasks) {
      if (t.title.toLowerCase().includes(term) || t.description.toLowerCase().includes(term)) {
        out.push({
          id: t.id,
          type: "Task",
          title: t.title,
          subtitle: `${t.status} · ${t.priority} · due ${t.due_date}`,
          href: "/tasks",
        });
      }
    }
    return out.slice(0, 20);
  }, [q]);

  useEffect(() => setActive(0), [q]);

  const go = (r: Result) => {
    setOpen(false);
    setQ("");
    navigate({ to: r.href as never });
  };

  const onResultClick = (event: React.MouseEvent<HTMLAnchorElement>, r: Result) => {
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
    }
  };

  return (
    <div ref={wrapRef} className="relative w-full">
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
        onFocus={() => q && setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search leads, quotes, clients, tasks…  (⌘K)"
        className="h-9 pl-9"
      />
      {open && q && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-96 overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
          {results.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No results for “{q}”
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
}
