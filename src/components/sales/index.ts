export { CommandHeader } from "./command-header";
// The convergence of CommandHeader and PageHeader. Both remain exported while routes
// migrate to this one across Phases C-E; they are removed once nothing imports them.
export { WorkspaceHeader, type WorkspaceHeaderProps } from "./workspace-header";
export { SalesContextPanel } from "./context-panel";
export {
  MetricStrip,
  type MetricColumns,
  type MetricStripProps,
  type MetricTone,
  type SalesMetric,
} from "./metric-strip";
export { WorkSurfaceEmpty } from "./work-surface-empty";

// Workflow composites.
export {
  ActivityTimeline,
  type ActivityActor,
  type ActivityEvent,
  type ActivityTimelineProps,
} from "./activity-timeline";
export {
  AttentionQueue,
  type AttentionItem,
  type AttentionQueueProps,
  type AttentionSeverity,
} from "./attention-queue";
export {
  FilterToolbar,
  type FilterControl,
  type FilterOption,
  type FilterToolbarProps,
} from "./filter-toolbar";
export {
  RecordSummaryPanel,
  type RecordSummaryPanelProps,
  type RecordSummarySection,
} from "./record-summary-panel";
export { SectionHeader, type SectionHeaderProps } from "./section-header";
export { StickyActionBar, type StickyActionBarProps } from "./sticky-action-bar";

// Record lists. A card list is the same record list at a narrower viewport, not a
// different component family, so both ship together.
export {
  DataTableShell,
  RowActionsMenu,
  type ColumnDef,
  type ColumnPriority,
  type DataTableShellProps,
} from "./data-table-shell";
export { ResponsiveRecordList, type ResponsiveRecordListProps } from "./responsive-record-list";
