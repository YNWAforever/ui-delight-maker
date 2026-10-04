import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toSafeErrorMessage } from "@/lib/errors";
import { createTouchpoint } from "@/server-functions/touchpoints";
import { isAiNoteTidyAvailable, tidyTouchpointNote } from "@/server-functions/ai-note-tidy";
import type {
  ClientContact,
  Engagement,
  TouchpointNewSentiment,
  TouchpointNewType,
} from "@/lib/types";

const TYPES: TouchpointNewType[] = [
  "check_in",
  "qbr",
  "meeting",
  "call",
  "whatsapp",
  "email",
  "note",
];
const SENTIMENTS: TouchpointNewSentiment[] = ["positive", "neutral", "negative"];

interface TouchpointLoggerProps {
  clientId: string;
  engagements: (Engagement & { product_name?: string | null })[];
  contacts: ClientContact[];
  defaultEngagementId?: string | null;
  trigger: React.ReactNode;
  onLogged?: () => void | Promise<void>;
}

export function TouchpointLogger({
  clientId,
  engagements,
  contacts,
  defaultEngagementId,
  trigger,
  onLogged,
}: TouchpointLoggerProps) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<TouchpointNewType>("check_in");
  const [sentiment, setSentiment] = useState<TouchpointNewSentiment>("neutral");
  const [engagementId, setEngagementId] = useState<string>(defaultEngagementId ?? "none");
  const [contactId, setContactId] = useState<string>("none");
  const [notes, setNotes] = useState("");
  const notesRef = useRef("");
  const tidyEpoch = useRef(0);
  const [proposal, setProposal] = useState<{
    original: string;
    tidied: string;
    runId?: string | null;
  } | null>(null);
  const [aiProblem, setAiProblem] = useState<string | null>(null);
  const tidyRequestRef = useRef<{ notes: string; key: string } | null>(null);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [tidying, setTidying] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    isAiNoteTidyAvailable().then(
      (result) => setAiAvailable(result.available),
      () => setAiAvailable(false),
    );
  }, []);

  const tidy = async () => {
    if (!notes.trim() || tidying || saving) return;
    const original = notes,
      epoch = ++tidyEpoch.current;
    const key =
      tidyRequestRef.current?.notes === notes
        ? tidyRequestRef.current.key
        : globalThis.crypto.randomUUID();
    tidyRequestRef.current = { notes, key };
    setTidying(true);
    setAiProblem(null);
    setProposal(null);
    try {
      const result = await tidyTouchpointNote({ data: { notes, idempotencyKey: key } });
      if (epoch === tidyEpoch.current && notesRef.current === original)
        setProposal({ original, tidied: result.tidied, runId: result.runId });
    } catch {
      if (epoch === tidyEpoch.current && notesRef.current === original) {
        setAiProblem(
          "AI tidy did not complete. Your manual note is unchanged and can still be saved. A timeout does not confirm provider cancellation.",
        );
        toast.error("Couldn't tidy notes right now.");
      }
    } finally {
      if (epoch === tidyEpoch.current) setTidying(false);
    }
  };

  /**
   * "Save touchpoint" carried no `disabled` and `save()` had no `try`/`catch`, so two
   * clicks before the first `createTouchpoint` resolved wrote two touchpoint rows, and a
   * rejection was an unhandled promise rejection with the dialog still open and nothing
   * said. The "Tidy with AI" button one element above already had both guards.
   */
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await createTouchpoint({
        data: {
          client_id: clientId,
          engagement_id: engagementId === "none" ? null : engagementId,
          contact_id: contactId === "none" ? null : contactId,
          type,
          sentiment,
          notes: notes.trim() || null,
        },
      });
      toast.success("Touchpoint logged");
      setNotes("");
      notesRef.current = "";
      tidyEpoch.current++;
      setTidying(false);
      setAiProblem(null);
      setProposal(null);
      tidyRequestRef.current = null;
      setOpen(false);
      await onLogged?.();
    } catch (error) {
      // Dialog stays open so the note survives and the retry is one click.
      toast.error(toSafeErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (saving) return;
        if (!next) {
          tidyEpoch.current++;
          setTidying(false);
          setAiProblem(null);
          setProposal(null);
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log touchpoint</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="touchpoint-type" className="text-xs">
              Type
            </Label>
            <Select value={type} onValueChange={(v) => setType(v as TouchpointNewType)}>
              <SelectTrigger id="touchpoint-type" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="touchpoint-sentiment" className="text-xs">
              Sentiment
            </Label>
            <Select
              value={sentiment}
              onValueChange={(v) => setSentiment(v as TouchpointNewSentiment)}
            >
              <SelectTrigger id="touchpoint-sentiment" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SENTIMENTS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="touchpoint-engagement" className="text-xs">
              Engagement
            </Label>
            <Select value={engagementId} onValueChange={setEngagementId}>
              <SelectTrigger id="touchpoint-engagement" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Whole client relationship</SelectItem>
                {engagements.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.product_name ?? "Engagement"} · {e.start_date} ·{" "}
                    {e.billing_period.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="touchpoint-contact" className="text-xs">
              Contact
            </Label>
            <Select value={contactId} onValueChange={setContactId}>
              <SelectTrigger id="touchpoint-contact" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unspecified</SelectItem>
                {contacts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="touchpoint-notes" className="text-xs">
                Notes
              </Label>
              {aiAvailable && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={tidy}
                  disabled={tidying || saving || !notes.trim()}
                >
                  {tidying ? "Tidying…" : "Tidy with AI"}
                </Button>
              )}
            </div>
            <Textarea
              id="touchpoint-notes"
              name="notes"
              className="mt-1"
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                notesRef.current = e.target.value;
                setProposal(null);
              }}
              rows={4}
            />
            {aiProblem && (
              <p role="alert" className="mt-2 text-sm">
                {aiProblem}
              </p>
            )}
            {proposal && (
              <section
                className="mt-3 space-y-2 rounded border p-3"
                aria-label="Review tidied note"
              >
                <h3 className="font-medium">Review AI suggestion</h3>
                <p className="text-xs text-muted-foreground">
                  Verify all facts before choosing the suggestion. Nothing has been saved.
                </p>
                <h4 className="text-sm font-medium">Original</h4>
                <p className="whitespace-pre-wrap text-sm">{proposal.original}</p>
                <h4 className="text-sm font-medium">Suggested</h4>
                <p className="whitespace-pre-wrap text-sm">{proposal.tidied}</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setProposal(null);
                      document.getElementById("touchpoint-notes")?.focus();
                    }}
                  >
                    Keep original note
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      setNotes(proposal.tidied);
                      notesRef.current = proposal.tidied;
                      setProposal(null);
                      document.getElementById("touchpoint-notes")?.focus();
                    }}
                  >
                    Use tidied note
                  </Button>
                </div>
                {proposal.runId && (
                  <Link to="/agents" search={{ auxiliaryRun: proposal.runId }}>
                    Review Note Tidy invocation
                  </Link>
                )}
              </section>
            )}
            {engagementId !== "none" && (
              <details className="mt-2 text-xs text-muted-foreground">
                <summary>Engagement details</summary>
                <p>Engagement ID: {engagementId}</p>
              </details>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save touchpoint"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
