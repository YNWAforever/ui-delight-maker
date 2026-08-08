import { createServerFn } from "@tanstack/react-start";
import type { CompanyWorkspaceRequest } from "@/lib/company-workspace/types";
import { loadCompanyWorkspace } from "@/server/company-workspace/read-model";

export const getCompanyWorkspace = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as CompanyWorkspaceRequest)
  .handler(async ({ data }) => loadCompanyWorkspace(data));
