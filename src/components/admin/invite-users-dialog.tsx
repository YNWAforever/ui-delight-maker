import { type FormEvent, type RefObject, useEffect, useRef, useState } from "react";
import { ProfileSearchCombobox } from "@/components/people/profile-search-combobox";
import {
  Dialog,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { invitationInputSchema } from "@/lib/admin/schemas";
import type { UserRole } from "@/lib/admin/types";
import { toSafeErrorMessage } from "@/lib/errors";
import {
  describeDelivery,
  readActivationLinks,
  type ActivationLink,
} from "@/lib/invitation-delivery";
import { getUserRoleLabel } from "@/lib/status-labels";
import { ActivationLinkList } from "./activation-link-list";

type InviteInput = {
  email: string;
  role: UserRole;
  primaryDepartmentId?: string | null;
  managerProfileId?: string | null;
  initialTeamIds: string[];
};

type InviteUsersDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (invitations: InviteInput[]) => Promise<unknown> | unknown;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  departments?: readonly { id: string; name: string }[];
  teams?: readonly { id: string; name: string }[];
};

function parseEmails(value: string) {
  return [
    ...new Set(
      value
        .split(/[,\n;]+/)
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

export function InviteUsersDialog({
  open,
  onOpenChange,
  onSubmit,
  triggerRef,
  departments = [],
  teams = [],
}: InviteUsersDialogProps) {
  const emailRef = useRef<HTMLTextAreaElement>(null);
  const [emailText, setEmailText] = useState("");
  const [role, setRole] = useState<UserRole>("sales");
  const [departmentId, setDepartmentId] = useState("");
  const [managerProfileId, setManagerProfileId] = useState("");
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [activationLinks, setActivationLinks] = useState<ActivationLink[]>([]);

  // Hidden rather than unmounted, so without this the previous batch's error, success line,
  // activation links and selected teams are still on screen the next time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setResultMessage(null);
    setActivationLinks([]);
  }, [open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const emails = parseEmails(emailText);
    if (
      emails.length === 0 ||
      emails.some((email) => !email.includes("@") || email.endsWith("@"))
    ) {
      setError("Enter at least one valid email address.");
      return;
    }

    /**
     * Validation with `safeParse`, and inside the guarded path.
     *
     * The pre-check above only tests for an `@` that is not the last character, so
     * `"@fimmick.com"` passes it and then `z.email()` rejects. The `.parse` used to sit
     * *outside* the `try`, so that `ZodError` escaped this handler entirely: `setError`
     * never ran, `setSubmitting` never ran, and the user saw nothing at all while the
     * button stayed live. Naming the address that failed is the part that lets them fix it.
     */
    const invitations: InviteInput[] = [];
    for (const email of emails) {
      const parsed = invitationInputSchema.safeParse({
        email,
        role,
        primaryDepartmentId: departmentId || undefined,
        managerProfileId: managerProfileId || undefined,
        initialTeamIds: teamIds,
      });
      if (!parsed.success) {
        setError(`${email} is not a valid invitation. Check the address and the optional fields.`);
        return;
      }
      invitations.push(parsed.data);
    }

    setError(null);
    setResultMessage(null);
    setActivationLinks([]);
    setSubmitting(true);
    try {
      const result = await onSubmit(invitations);
      setResultMessage(describeDelivery(result, invitations.length));
      setActivationLinks(readActivationLinks(result));
      setEmailText("");
    } catch (submissionError) {
      setError(toSafeErrorMessage(submissionError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && submitting) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogPortal>
        <DialogOverlay className="bg-black/40" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-4 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-y-auto rounded-md border border-border bg-background shadow-xl md:top-1/2 md:-translate-y-1/2"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            emailRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            if (!triggerRef?.current) return;
            event.preventDefault();
            triggerRef.current.focus();
          }}
          onEscapeKeyDown={(event) => {
            if (submitting) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (submitting) event.preventDefault();
          }}
        >
          {" "}
          <button
            type="button"
            aria-label="Close invitation dialog"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
            className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
          <div className="border-b border-border px-5 py-4 pr-14">
            <DialogTitle className="text-base font-semibold text-foreground">
              Invite users
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs text-muted-foreground">
              Invitations expire in seven days and use the selected role as the initial access
              baseline.
            </DialogDescription>
          </div>
          <form onSubmit={submit} className="space-y-4 px-5 py-5">
            <label className="block text-sm font-medium text-foreground">
              Email addresses
              <textarea
                ref={emailRef}
                aria-label="Email addresses"
                name="invitation-emails"
                rows={4}
                value={emailText}
                onChange={(event) => setEmailText(event.target.value)}
                placeholder="person@fimmick.com"
                className="mt-1 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <span className="mt-1 block text-xs font-normal text-muted-foreground">
                Separate multiple addresses with commas or new lines.
              </span>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium text-foreground">
                Role
                <select
                  aria-label="Invitation role"
                  value={role}
                  onChange={(event) => setRole(event.target.value as UserRole)}
                  className="mt-1 min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="sales">Sales</option>
                  <option value="client_success">Client Success</option>
                  <option value="accounting">Accounting</option>
                  <option value="read_only">Read Only</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </label>
              <label className="text-sm font-medium text-foreground">
                Department
                {departments.length > 0 ? (
                  <select
                    aria-label="Invitation department"
                    value={departmentId}
                    onChange={(event) => setDepartmentId(event.target.value)}
                    className="mt-1 min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">No department</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    aria-label="Invitation department"
                    value={departmentId}
                    onChange={(event) => setDepartmentId(event.target.value)}
                    placeholder="Department ID (optional)"
                    className="mt-1 min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                )}
              </label>
            </div>

            <ProfileSearchCombobox
              purpose="admin_directory"
              label="Invitation manager"
              value={managerProfileId}
              onChange={setManagerProfileId}
            />

            {teams.length > 0 ? (
              <fieldset>
                <legend className="text-sm font-medium text-foreground">Initial teams</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {teams.map((team) => (
                    <label
                      key={team.id}
                      className="flex items-center gap-2 text-sm text-muted-foreground"
                    >
                      <input
                        type="checkbox"
                        checked={teamIds.includes(team.id)}
                        onChange={(event) =>
                          setTeamIds((current) =>
                            event.target.checked
                              ? [...current, team.id]
                              : current.filter((id) => id !== team.id),
                          )
                        }
                      />
                      {team.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}

            <div className="rounded-md border border-border bg-muted/20 px-3 py-3 text-sm">
              <p className="font-medium text-foreground">Effective access preview</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                The invitee starts with the {getUserRoleLabel(role)} role, optional organization
                scope, and any selected teams.
              </p>
            </div>

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            {resultMessage ? (
              <p role="status" className="text-sm text-muted-foreground">
                {resultMessage}
              </p>
            ) : null}
            <ActivationLinkList links={activationLinks} />

            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
                className="min-h-9 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {resultMessage ? "Close" : "Cancel"}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="min-h-9 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {submitting ? "Sending…" : "Send invitations"}
              </button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
