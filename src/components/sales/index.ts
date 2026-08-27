export { CommandHeader } from "./command-header";
// The convergence of CommandHeader and PageHeader. Both remain exported while routes
// migrate to this one across Phases C-E; they are removed once nothing imports them.
export { WorkspaceHeader, type WorkspaceHeaderProps } from "./workspace-header";
export { SalesContextPanel } from "./context-panel";
export { MetricStrip, type SalesMetric } from "./metric-strip";
export { WorkSurfaceEmpty } from "./work-surface-empty";
