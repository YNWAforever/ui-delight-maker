import { ChevronLeft, ChevronRight } from "lucide-react";
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

type EventAttendee = Pick<
  CampaignMember,
  | "id"
  | "contact_id"
  | "account_id"
  | "raw_company_name"
  | "raw_contact_name"
  | "raw_email"
  | "raw_phone"
  | "attendee_status"
  | "interests"
  | "follow_up_status"
  | "conversion_outcome"
>;

function fallbackName(member: EventAttendee) {
  if (member.raw_contact_name?.trim()) return member.raw_contact_name;
  if (member.raw_email?.trim()) return member.raw_email;
  if (member.contact_id) return "Matched contact";
  return "Unnamed attendee";
}

function fallbackCompany(member: EventAttendee) {
  if (member.raw_company_name?.trim()) return member.raw_company_name;
  if (member.account_id) return "Matched account";
  return "Unmatched company";
}

function fallbackPhone(member: EventAttendee) {
  return member.raw_phone?.trim() ? member.raw_phone : "No phone";
}

export function EventAttendeeTable({
  members,
  onCreateTasks,
  isCreatingTasks = false,
  page,
  pageSize,
  totalCount,
  onPageChange,
}: {
  members: EventAttendee[];
  onCreateTasks: () => void;
  isCreatingTasks?: boolean;
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

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
          Showing {members.length} of {totalCount} attendee{totalCount === 1 ? "" : "s"}.
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
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Page {page} of {totalPages}
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous attendee page"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next attendee page"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
