// @vitest-environment jsdom

import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { crmQueryKeys } from "@/lib/query-keys";

const queryClient = vi.hoisted(() => ({ removeQueries: vi.fn() }));
const providerProps = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => queryClient,
}));
vi.mock("@neondatabase/auth-ui", () => ({
  NeonAuthUIProvider: ({ children, ...props }: { children: ReactNode }) => {
    providerProps(props);
    return <div>{children}</div>;
  },
}));
vi.mock("@/lib/auth/neon-auth", () => ({ getAuthClient: vi.fn() }));

import { NeonAuthProvider } from "../neon-auth-provider";

afterEach(() => {
  vi.clearAllMocks();
});

describe("NeonAuthProvider", () => {
  it("removes only the shell cache before chaining a successful session callback", async () => {
    const onSessionChange = vi.fn();
    queryClient.removeQueries.mockImplementation(() => {
      expect(onSessionChange).not.toHaveBeenCalled();
    });

    render(
      <NeonAuthProvider onSessionChange={onSessionChange}>
        <div>auth</div>
      </NeonAuthProvider>,
    );

    const props = providerProps.mock.calls[0][0] as { onSessionChange: () => Promise<void> };
    await props.onSessionChange();

    expect(queryClient.removeQueries).toHaveBeenCalledWith({
      queryKey: crmQueryKeys.shell(),
      exact: true,
    });
    expect(onSessionChange).toHaveBeenCalledOnce();
  });
});
