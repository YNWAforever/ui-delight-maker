import { useState } from "react";
import { Save } from "lucide-react";
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
import type { WorkspaceObject, WorkspaceView, WorkspaceViewConfig } from "@/lib/types";
import { savePersonalWorkspaceView } from "@/server-functions/workspace-preferences";

type WorkspaceViewSwitcherProps = {
  objectType: WorkspaceObject;
  activeConfig: WorkspaceViewConfig;
  views: Array<Pick<WorkspaceView, "id" | "name" | "config">>;
  onSelect?: (config: WorkspaceViewConfig, viewId: string) => void;
  /**
   * Called after `savePersonalWorkspaceView` resolves.
   *
   * The saved views arrive with the route loader, and this component holds no query client,
   * so a view saved here did not appear in its own dropdown until a hard reload. The route
   * owns the refresh — and the success feedback, which there was none of either.
   */
  onSaved?: (name: string) => void | Promise<void>;
  /** Called when the reader picks "Current filters" — clears any applied saved view. */
  onClearView?: () => void;
};

export function WorkspaceViewSwitcher({
  objectType,
  activeConfig,
  views,
  onSelect,
  onSaved,
  onClearView,
}: WorkspaceViewSwitcherProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveView = async () => {
    /*
      The in-flight lock has to live here, not only on the button's `disabled`.
      "Save personal view" is disabled while `saving`, but Enter in the name field calls
      this directly and bypasses it — so holding Enter wrote a second
      `savePersonalWorkspaceView` row with the same name, and `/accounts` now toasts
      "Saved the view …" once per write.
    */
    if (saving) return;

    const normalizedName = name.trim();
    if (!normalizedName) {
      setError("Enter a view name.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await savePersonalWorkspaceView({
        data: { objectType, name: normalizedName, config: activeConfig },
      });
      setName("");
      setDialogOpen(false);
      await onSaved?.(normalizedName);
    } catch {
      setError("The view could not be saved. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-48 space-y-1.5">
        <Label htmlFor="workspace-view">Personal view</Label>
        <select
          id="workspace-view"
          defaultValue=""
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
          /*
            "Current filters" used to be inert: `onSelect` fired only when a view matched,
            so once a saved view was applied there was no way back to unfiltered from this
            control. The empty value now clears the applied view.
          */
          onChange={(event) => {
            if (event.target.value === "") {
              onClearView?.();
              return;
            }
            const view = views.find((candidate) => candidate.id === event.target.value);
            if (view) onSelect?.(view.config, view.id);
          }}
        >
          <option value="">Current filters</option>
          {views.map((view) => (
            <option key={view.id} value={view.id}>
              {view.name}
            </option>
          ))}
        </select>
      </div>

      <Button className="h-11" variant="outline" onClick={() => setDialogOpen(true)}>
        <Save className="h-4 w-4" />
        Save view
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save personal view</DialogTitle>
            <DialogDescription>
              Keep the current filters, columns, and sort order for your workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="workspace-view-name">View name</Label>
            <Input
              id="workspace-view-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void saveView();
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "workspace-view-error" : undefined}
              autoFocus
            />
            {error ? (
              <p id="workspace-view-error" role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void saveView()} disabled={saving}>
              {saving ? "Saving..." : "Save personal view"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
