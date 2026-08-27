import { Link } from "@tanstack/react-router";
import { Bot } from "lucide-react";

import { formatDate, formatDateTime, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * What happened to a record, newest-first, in the order the caller supplies.
 *
 * The rule this component exists to enforce: an event performed by an agent is marked as
 * such, in text, next to the actor's name. An AI run that drafted a quote and a person who
 * approved one look identical in a raw event log, and a timeline that renders both as
 * "Renewal Assistant · sent quote" invites a human to read an automated step as a
 * confirmed human decision. The marker is words plus an icon — not a colour, not a
 * different avatar — so it survives greyscale, screen readers and a screenshot in Slack.
 *
 * Every date goes through `src/lib/format.ts`, which pins locale and timezone. Timestamps
 * formatted inline would differ between the server render and the first client render and
 * React would report a hydration mismatch.
 */
export type ActivityActor = {
  name: string;
  /** True when the actor is an agent or automation rather than a person. */
  isAgent?: boolean;
};

export type ActivityEvent = {
  id: string;
  /** ISO timestamp. Formatted here, never by the caller. */
  at: string;
  /** Raw event kind, e.g. "quote_sent". Underscores are humanised for display. */
  kind: string;
  title: string;
  description?: string;
  actor?: ActivityActor;
  /** Where the event leads, if anywhere. */
  href?: string;
};

export type ActivityTimelineProps = {
  /** Rendered in the given order; this component does not sort. */
  events: ActivityEvent[];
  /** Group consecutive events under a day heading and show only the time on each row. */
  groupByDay?: boolean;
  emptyMessage?: string;
  className?: string;
};

type DayGroup = { day: string; events: ActivityEvent[] };

/**
 * Groups *consecutive* events, so the grouping follows the caller's order instead of
 * silently re-ordering it. The key is the already-formatted date string rather than a
 * second date pipeline, which means the heading and the grouping can never disagree about
 * which day an event belongs to.
 */
function groupConsecutiveByDay(events: ActivityEvent[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const event of events) {
    const day = formatDate(event.at);
    const current = groups[groups.length - 1];
    if (current && current.day === day) {
      current.events.push(event);
    } else {
      groups.push({ day, events: [event] });
    }
  }
  return groups;
}

function ActorLabel({ actor }: { actor: ActivityActor }) {
  if (!actor.isAgent) {
    return <span>{actor.name}</span>;
  }

  return (
    <>
      <span>{actor.name}</span>
      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-medium text-foreground">
        <Bot className="h-3 w-3" aria-hidden="true" />
        AI agent
      </span>
    </>
  );
}

function TimelineEventRow({
  event,
  showDateOnRow,
}: {
  event: ActivityEvent;
  showDateOnRow: boolean;
}) {
  return (
    <li className="relative pl-5">
      {/* Decorative rail marker; the row's meaning is entirely in its text. */}
      <span className="absolute left-0 top-2 h-2 w-2 rounded-full bg-border" aria-hidden="true" />
      <div className="flex flex-wrap items-baseline gap-x-2">
        {event.href ? (
          <Link to={event.href} className="text-sm font-medium text-foreground hover:underline">
            {event.title}
          </Link>
        ) : (
          <span className="text-sm font-medium text-foreground">{event.title}</span>
        )}
        <span className="text-xs text-muted-foreground">{event.kind.replace(/_/g, " ")}</span>
      </div>
      {event.description && (
        <p className="mt-0.5 text-sm text-muted-foreground">{event.description}</p>
      )}
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <time dateTime={event.at}>
          {showDateOnRow ? formatDateTime(event.at) : formatTime(event.at)}
        </time>
        {event.actor && <ActorLabel actor={event.actor} />}
      </p>
    </li>
  );
}

export function ActivityTimeline({
  events,
  groupByDay = false,
  emptyMessage = "No activity recorded yet.",
  className,
}: ActivityTimelineProps) {
  if (events.length === 0) {
    return <p className={cn("text-sm text-muted-foreground", className)}>{emptyMessage}</p>;
  }

  if (!groupByDay) {
    return (
      <ul className={cn("space-y-4", className)}>
        {events.map((event) => (
          <TimelineEventRow key={event.id} event={event} showDateOnRow />
        ))}
      </ul>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      {groupConsecutiveByDay(events).map((group, index) => (
        <div key={`${group.day}-${index}`}>
          {/* h3: a timeline sits under a SectionHeader's h2, so day headings are level 3. */}
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {group.day}
          </h3>
          <ul className="mt-3 space-y-4">
            {group.events.map((event) => (
              <TimelineEventRow key={event.id} event={event} showDateOnRow={false} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
