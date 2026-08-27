import type { ReactNode } from "react";
import { Mail, Phone, Star, UserRoundX } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyWorkspaceState } from "@/components/sales";
import { formatDate } from "@/lib/format";
import type { AccountContact } from "@/lib/types";

/**
 * Coverage gaps, named one by one.
 *
 * Instruction §9.5 asks for an explicit "No decision-maker identified" / "No champion
 * identified" signal when the data says so, and the previous single line — "Missing
 * coverage: decision maker, champion." — read as a note about the page rather than a
 * finding about the account. Each gap is now its own statement with the action that closes
 * it, because they are closed by different work: finding the buyer is not the same job as
 * growing an advocate.
 */
const COVERAGE_GAPS = [
  {
    role: "decision_maker" as const,
    title: "No decision-maker identified",
    action: "Nobody on this account can sign. Identify the budget holder before quoting.",
  },
  {
    role: "champion" as const,
    title: "No champion identified",
    action: "No internal advocate is recorded. A champion is what carries a renewal.",
  },
];

export type StakeholderMapProps = {
  contacts: AccountContact[];
  /** Rendered beside the section heading, e.g. an "Add stakeholder" button. */
  action?: ReactNode;
  /** Per-contact edit control. Omitted entirely when the caller cannot write. */
  renderContactAction?: (contact: AccountContact) => ReactNode;
};

export function StakeholderMap({ contacts, action, renderContactAction }: StakeholderMapProps) {
  const gaps = COVERAGE_GAPS.filter(
    (gap) => !contacts.some((contact) => contact.relationship_role === gap.role),
  );

  if (contacts.length === 0) {
    return (
      <EmptyWorkspaceState
        icon={UserRoundX}
        title="No stakeholders recorded"
        description="Add a decision maker, a champion, a daily user and a finance or procurement contact to give this relationship real coverage."
        action={action}
      />
    );
  }

  return (
    <div className="space-y-4">
      {action && <div className="flex justify-end">{action}</div>}

      {gaps.length > 0 && (
        <ul className="space-y-2">
          {gaps.map((gap) => (
            <li
              key={gap.role}
              className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground"
            >
              <UserRoundX className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-medium">{gap.title}</p>
                <p className="text-warning-foreground/90">{gap.action}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {contacts.map((contact) => (
          <Card key={contact.id}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{contact.name}</p>
                    {contact.is_primary && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">
                        <Star className="h-3 w-3" aria-hidden="true" />
                        Primary
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {contact.title ?? "No title"}
                    {contact.department ? ` - ${contact.department}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge value={contact.relationship_role} />
                  {renderContactAction?.(contact)}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>Influence: {contact.influence_level}</span>
                <span>Sentiment: {contact.sentiment}</span>
                <span>Strength: {contact.relationship_strength}</span>
              </div>

              <div className="space-y-1 text-xs text-muted-foreground">
                {contact.email && (
                  <p className="flex items-center gap-1 break-all">
                    <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
                    {contact.email}
                  </p>
                )}
                {contact.phone && (
                  <p className="flex items-center gap-1">
                    <Phone className="h-3 w-3 shrink-0" aria-hidden="true" />
                    {contact.phone}
                  </p>
                )}
                <p>Last contacted: {formatDate(contact.last_contacted_at)}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
