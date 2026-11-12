import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyWorkspaceState, ErrorState, LoadingSkeleton } from "@/components/sales";
import { StatusBadge } from "@/components/status-badge";
import { toSafeErrorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import {
  MCP_TOKEN_SCOPE_LABELS,
  mcpTokenScopeLabel,
  type CreateMcpTokenInput,
  type McpTokenCreated,
  type McpTokenScope,
  type McpTokenSummary,
} from "@/lib/mcp/types";
import { crmQueryKeys } from "@/lib/query-keys";
import { createMyMcpToken, getMyMcpTokens, revokeMyMcpToken } from "@/server-functions/mcp-tokens";

/**
 * Personal access tokens for the agent connector.
 *
 * A token is a credential, so it lives with the other personal credentials on `/account`
 * rather than under admin settings: people mint their own, see only their own, and revoke
 * their own. Minting and revoking here is not an approval workflow; a write-scoped token can
 * only create proposals that a human decides on `/approvals`, and nothing is written directly.
 *
 * The raw value exists exactly once, in the create response. It is held in component state
 * only until the reveal dialog closes, and it is never put in a URL, a query key, the list
 * query cache, or a toast - a leaked connector token is a leaked session.
 */

type TokenStatus = "active" | "expired" | "revoked";

const STATUS_LABEL: Record<TokenStatus, string> = {
  active: "Active",
  expired: "Expired",
  revoked: "Revoked",
};

/**
 * A token is dead once it is revoked; until it expires it is live. Expiry is evaluated at
 * read time rather than trusted from a status column so the list cannot disagree with the
 * clock, and the server checks the same timestamp again on every request.
 */
function tokenStatus(token: McpTokenSummary, now: number): TokenStatus {
  if (token.revokedAt) return "revoked";
  if (token.expiresAt && Date.parse(token.expiresAt) <= now) return "expired";
  return "active";
}

function formatMoment(value: string | null): string {
  return value ? formatDateTime(value) : "Never";
}

function expiryLabel(value: string | null): string {
  return value ? `Expires ${formatDateTime(value)}` : "No expiry";
}

type ExpiryDays = CreateMcpTokenInput["expiresInDays"];

const EXPIRY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "365 days" },
  { value: "never", label: "No expiry" },
];

const SELECT_CLASS = "min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

function parseExpiry(value: string): ExpiryDays {
  if (value === "never") return null;
  const days = Number(value);
  return days === 30 || days === 90 || days === 365 ? days : 90;
}

/** The header row shared by every state: one sentence, one action, no extra chrome. */
function ConnectorHeader({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        Connect an AI agent to this workspace with a personal access token.
      </p>
      <Button type="button" onClick={onCreate}>
        Create token
      </Button>
    </div>
  );
}

function TokenRow({
  token,
  now,
  onRevoke,
}: {
  token: McpTokenSummary;
  now: number;
  onRevoke: (token: McpTokenSummary) => void;
}) {
  const status = tokenStatus(token, now);

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-foreground">{token.name}</p>
          <code className="font-mono text-xs text-muted-foreground">{token.tokenPrefix}…</code>
        </div>
        <p className="text-xs text-muted-foreground">
          Created {formatMoment(token.createdAt)} · Last used {formatMoment(token.lastUsedAt)} ·{" "}
          {expiryLabel(token.expiresAt)}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="text-xs text-muted-foreground">{mcpTokenScopeLabel(token.scopes)}</span>
        <StatusBadge value={status} label={STATUS_LABEL[status]} />
        {status !== "revoked" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label={`Revoke ${token.name}`}
            onClick={() => onRevoke(token)}
          >
            Revoke
          </Button>
        ) : null}
      </div>
    </li>
  );
}

type CopyState = { copied: string | null; blocked: boolean };

