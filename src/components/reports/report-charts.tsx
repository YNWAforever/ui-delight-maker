import { BarChart3 } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState } from "@/components/empty-state";

type ReportId = "revenue" | "pipeline" | "conversion" | "agents" | "tasks";

const tooltipStyle = {
  backgroundColor: "var(--color-popover)",
  borderColor: "var(--color-border)",
  borderRadius: 8,
  fontSize: 12,
};

export function ReportChart({ report, data }: { report: ReportId; data: unknown[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 flex-col justify-center">
        <EmptyState
          icon={BarChart3}
          title="No data yet"
          description="This chart will populate once activity is recorded."
        />
      </div>
    );
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        {renderChart(report, data)}
      </ResponsiveContainer>
    </div>
  );
}

function renderChart(report: ReportId, data: unknown[]) {
  if (report === "revenue") {
    return (
      <AreaChart data={data}>
        <Grid />
        <CategoryAxis dataKey="week" />
        <ValueAxis />
        <Tooltip contentStyle={tooltipStyle} />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke="var(--color-primary)"
          fill="var(--color-primary)"
          fillOpacity={0.15}
          strokeWidth={2}
        />
      </AreaChart>
    );
  }

  if (report === "conversion") {
    return (
      <LineChart data={data}>
        <Grid />
        <CategoryAxis dataKey="week" />
        <ValueAxis />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="leads"
          stroke="var(--color-primary)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="won"
          stroke="var(--color-success)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    );
  }

  if (report === "agents") {
    return (
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
        <XAxis
          type="number"
          stroke="var(--color-muted-foreground)"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          dataKey="name"
          type="category"
          width={100}
          stroke="var(--color-muted-foreground)"
          fontSize={11}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip contentStyle={tooltipStyle} />
        <Bar dataKey="runs" fill="var(--color-primary)" radius={[0, 6, 6, 0]} />
      </BarChart>
    );
  }

  return (
    <BarChart data={data}>
      <Grid />
      <CategoryAxis dataKey={report === "pipeline" ? "stage" : "day"} />
      <ValueAxis />
      <Tooltip contentStyle={tooltipStyle} />
      {report === "tasks" ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
      <Bar
        dataKey={report === "pipeline" ? "count" : "created"}
        fill={report === "pipeline" ? "var(--color-primary)" : "var(--color-info)"}
        radius={[6, 6, 0, 0]}
      />
      {report === "tasks" ? (
        <Bar dataKey="completed" fill="var(--color-success)" radius={[6, 6, 0, 0]} />
      ) : null}
    </BarChart>
  );
}

function Grid() {
  return <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />;
}

function CategoryAxis({ dataKey }: { dataKey: string }) {
  return (
    <XAxis
      dataKey={dataKey}
      stroke="var(--color-muted-foreground)"
      fontSize={12}
      tickLine={false}
      axisLine={false}
    />
  );
}

function ValueAxis() {
  return (
    <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
  );
}
