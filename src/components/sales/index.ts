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
// Superseded by EmptyWorkspaceState in ./states; kept while the eleven routes migrate.
export { WorkSurfaceEmpty } from "./work-surface-empty";

// Global states. One file because a route picks exactly one of them, and their copy only
// works when it is written against the others.
export {
  EmptyWorkspaceState,
  ErrorState,
  FilteredEmptyState,
  LoadingSkeleton,
  PermissionDeniedState,
  StaleDataIndicator,
  type EmptyWorkspaceStateProps,
  type ErrorStateKind,
  type ErrorStateProps,
  type FilteredEmptyStateProps,
  type LoadingSkeletonProps,
  type LoadingSkeletonVariant,
  type PermissionDeniedStateProps,
  type StaleDataIndicatorProps,
} from "./states";

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
  COLUMN_PRIORITY_CLASS,
  DataTableShell,
  RowActionsMenu,
  type ColumnDef,
  type ColumnPriority,
  type DataTableShellProps,
} from "./data-table-shell";
export { ResponsiveRecordList, type ResponsiveRecordListProps } from "./responsive-record-list";

// Status badges. They keep their existing path — `@/components/status-badge` has more than
// thirty importers and moving the file would be churn with no behavioural change — but they
// are re-exported here so workspace code has one import surface for the shared vocabulary.
export {
  LifecycleBadge,
  StatusBadge,
  type LifecycleBadgeProps,
  type StatusBadgeProps,
} from "@/components/status-badge";
