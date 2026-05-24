import { useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, ChevronRight, Download, Filter, Medal, Trophy, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { formatCompactHKD } from "@/lib/format";
import { agentLeaderboardDaily } from "@/lib/mock-data";

const ALL_AGENTS = Array.from(new Set(agentLeaderboardDaily.map((d) => d.agent)));
// Data window: 2026-05-06 → 2026-05-19. Use as the default range.
const DEFAULT_FROM = new Date("2026-05-13T00:00:00Z");
const DEFAULT_TO = new Date("2026-05-19T00:00:00Z");

type ThresholdState = { minRuns: number; minSuccess: number; minValue: number };

const DEFAULT_THRESHOLDS: ThresholdState = {
  minRuns: 15,
  minSuccess: 90,
  minValue: 200_000,
};

export function LeaderboardWidget() {
  const [agents, setAgents] = useState<Set<string>>(new Set(ALL_AGENTS));
  const [from, setFrom] = useState<Date>(DEFAULT_FROM);
  const [to, setTo] = useState<Date>(DEFAULT_TO);
  const [thresholds, setThresholds] = useState<ThresholdState>(DEFAULT_THRESHOLDS);

  const rows = useMemo(() => {
    const fromMs = from.getTime();
    const toMs = to.getTime() + 86_399_000; // include the "to" day
    const agg = new Map<
      string,
      { agent: string; runs: number; successes: number; value: number; days: Set<string> }
    >();
    for (const d of agentLeaderboardDaily) {
      if (!agents.has(d.agent)) continue;
      const ms = new Date(d.date + "T00:00:00Z").getTime();
      if (ms < fromMs || ms > toMs) continue;
      const existing =
        agg.get(d.agent) ??
        { agent: d.agent, runs: 0, successes: 0, value: 0, days: new Set<string>() };
      existing.runs += d.runs;
      existing.successes += d.successes;
      existing.value += d.value;
      existing.days.add(d.date);
      agg.set(d.agent, existing);
    }
    return Array.from(agg.values())
      .map((r) => ({
        ...r,
        successRate: r.runs === 0 ? 0 : Math.round((r.successes / r.runs) * 100),
        activeDays: r.days.size,
      }))
      .sort((a, b) => b.value - a.value || b.runs - a.runs);
  }, [agents, from, to]);

  const passes = (r: { runs: number; successRate: number; value: number }) =>
    r.runs >= thresholds.minRuns &&
    r.successRate >= thresholds.minSuccess &&
    r.value >= thresholds.minValue;

  const toggleAgent = (name: string) => {
    setAgents((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const resetAll = () => {
    setAgents(new Set(ALL_AGENTS));
    setFrom(DEFAULT_FROM);
    setTo(DEFAULT_TO);
    setThresholds(DEFAULT_THRESHOLDS);
  };

  const exportCSV = () => {
    const headers = ["Rank", "Agent", "Runs", "SuccessRate", "ActiveDays", "AttributedValue", "OnTarget"];
    const lines = rows.map((r, idx) => {
      const ok = passes(r);
      return [
        idx + 1,
        r.agent,
        r.runs,
        `${r.successRate}%`,
        r.activeDays,
        r.value,
        ok ? "Yes" : "No",
      ].join(",");
    });
    const meta = [
      `# Agent Leaderboard Export`,
      `# Date range: ${format(from, "yyyy-MM-dd")} to ${format(to, "yyyy-MM-dd")}`,
      `# Thresholds: minRuns=${thresholds.minRuns}, minSuccess=${thresholds.minSuccess}%, minValue=${thresholds.minValue}`,
    ];
    const csv = [...meta, headers.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leaderboard-${format(new Date(), "yyyy-MM-dd")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Leaderboard exported as CSV");
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="h-4 w-4 text-primary" /> Agent leaderboard
          </CardTitle>
          <CardDescription>
            Ranked by attributed value. Highlights respect your threshold rules.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateButton label="From" value={from} onChange={setFrom} max={to} />
          <DateButton label="To" value={to} onChange={setTo} min={from} />
          <AgentFilter agents={agents} all={ALL_AGENTS} onToggle={toggleAgent} onReset={() => setAgents(new Set(ALL_AGENTS))} />
          <ThresholdPopover value={thresholds} onChange={setThresholds} />
          <Button size="sm" variant="outline" onClick={exportCSV}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export
          </Button>
          <Button size="sm" variant="ghost" onClick={resetAll}>
            <X className="mr-1.5 h-3.5 w-3.5" /> Reset
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No runs in this range. Widen the date window or include more agents.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {rows.map((r, idx) => {
              const ok = passes(r);
              return (
                <li
                  key={r.agent}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 text-sm transition-colors",
                    ok && "bg-primary/5",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                      idx === 0
                        ? "bg-warning/20 text-warning-foreground"
                        : idx === 1
                          ? "bg-secondary text-secondary-foreground"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {idx < 3 ? <Medal className="h-3.5 w-3.5" /> : idx + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{r.agent}</span>
                      {ok && (
                        <Badge variant="outline" className="border-success/40 bg-success/10 text-success">
                          On target
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {r.activeDays} active day{r.activeDays === 1 ? "" : "s"} ·{" "}
                      <ThresholdHint label="runs" value={r.runs} min={thresholds.minRuns} />
                      {" · "}
                      <ThresholdHint label="success" value={r.successRate} min={thresholds.minSuccess} suffix="%" />
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular-nums">
                      {formatCompactHKD(r.value)}
                    </div>
                    <div
                      className={cn(
                        "text-xs tabular-nums",
                        r.value >= thresholds.minValue ? "text-success" : "text-muted-foreground",
                      )}
                    >
                      target {formatCompactHKD(thresholds.minValue)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ThresholdHint({
  label,
  value,
  min,
  suffix = "",
}: {
  label: string;
  value: number;
  min: number;
  suffix?: string;
}) {
  const ok = value >= min;
  return (
    <span className={ok ? "text-foreground" : "text-warning-foreground"}>
      {value}
      {suffix} {label}
    </span>
  );
}

function DateButton({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
  min?: Date;
  max?: Date;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-2 font-normal">
          <CalendarIcon className="h-3.5 w-3.5" />
          <span className="text-muted-foreground">{label}:</span>
          {format(value, "MMM d")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(d) => d && onChange(d)}
          disabled={(d) => (min ? d < min : false) || (max ? d > max : false)}
          defaultMonth={value}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}

function AgentFilter({
  agents,
  all,
  onToggle,
  onReset,
}: {
  agents: Set<string>;
  all: string[];
  onToggle: (name: string) => void;
  onReset: () => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-2 font-normal">
          <Filter className="h-3.5 w-3.5" />
          Agents
          <span className="rounded bg-muted px-1.5 text-[10px] tabular-nums">
            {agents.size}/{all.length}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-3">
        <div className="mb-2 flex items-center justify-between">
          <Label className="text-xs">Include agents</Label>
          <button onClick={onReset} className="text-[11px] text-muted-foreground hover:underline">
            All
          </button>
        </div>
        <ul className="space-y-1.5">
          {all.map((name) => (
            <li key={name} className="flex items-center gap-2">
              <Checkbox
                id={`lb-${name}`}
                checked={agents.has(name)}
                onCheckedChange={() => onToggle(name)}
              />
              <label htmlFor={`lb-${name}`} className="cursor-pointer text-sm">
                {name}
              </label>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function ThresholdPopover({
  value,
  onChange,
}: {
  value: ThresholdState;
  onChange: (v: ThresholdState) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-2 font-normal">
          Thresholds
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-4 p-4">
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <Label>Min runs</Label>
            <span className="tabular-nums text-muted-foreground">{value.minRuns}</span>
          </div>
          <Slider
            value={[value.minRuns]}
            min={0}
            max={80}
            step={1}
            onValueChange={([v]) => onChange({ ...value, minRuns: v })}
          />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <Label>Min success rate</Label>
            <span className="tabular-nums text-muted-foreground">{value.minSuccess}%</span>
          </div>
          <Slider
            value={[value.minSuccess]}
            min={50}
            max={100}
            step={1}
            onValueChange={([v]) => onChange({ ...value, minSuccess: v })}
          />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <Label>Min attributed value</Label>
            <span className="tabular-nums text-muted-foreground">
              {formatCompactHKD(value.minValue)}
            </span>
          </div>
          <Slider
            value={[value.minValue]}
            min={0}
            max={1_500_000}
            step={50_000}
            onValueChange={([v]) => onChange({ ...value, minValue: v })}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Rows passing all three rules are highlighted as “On target”.
        </p>
      </PopoverContent>
    </Popover>
  );
}
