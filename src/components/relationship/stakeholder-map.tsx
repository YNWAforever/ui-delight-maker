import { Mail, Phone, Star } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import type { AccountContact } from "@/lib/types";

export function StakeholderMap({ contacts }: { contacts: AccountContact[] }) {
  const hasDecisionMaker = contacts.some(
    (contact) => contact.relationship_role === "decision_maker",
  );
  const hasChampion = contacts.some((contact) => contact.relationship_role === "champion");

  if (contacts.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
        No stakeholders yet. Add a decision maker, champion, daily user, and finance or procurement
        contact to improve relationship coverage.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {(!hasDecisionMaker || !hasChampion) && (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground">
          Missing coverage: {!hasDecisionMaker && "decision maker"}
          {!hasDecisionMaker && !hasChampion ? ", " : ""}
          {!hasChampion && "champion"}.
        </div>
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
                        <Star className="h-3 w-3" />
                        Primary
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {contact.title ?? "No title"}
                    {contact.department ? ` - ${contact.department}` : ""}
                  </p>
                </div>
                <StatusBadge value={contact.relationship_role} className="shrink-0" />
              </div>

              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>Influence: {contact.influence_level}</span>
                <span>Sentiment: {contact.sentiment}</span>
                <span>Strength: {contact.relationship_strength}</span>
              </div>

              <div className="space-y-1 text-xs text-muted-foreground">
                {contact.email && (
                  <p className="flex items-center gap-1 break-all">
                    <Mail className="h-3 w-3 shrink-0" />
                    {contact.email}
                  </p>
                )}
                {contact.phone && (
                  <p className="flex items-center gap-1">
                    <Phone className="h-3 w-3 shrink-0" />
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
