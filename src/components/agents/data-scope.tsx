import type { AgentDataFilter } from "@/lib/agent-data-scope";

export function DemoOriginLabel({ value }: { value: boolean | null | undefined }) {
  return (
    <span className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground">
      {value === true ? "Demo" : value === false ? "Non-demo" : "Origin unknown"}
    </span>
  );
}

export function AgentDataScope({
  value,
  onChange,
}: {
  value: AgentDataFilter;
  onChange: (value: AgentDataFilter) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <label className="flex items-center gap-2">
        Data origin
        <select
          className="rounded-md border bg-background p-2 focus-visible:ring-2 focus-visible:ring-ring"
          value={value}
          onChange={(event) => onChange(event.target.value as AgentDataFilter)}
        >
          <option value="all">All origins</option>
          <option value="demo">Confirmed demo</option>
          <option value="non-demo">Confirmed non-demo</option>
          <option value="unknown">Unknown origin</option>
        </select>
      </label>
      <p className="text-muted-foreground">
        Statistics include demo data (含示範資料). This filter narrows the loaded list; statistics
        keep all origins.
      </p>
    </div>
  );
}
