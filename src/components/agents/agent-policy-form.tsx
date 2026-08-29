import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { hasCapability } from "@/lib/admin/capabilities";
import type { Capability } from "@/lib/admin/types";
import type { AgentDefinition } from "@/lib/agents";
import { formatDateTime } from "@/lib/format";
import type { AgentPolicyVersionListRow } from "@/server/repositories/agent-policy";

type AgentPolicyFormProps = {
  agent: Pick<AgentDefinition, "workflow_type" | "status" | "human_approval">;
  versions: AgentPolicyVersionListRow[];
  capabilities: readonly Capability[];
  onSave: (input: {
    status: "active" | "inactive";
    humanApproval: boolean;
    reason: string;
  }) => Promise<unknown>;
};

/**
 * The form and history for one agent's policy override.
 *
 * The Config tab this replaces had an Enabled switch that toasted "Agent enabled" and wrote
 * nothing, and an "At a glance -> Status" row that rendered from that same dead local state —
 * so flipping the switch visibly rewrote the status the page reported while the dispatch path
 * went on running (or not running) the agent regardless. This component is the fix for both
 * failure modes at once: every control here is wired to `setAgentPolicyFn`, and a control that
 * cannot act (no `agents.configure`) says so instead of rendering as if it works.
 */
export function AgentPolicyForm({ agent, versions, capabilities, onSave }: AgentPolicyFormProps) {
  // Decides what is SHOWN, never what is permitted - setAgentPolicyFn re-checks server-side.
  const canConfigure = hasCapability(capabilities, "agents.configure");

  // Initialised from the effective values, so the form opens showing what actually governs,
  // not qualify_lead's (or any agent's) code default.
  const [status, setStatus] = useState<"active" | "inactive">(agent.status);
  const [humanApproval, setHumanApproval] = useState(agent.human_approval);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const statusId = useId();
  const humanApprovalId = useId();
  const reasonId = useId();

  const disabled = !canConfigure || saving;

  const submit = async () => {
    setSaving(true);
    try {
      await onSave({ status, humanApproval, reason });
      setReason("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {!canConfigure ? (
        <p className="text-sm text-muted-foreground">
          These are the values the dispatch path and the writeback obey. Changing them requires the{" "}
          <code>agents.configure</code> capability.
        </p>
      ) : null}

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={statusId}>Status</Label>
          <Select
            value={status}
            onValueChange={(value) => setStatus(value as "active" | "inactive")}
            disabled={disabled}
          >
            <SelectTrigger id={statusId} aria-label="Status" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id={humanApprovalId}
            checked={humanApproval}
            onCheckedChange={setHumanApproval}
            disabled={disabled}
          />
          <Label htmlFor={humanApprovalId}>Requires human approval</Label>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={reasonId}>Reason</Label>
          <Input
            id={reasonId}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={disabled}
            placeholder="Why is this changing?"
          />
        </div>

        <Button type="button" onClick={submit} disabled={disabled}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium">History</h3>
        {versions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No policy changes recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {versions.map((version) => (
              <li
                key={version.id}
                className="flex items-start justify-between gap-4 rounded-md border border-border p-3 text-sm"
              >
                <div className="space-y-1">
                  <p>
                    <span className="font-medium">{version.status}</span>
                    {" · "}
                    {version.human_approval ? "requires approval" : "no approval required"}
                  </p>
                  {version.reason ? (
                    <p className="text-muted-foreground">{version.reason}</p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {version.changed_by_name ?? version.changed_by} ·{" "}
                    {formatDateTime(version.created_at)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
