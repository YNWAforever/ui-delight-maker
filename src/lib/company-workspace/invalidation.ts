import type { QueryClient } from "@tanstack/react-query";

import { companyWorkspaceKeys } from "@/lib/company-workspace/query-keys";
import type { WorkspaceSection } from "@/lib/company-workspace/types";

export type CompanyWorkspaceMutation =
  | "account-changed"
  | "account-finance-changed"
  | "contacts-changed"
  | "signal-dismissed"
  | "client-changed"
  | "engagement-changed"
  | "quote-changed"
  | "quote-accepted"
  | "task-changed"
  | "activity-changed";

const sectionsByMutation = {
  "account-changed": ["core", "overview"],
  "account-finance-changed": ["overview", "deliveryFinance"],
  "contacts-changed": ["core", "stakeholders"],
  "signal-dismissed": ["overview"],
  "client-changed": ["overview", "commercial"],
  "engagement-changed": ["overview", "commercial"],
  "quote-changed": ["overview", "commercial"],
  "quote-accepted": ["overview", "commercial", "deliveryFinance"],
  "task-changed": ["deliveryFinance"],
  "activity-changed": ["activity"],
} as const satisfies Record<CompanyWorkspaceMutation, readonly WorkspaceSection[]>;

export function sectionsForCompanyWorkspaceMutation(
  mutation: CompanyWorkspaceMutation,
): readonly WorkspaceSection[] {
  return sectionsByMutation[mutation];
}

export async function invalidateCompanyWorkspaceSections(
  queryClient: QueryClient,
  accountId: string,
  sections: readonly WorkspaceSection[],
): Promise<void> {
  await Promise.all(
    [...new Set(sections)].map((section) =>
      queryClient.invalidateQueries({
        queryKey: companyWorkspaceKeys.section(accountId, section),
        exact: true,
      }),
    ),
  );
}