function CopyButton({
  label,
  value,
  copyState,
  onCopy,
}: {
  label: string;
  value: string;
  copyState: CopyState;
  onCopy: (label: string, value: string) => void;
}) {
  const copied = copyState.copied === label;
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      aria-label={label}
      onClick={() => onCopy(label, value)}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function Snippet({
  title,
  copyLabel,
  value,
  language,
  copyState,
  onCopy,
}: {
  title: string;
  copyLabel: string;
  value: string;
  language: "command" | "json" | "token";
  copyState: CopyState;
  onCopy: (label: string, value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{title}</span>
        <CopyButton label={copyLabel} value={value} copyState={copyState} onCopy={onCopy} />
      </div>
      {language === "command" ? (
        <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-foreground">
          <code>{value}</code>
        </pre>
      ) : (
        <code className="block break-all rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-foreground">
          {value}
        </code>
      )}
    </div>
  );
}

/**
 * The token exists in this component and nowhere else after creation.
 *
 * `onClose` drops it: closing the dialog is the moment the one chance to copy it ends, and
 * re-opening the dialog must not resurrect a value the user has already dismissed.
 */
function RevealTokenDialog({
  token,
  origin,
  onClose,
}: {
  token: McpTokenCreated | null;
  origin: string | null;
  onClose: () => void;
}) {
  const [copyState, setCopyState] = useState<CopyState>({ copied: null, blocked: false });

  // Each new reveal starts from a clean copy indicator, never inheriting the previous token's.
  useEffect(() => {
    setCopyState({ copied: null, blocked: false });
  }, [token]);

  const endpoint = `${origin ?? "https://<your-domain>"}/api/mcp`;
  const tokenValue = token?.token ?? "";
  const claudeCodeCommand = `claude mcp add --transport http fimmick-crm ${endpoint} --header "Authorization: Bearer ${tokenValue}"`;
  const jsonConfig = useMemo(
    () =>
      JSON.stringify(
        {
          mcpServers: {
            "fimmick-crm": {
              url: endpoint,
              headers: { Authorization: `Bearer ${tokenValue}` },
            },
          },
        },
        null,
        2,
      ),
    [endpoint, tokenValue],
  );

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState({ copied: label, blocked: false });
    } catch {
      setCopyState({ copied: null, blocked: true });
    }
  }

  return (
    <Dialog
      open={token !== null}
      onOpenChange={(open) => {
        if (!open) {
          setCopyState({ copied: null, blocked: false });
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Agent token created</DialogTitle>
          <DialogDescription>
            This token is shown once. Copy it now - it cannot be retrieved later.
          </DialogDescription>
        </DialogHeader>
        {token ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{mcpTokenScopeLabel(token.scopes)}</p>
            <Snippet
              title="Token"
              copyLabel="Copy token"
              value={tokenValue}
              language="token"
              copyState={copyState}
              onCopy={(label, value) => void copy(label, value)}
            />
            <Snippet
              title="Claude Code"
              copyLabel="Copy Claude Code command"
              value={claudeCodeCommand}
              language="command"
              copyState={copyState}
              onCopy={(label, value) => void copy(label, value)}
            />
            <Snippet
              title="Claude Desktop / Cursor"
              copyLabel="Copy JSON config"
              value={jsonConfig}
              language="json"
              copyState={copyState}
              onCopy={(label, value) => void copy(label, value)}
            />
            {copyState.blocked ? (
              <p role="status" className="text-xs text-destructive">
                Copying is blocked in this browser. Select the text and copy it manually.
              </p>
            ) : null}
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateTokenDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (token: McpTokenCreated) => void;
}) {
  const [name, setName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState<ExpiryDays>(30);
  const [scope, setScope] = useState<McpTokenScope>("read");
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (input: CreateMcpTokenInput) => createMyMcpToken({ data: input }),
    onSuccess: (created) => {
      setName("");
      setExpiresInDays(30);
      setScope("read");
      setError(null);
      onOpenChange(false);
      onCreated(created);
      // Keep the raw token out of the TanStack mutation cache: the parent now owns it for the
      // one-time reveal, and dismissing that dialog must leave no copy behind in memory.
      createMutation.reset();
    },
    onError: (mutationError) => setError(toSafeErrorMessage(mutationError)),
  });

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && trimmedName.length <= 80;
  // `write` always implies `read`; the server canonicalizes the same way, so send both.
  const selectedScopes: readonly McpTokenScope[] = scope === "write" ? ["read", "write"] : ["read"];

  function submit() {
    if (!canSubmit || createMutation.isPending) return;
    setError(null);
    createMutation.mutate({ name: trimmedName, expiresInDays, scopes: selectedScopes });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && createMutation.isPending) return;
        if (!nextOpen) {
          setError(null);
          setName("");
          setExpiresInDays(30);
          setScope("read");
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Create agent token</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="agent-token-name">Name</Label>
            <Input
              id="agent-token-name"
              aria-label="Token name"
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agent-token-expiry">Expiry</Label>
            <select
              id="agent-token-expiry"
              aria-label="Token expiry"
              value={expiresInDays === null ? "never" : String(expiresInDays)}
              onChange={(event) => setExpiresInDays(parseExpiry(event.target.value))}
              className={SELECT_CLASS}
            >
              {EXPIRY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agent-token-scope">Scope</Label>
            <select
              id="agent-token-scope"
              aria-label="Token scope"
              value={scope}
              onChange={(event) => setScope(event.target.value === "write" ? "write" : "read")}
              className={SELECT_CLASS}
            >
              <option value="read">{MCP_TOKEN_SCOPE_LABELS.read}</option>
              <option value="write">{MCP_TOKEN_SCOPE_LABELS.write}</option>
            </select>
            {scope === "write" ? (
              <p className="text-xs text-muted-foreground">
                Can only create proposals a human approves on /approvals. Nothing is written
                directly.
              </p>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={createMutation.isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit || createMutation.isPending}>
              {createMutation.isPending ? "Creating…" : "Create token"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AgentConnectorPanel() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [createdToken, setCreatedToken] = useState<McpTokenCreated | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<McpTokenSummary | null>(null);
  const [origin, setOrigin] = useState<string | null>(null);

  // Read in an effect so the first render - which the server also produces - does not touch
  // `window`, and the copy-paste snippets still show the real deployment origin once mounted.
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const tokensQuery = useQuery({
    queryKey: crmQueryKeys.mcpTokens(),
    queryFn: () => getMyMcpTokens(),
  });

  const revokeMutation = useMutation({
    mutationFn: (tokenId: string) => revokeMyMcpToken({ data: { tokenId } }),
    onSuccess: async () => {
      setRevokeTarget(null);
      toast.success("Token revoked");
      await queryClient.invalidateQueries({ queryKey: crmQueryKeys.mcpTokens() });
    },
    onError: (mutationError) => {
      toast.error(toSafeErrorMessage(mutationError));
    },
  });

  const tokens = tokensQuery.data ?? [];
  const now = Date.now();

  return (
    <div className="space-y-4">
      <ConnectorHeader onCreate={() => setCreateOpen(true)} />

      {tokensQuery.isPending ? (
        <LoadingSkeleton variant="panel" label="agent tokens" rows={2} />
      ) : tokensQuery.isError ? (
        <ErrorState
          kind="server"
          error={tokensQuery.error}
          onRetry={() => void tokensQuery.refetch()}
        />
      ) : tokens.length === 0 ? (
        <EmptyWorkspaceState
          icon={KeyRound}
          title="No agent tokens yet"
          description="Create a token to connect an AI agent."
        />
      ) : (
        <ul
          aria-label="Agent tokens"
          className="divide-y divide-border rounded-md border border-border"
        >
          {tokens.map((token) => (
            <TokenRow key={token.id} token={token} now={now} onRevoke={setRevokeTarget} />
          ))}
        </ul>
      )}

      <CreateTokenDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(token) => {
          setCreatedToken(token);
          void queryClient.invalidateQueries({ queryKey: crmQueryKeys.mcpTokens() });
        }}
      />
      <RevealTokenDialog
        token={createdToken}
        origin={origin}
        onClose={() => setCreatedToken(null)}
      />

      <AlertDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open && !revokeMutation.isPending) setRevokeTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {revokeTarget?.name ?? "this token"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Any agent using this token loses access immediately. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokeMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={revokeMutation.isPending}
              onClick={(event) => {
                // Radix closes on click; keep the dialog open until the write settles so a
                // failure does not look like a success.
                event.preventDefault();
                if (revokeTarget) revokeMutation.mutate(revokeTarget.id);
              }}
            >
              Revoke token
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
