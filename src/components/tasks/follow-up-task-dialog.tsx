import { useId, useState, type FormEvent } from "react";
import { CalendarPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getBusinessDateKey } from "@/lib/business-date";
import { toSafeErrorMessage } from "@/lib/errors";
import { getStatusLabel } from "@/lib/status-labels";
import { createTask } from "@/server-functions/tasks";

type Priority = "low" | "medium" | "high";

const PRIORITIES: readonly Priority[] = ["low", "medium", "high"];
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
/** TaskCreateSchema's title limit. */
const TITLE_MAX_LENGTH = 255;

export type FollowUpTaskDialogProps = {
  /** The record the follow-up belongs to, passed to `createTask` unchanged. */
  link: { lead_id?: string; client_id?: string; account_id?: string };
  /** Prefilled title, e.g. "Follow up with Harbour Beauty Lab". */
  defaultTitle: string;
  /** Runs after the task exists, to refresh whatever shows it. */
  onCreated?: () => Promise<unknown> | void;
};

/**
 * A follow-up task, created from the record it is about.
 *
 * The lead page had no way to plan the next step: its notes section said notes were not stored,
 * and the Tasks dialog cannot link a task to a lead although `createTask` already accepts
 * `lead_id`, `client_id` and `account_id` (audit UX-10). Errors stay in the dialog beside the
 * form, so the typed title is not lost behind a toast.
 */
export function FollowUpTaskDialog({ link, defaultTitle, onCreated }: FollowUpTaskDialogProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(() => defaultTitle.slice(0, TITLE_MAX_LENGTH));
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const titleId = useId();
  const titleErrorId = useId();
  const dueId = useId();
  const priorityId = useId();

  const changeOpen = (next: boolean) => {
    if (saving) return;
    if (next) {
      // Computed on open rather than during render, so server and client markup agree. Capped
      // at the schema's 255 because maxLength only limits typing, not a prefilled value.
      setTitle(defaultTitle.slice(0, TITLE_MAX_LENGTH));
      setDue(getBusinessDateKey(new Date(Date.now() + TWO_DAYS_MS)));
      setPriority("medium");
      setTitleError(null);
      setFormError(null);
    }
    setOpen(next);
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (!title.trim()) {
      setTitleError("Say what needs to happen next.");
      return;
    }

    setTitleError(null);
    setFormError(null);
    setSaving(true);
    try {
      await createTask({
        data: { title: title.trim(), due_date: due || null, priority, ...link },
      });
      setOpen(false);
      toast.success("Follow-up task created");
      await onCreated?.();
    } catch (error) {
      setFormError(toSafeErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <CalendarPlus className="mr-2 h-4 w-4" aria-hidden="true" />
          Add follow-up task
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add follow-up task</DialogTitle>
          <DialogDescription>
            The task is linked to this record and appears in Tasks straight away.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" noValidate onSubmit={(event) => void submit(event)}>
          <div className="space-y-1.5">
            <Label htmlFor={titleId}>What needs to happen</Label>
            <Input
              id={titleId}
              name="title"
              autoComplete="off"
              maxLength={TITLE_MAX_LENGTH}
              value={title}
              aria-invalid={titleError ? true : undefined}
              aria-describedby={titleError ? titleErrorId : undefined}
              onChange={(event) => {
                setTitle(event.target.value);
                if (titleError) setTitleError(null);
              }}
            />
            {titleError ? (
              <p id={titleErrorId} className="text-xs text-tone-danger-fg">
                {titleError}
              </p>
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={dueId}>Due</Label>
              <Input
                id={dueId}
                name="due_date"
                type="date"
                value={due}
                onChange={(event) => setDue(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={priorityId}>Priority</Label>
              <Select value={priority} onValueChange={(value) => setPriority(value as Priority)}>
                <SelectTrigger id={priorityId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {getStatusLabel("priority", value).label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {formError ? (
            <p role="alert" className="text-sm text-tone-danger-fg">
              {formError}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => changeOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Creating…" : "Create task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
