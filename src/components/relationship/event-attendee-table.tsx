import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CampaignMember } from "@/lib/types";

function fallbackName(member: CampaignMember) {
  if (member.raw_contact_name?.trim()) return member.raw_contact_name;
  if (member.raw_email?.trim()) return member.raw_email;
  if (member.contact_id) return "Matched contact";
  return "Unnamed attendee";
}

function fallbackCompany(member: CampaignMember) {
  if (member.raw_company_name?.trim()) return member.raw_company_name;
  if (member.account_id) return "Matched account";
  return "Unmatched company";
}

function fallbackPhone(member: CampaignMember) {
  return member.raw_phone?.trim() ? member.raw_phone : "No phone";
}

export function EventAttendeeTable({
  members,
  onCreateTasks,
  isCreatingTasks = false,
}: {
  members: CampaignMember[];
  onCreateTasks: () => void;
  isCreatingTasks?: boolean;
}) {
  if (members.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
        No attendees yet. Import attendees to match accounts, capture interests, and queue follow-up
        work.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {members.length} attendee{members.length === 1 ? "" : "s"} in follow-up scope.
        </p>
        <Button size="sm" onClick={onCreateTasks} disabled={isCreatingTasks}>
          {isCreatingTasks ? "Creating tasks..." : "Create follow-up tasks"}
        </Button>
      </div>
      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Attendee</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Attendee status</TableHead>
              <TableHead>Interests</TableHead>
              <TableHead>Follow-up</TableHead>
              <TableHead>Conversion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.id}>
                <TableCell className="min-w-40">
                  <div className="space-y-1">
                    <p className="font-medium">{fallbackName(member)}</p>
                    <p className="text-xs text-muted-foreground">{fallbackPhone(member)}</p>
                  </div>
                </TableCell>
                <TableCell className="min-w-40">
                  <div className="space-y-1">
                    <p className="font-medium">{fallbackCompany(member)}</p>
                    <p className="text-xs text-muted-foreground">
                      {member.account_id ? "Matched account" : "Awaiting account match"}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge value={member.attendee_status} />
                </TableCell>
                <TableCell className="min-w-44 text-sm text-muted-foreground">
                  {member.interests && member.interests.length > 0
                    ? member.interests.join(", ")
                    : "None captured"}
                </TableCell>
                <TableCell>
                  <StatusBadge value={member.follow_up_status} />
                </TableCell>
                <TableCell>
                  <StatusBadge
                    value={member.conversion_outcome ?? "none"}
                    label={(member.conversion_outcome ?? "none").replace(/_/g, " ")}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
