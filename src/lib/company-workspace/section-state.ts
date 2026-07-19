import type { SectionState } from "@/server/company-workspace/types";

export function retainCompanyWorkspaceSectionData<T>(
  next: SectionState<T>,
  previous?: SectionState<T>,
): SectionState<T> {
  if (next.status !== "error") return next;

  const staleData =
    previous?.status === "ready" || previous?.status === "empty"
      ? previous.data
      : previous?.status === "error"
        ? previous.staleData
        : undefined;

  return staleData === undefined ? next : { ...next, staleData };
}
