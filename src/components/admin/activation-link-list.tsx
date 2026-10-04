import { useId, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/format";
import type { ActivationLink } from "@/lib/invitation-delivery";

/**
 * Activation links the inviter has to pass on by hand.
 *
 * Shown when an invitation was created but not emailed — today every invitation, because
 * invitation email is deliberately not configured. Each link sits in a read-only field so it
 * can be read, selected and copied; the copy result is announced, and when the clipboard is
 * blocked the link is selected so Ctrl+C still works.
 */
export function ActivationLinkList({ links }: { links: readonly ActivationLink[] }) {
  const headingId = useId();
  if (links.length === 0) return null;

  return (
    <section aria-labelledby={headingId} className="rounded-md border border-border">
      <h3 id={headingId} className="border-b border-border px-3 py-2 text-sm font-medium">
        {links.length === 1 ? "Activation link" : `Activation links (${links.length})`}
      </h3>
      <ul className="divide-y divide-border">
        {links.map((link) => (
          <ActivationLinkRow key={link.url} link={link} />
        ))}
      </ul>
    </section>
  );
}

function ActivationLinkRow({ link }: { link: ActivationLink }) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const person = link.email || "this person";

  async function copy() {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopyState("copied");
    } catch {
      inputRef.current?.focus();
      inputRef.current?.select();
      setCopyState("failed");
    }
  }

  return (
    <li className="space-y-1.5 px-3 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <label htmlFor={inputId} className="break-all text-sm font-medium text-foreground">
          {link.email || "Invitee"}
        </label>
        {link.expiresAt ? (
          <span className="text-xs text-muted-foreground">
            Expires {formatDateTime(link.expiresAt)}
          </span>
        ) : null}
      </div>
      <div className="flex gap-2">
        <Input
          id={inputId}
          ref={inputRef}
          readOnly
          value={link.url}
          onFocus={(event) => event.currentTarget.select()}
          className="min-w-0 font-mono text-xs md:text-xs"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 shrink-0"
          aria-label={`Copy activation link for ${person}`}
          onClick={() => void copy()}
        >
          {copyState === "copied" ? (
            <Check className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Copy className="h-4 w-4" aria-hidden="true" />
          )}
          {copyState === "copied" ? "Copied" : "Copy link"}
        </Button>
      </div>
      <p role="status" className="min-h-4 text-xs text-muted-foreground">
        {copyState === "copied"
          ? "Link copied. Send it to the person directly."
          : copyState === "failed"
            ? "Copying is blocked in this browser. The link is selected — press Ctrl+C."
            : ""}
      </p>
    </li>
  );
}
