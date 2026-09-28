import { ProfileSearchCombobox } from "@/components/people/profile-search-combobox";
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
  selected,
  onChange,
}: WorkReassignmentTableProps) {
  const visibleBuckets = inventory.buckets.filter(
    (bucket) => bucket.count > 0 || bucket.historyCount > 0,
  );

  if (visibleBuckets.length === 0) {
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
          Open ownership needs an active successor. Historical assignments stay with the original
          person.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Work area</th>
              <th className="px-4 py-2.5 font-medium">Open records</th>
              <th className="px-4 py-2.5 font-medium">History retained</th>
              <th className="px-4 py-2.5 font-medium">Successor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visibleBuckets.map((bucket) => {
              return (
                <tr key={bucket.key}>
                  <td className="px-4 py-3 font-medium text-foreground">{bucket.label}</td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{bucket.count}</td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">
                    {bucket.historyCount}
                  </td>
                  <td className="px-4 py-3">
                    {bucket.count > 0 ? (
                      <ProfileSearchCombobox
                        purpose="successor"
                        label={"Successor for " + bucket.label}
                        value={selected[bucket.key] ?? ""}
                        onChange={(profileId) => {
                          if (profileId !== targetProfileId) onChange(bucket.key, profileId);
                        }}
                      />
                    ) : (
                      <span className="text-muted-foreground">Preserved</span>
                    )}
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
