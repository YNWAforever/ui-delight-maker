// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const getSection = vi.hoisted(() => vi.fn());
vi.mock("@/server-functions/company-workspace", () => ({ getCompanyWorkspaceSection: getSection }));

import {
  COMPANY_WORKSPACE_STALE_TIME_MS,
  useCompanyWorkspaceSection,
} from "../use-company-workspace-section";

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe("Company Workspace section query policy", () => {
  it("uses the approved 30-second freshness window", () => {
    expect(COMPANY_WORKSPACE_STALE_TIME_MS).toBe(30_000);
  });

  it("does not request a disabled section", async () => {
    renderHook(() => useCompanyWorkspaceSection("account-1", "activity", { enabled: false }), {
      wrapper,
    });
    await Promise.resolve();
    expect(getSection).not.toHaveBeenCalled();
  });
});
