import type { ProfileStatus } from "@/lib/admin/types";
import type {
  ReassignmentBucketKey,
  ReassignmentInventory,
} from "@/server/admin/reassignment.server";

export type LifecycleSuccessorOption = {
  id: string;
  name: string | null;
  email: string | null;
  status: ProfileStatus;
};

type WorkReassignmentTableProps = {
  inventory: ReassignmentInventory;
  targetProfileId: string;
  successors: readonly LifecycleSuccessorOption[];
  selected: Partial<Record<ReassignmentBucketKey, string>>;
  onChange: (bucket: ReassignmentBucketKey, successorId: string) => void;
};

export function WorkReassignmentTable({
  inventory,
  targetProfileId,
  successors,
  selected,
  onChange,
}: WorkReassignmentTableProps) {
  const openBuckets = inventory.buckets.filter((bucket) => bucket.count > 0);
  const activeSuccessors = successors.filter(
    (successor) => successor.id !== targetProfileId && successor.status === "active",
  );

  if (openBuckets.length === 0) {
    return (
      <section className="rounded-md border border-border bg-muted/20 px-4 py-4">
        <h3 className="text-sm font-semibold text-foreground">Ownership reassignment</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          No mutable work is assigned to this user.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-md border border-border">
      <div className="border-b border-border bg-muted/20 px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Ownership reassignment</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Every open ownership bucket needs an active successor before deactivation.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Work area</th>
              <th className="px-4 py-2.5 font-medium">Open records</th>
              <th className="px-4 py-2.5 font-medium">Successor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {openBuckets.map((bucket) => {
              const id = "successor-" + bucket.key.replace(".", "-");
              return (
                <tr key={bucket.key}>
                  <td className="px-4 py-3 font-medium text-foreground">{bucket.label}</td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{bucket.count}</td>
                  <td className="px-4 py-3">
                    <label className="sr-only" htmlFor={id}>
                      Successor for {bucket.label}
                    </label>
                    <select
                      id={id}
                      aria-label={"Successor for " + bucket.label}
                      value={selected[bucket.key] ?? ""}
                      onChange={(event) => onChange(bucket.key, event.target.value)}
                      className="min-h-9 w-full min-w-56 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="">Choose active successor</option>
                      {activeSuccessors.map((successor) => (
                        <option key={successor.id} value={successor.id}>
                          {successor.name || successor.email || successor.id}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
