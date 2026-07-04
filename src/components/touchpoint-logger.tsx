import { useEffect, useState } from "react";
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
  engagements: Engagement[];
  contacts: ClientContact[];
  defaultEngagementId?: string | null;
  trigger: React.ReactNode;
  onLogged?: () => void;
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
  const [aiAvailable, setAiAvailable] = useState(false);
  const [tidying, setTidying] = useState(false);

  useEffect(() => {
    isAiNoteTidyAvailable().then((r) => setAiAvailable(r.available));
  }, []);

  const tidy = async () => {
    if (!notes.trim()) return;
    setTidying(true);
    try {
      const result = await tidyTouchpointNote({ data: { notes } });
      setNotes(result.tidied);
    } catch {
      toast.error("Couldn't tidy notes right now.");
    } finally {
      setTidying(false);
    }
  };

  const save = async () => {
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
    setOpen(false);
    onLogged?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log touchpoint</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as TouchpointNewType)}>
              <SelectTrigger className="mt-1">
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
            <Label className="text-xs">Sentiment</Label>
            <Select
              value={sentiment}
              onValueChange={(v) => setSentiment(v as TouchpointNewSentiment)}
            >
              <SelectTrigger className="mt-1">
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
            <Label className="text-xs">Engagement</Label>
            <Select value={engagementId} onValueChange={setEngagementId}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Whole client relationship</SelectItem>
                {engagements.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Contact</Label>
            <Select value={contactId} onValueChange={setContactId}>
              <SelectTrigger className="mt-1">
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
              <Label className="text-xs">Notes</Label>
              {aiAvailable && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={tidy}
                  disabled={tidying || !notes.trim()}
                >
                  {tidying ? "Tidying…" : "Tidy with AI"}
                </Button>
              )}
            </div>
            <Textarea
              className="mt-1"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save}>Save touchpoint</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
