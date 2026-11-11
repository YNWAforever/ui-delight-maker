// @vitest-environment jsdom

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatDateTime } from "@/lib/format";
import type { AccountTab } from "@/components/account/account-settings";
import type { McpTokenCreated, McpTokenSummary } from "@/lib/mcp/types";
import { createMyMcpToken, getMyMcpTokens, revokeMyMcpToken } from "@/server-functions/mcp-tokens";

const { toastMocks } = vi.hoisted(() => ({
  toastMocks: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: toastMocks }));

vi.mock("@/server-functions/mcp-tokens", () => ({
  getMyMcpTokens: vi.fn(),
  createMyMcpToken: vi.fn(),
  revokeMyMcpToken: vi.fn(),
}));

import { AgentConnectorPanel } from "../agent-connector-panel";
import { AccountSettings, type AccountViewData } from "../account-settings";

const getMyMcpTokensMock = vi.mocked(getMyMcpTokens);
const createMyMcpTokenMock = vi.mocked(createMyMcpToken);
const revokeMyMcpTokenMock = vi.mocked(revokeMyMcpToken);

const CREATED_AT = "2026-10-01T08:00:00.000Z";
const FUTURE_EXPIRY = "2027-01-01T08:00:00.000Z";
const PAST_EXPIRY = "2026-10-15T08:00:00.000Z";

function makeToken(overrides: Partial<McpTokenSummary> = {}): McpTokenSummary {
  return {
    id: "token-1",
    name: "Claude Code",
    tokenPrefix: "fmcp_1234abcd",
    scopes: ["read"],
    createdAt: CREATED_AT,
    lastUsedAt: null,
    expiresAt: FUTURE_EXPIRY,
    revokedAt: null,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let writeText: ReturnType<typeof vi.fn>;

function renderWithClient(children: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
  return { queryClient };
}

function renderPanel() {
  return renderWithClient(<AgentConnectorPanel />);
}

beforeEach(() => {
  getMyMcpTokensMock.mockReset();
  createMyMcpTokenMock.mockReset();
  revokeMyMcpTokenMock.mockReset();
  toastMocks.success.mockReset();
  toastMocks.error.mockReset();
  writeText = vi.fn().mockResolvedValue(undefined);
});

afterEach(cleanup);

describe("agent connector panel", () => {
  it("lists each token with its prefix, timestamps, expiry and status", async () => {
    getMyMcpTokensMock.mockResolvedValue([
      makeToken(),
      makeToken({
        id: "token-2",
        name: "Expired agent",
        tokenPrefix: "fmcp_bbbbbbbb",
        expiresAt: PAST_EXPIRY,
      }),
      makeToken({
        id: "token-3",
        name: "Revoked agent",
        tokenPrefix: "fmcp_cccccccc",
        revokedAt: "2026-10-20T08:00:00.000Z",
      }),
    ]);

    renderPanel();

    const active = await screen.findByText("Claude Code");
    const row = active.closest("li");
    expect(row).toBeTruthy();
    expect(within(row as HTMLElement).getByText("fmcp_1234abcd…")).toBeTruthy();
    expect(
      within(row as HTMLElement).getByText(
        `Created ${formatDateTime(CREATED_AT)} · Last used Never · Expires ${formatDateTime(FUTURE_EXPIRY)}`,
      ),
    ).toBeTruthy();
    expect(within(row as HTMLElement).getByText("Active")).toBeTruthy();
    expect(
      within(row as HTMLElement).getByRole("button", { name: "Revoke Claude Code" }),
    ).toBeTruthy();

    expect(screen.getByText("Expired")).toBeTruthy();
    expect(screen.getByText("Revoked")).toBeTruthy();
    // A revoked token has no remaining action; the value is already dead.
    expect(screen.queryByRole("button", { name: "Revoke Revoked agent" })).toBeNull();
  });

  it("renders no-expiry and last-used timestamps instead of fake dates", async () => {
    getMyMcpTokensMock.mockResolvedValue([
      makeToken({ name: "CLI", lastUsedAt: "2026-10-02T09:30:00.000Z", expiresAt: null }),
    ]);

    renderPanel();

    await screen.findByText("CLI");
    expect(
      screen.getByText(
        `Created ${formatDateTime(CREATED_AT)} · Last used ${formatDateTime("2026-10-02T09:30:00.000Z")} · No expiry`,
      ),
    ).toBeTruthy();
  });

  it("shows an empty state with a create action", async () => {
    getMyMcpTokensMock.mockResolvedValue([]);

    renderPanel();

    expect(await screen.findByText("No agent tokens yet")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create token" })).toBeTruthy();
  });

  it("keeps a loading skeleton on screen until the token list resolves", async () => {
    const request = deferred<McpTokenSummary[]>();
    getMyMcpTokensMock.mockReturnValue(request.promise);

    renderPanel();

    expect(screen.getByText("Loading agent tokens…")).toBeTruthy();

    request.resolve([]);
    expect(await screen.findByText("No agent tokens yet")).toBeTruthy();
  });

  it("reveals a new token once, copies it, and drops it when the dialog closes", async () => {
    const user = userEvent.setup();
    // `userEvent.setup()` installs its own clipboard stub, so replace it afterwards with the
    // spy this test asserts against.
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const rawToken = `fmcp_${"a".repeat(64)}`;
    const created: McpTokenCreated = { ...makeToken({ id: "new-token" }), token: rawToken };
    getMyMcpTokensMock.mockResolvedValue([]);
    createMyMcpTokenMock.mockResolvedValue(created);

    renderPanel();
    await screen.findByText("No agent tokens yet");

    await user.click(screen.getByRole("button", { name: "Create token" }));
    const createDialog = await screen.findByRole("dialog", { name: "Create agent token" });
    await user.type(within(createDialog).getByLabelText("Token name"), "Claude Code");
    await user.selectOptions(within(createDialog).getByLabelText("Token expiry"), "90");
    await user.click(within(createDialog).getByRole("button", { name: "Create token" }));

    expect(createMyMcpTokenMock).toHaveBeenCalledWith({
      data: { name: "Claude Code", expiresInDays: 90 },
    });

    const revealDialog = await screen.findByRole("dialog", { name: "Agent token created" });
    expect(within(revealDialog).getByText(rawToken)).toBeTruthy();
    expect(revealDialog.textContent).toContain("This token is shown once");

    // The snippets are ready to paste, against this deployment's origin.
    const endpoint = `${window.location.origin}/api/mcp`;
    expect(revealDialog.textContent).toContain(
      `claude mcp add --transport http fimmick-crm ${endpoint} --header "Authorization: Bearer ${rawToken}"`,
    );
    expect(revealDialog.textContent).toContain(`"url": "${endpoint}"`);
    expect(revealDialog.textContent).toContain(`"Authorization": "Bearer ${rawToken}"`);

    await user.click(within(revealDialog).getByRole("button", { name: "Copy token" }));
    expect(writeText).toHaveBeenCalledWith(rawToken);

    const claudeCommand = `claude mcp add --transport http fimmick-crm ${endpoint} --header "Authorization: Bearer ${rawToken}"`;
    await user.click(
      within(revealDialog).getByRole("button", { name: "Copy Claude Code command" }),
    );
    expect(writeText).toHaveBeenCalledWith(claudeCommand);

    await user.click(within(revealDialog).getByRole("button", { name: "Copy JSON config" }));
    const jsonCopy = writeText.mock.calls.at(-1)?.[0] as string;
    expect(jsonCopy).toContain(`"url": "${endpoint}"`);
    expect(jsonCopy).toContain(`"Authorization": "Bearer ${rawToken}"`);

    await user.click(within(revealDialog).getByRole("button", { name: "Done" }));

    // The one chance to read it has passed: nothing on screen still holds the raw value.
    await waitFor(() => expect(screen.queryByText(rawToken)).toBeNull());
    expect(document.body.textContent).not.toContain(rawToken);
    await waitFor(() => expect(getMyMcpTokensMock).toHaveBeenCalledTimes(2));
  });

  it("shows a sanitized create error and keeps the dialog open to fix it", async () => {
    const user = userEvent.setup();
    getMyMcpTokensMock.mockResolvedValue([]);
    createMyMcpTokenMock.mockRejectedValue(
      new Error("permission denied for table mcp_tokens (SQLSTATE 42501)"),
    );

    renderPanel();
    await screen.findByText("No agent tokens yet");

    await user.click(screen.getByRole("button", { name: "Create token" }));
    const createDialog = await screen.findByRole("dialog", { name: "Create agent token" });
    await user.type(within(createDialog).getByLabelText("Token name"), "Broken token");
    await user.click(within(createDialog).getByRole("button", { name: "Create token" }));

    const alert = await within(createDialog).findByRole("alert");
    expect(alert.textContent).toBe("Something went wrong. Please try again.");
    expect(alert.textContent).not.toContain("permission denied");
    expect(alert.textContent).not.toContain("42501");
    expect(screen.getByRole("dialog", { name: "Create agent token" })).toBeTruthy();
  });

  it("confirms before revoking, then calls the server and refreshes the list", async () => {
    const user = userEvent.setup();
    getMyMcpTokensMock.mockResolvedValue([
      makeToken({ id: "token-a", name: "Alpha" }),
      makeToken({ id: "token-b", name: "Beta" }),
    ]);
    revokeMyMcpTokenMock.mockResolvedValue({ ok: true } as never);

    renderPanel();
    await screen.findByText("Beta");

    await user.click(screen.getByRole("button", { name: "Revoke Beta" }));

    const confirm = await screen.findByRole("alertdialog");
    expect(within(confirm).getByText("Revoke Beta?")).toBeTruthy();
    await user.click(within(confirm).getByRole("button", { name: "Revoke token" }));

    expect(revokeMyMcpTokenMock).toHaveBeenCalledWith({ data: { tokenId: "token-b" } });
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Token revoked"));
    await waitFor(() => expect(getMyMcpTokensMock).toHaveBeenCalledTimes(2));
  });

  it("reports a failed revoke in the same sanitized words the rest of the app uses", async () => {
    const user = userEvent.setup();
    getMyMcpTokensMock.mockResolvedValue([makeToken({ id: "token-a", name: "Alpha" })]);
    revokeMyMcpTokenMock.mockRejectedValue(
      new Error('password authentication failed for user "clientops_rw"'),
    );

    renderPanel();
    await screen.findByText("Alpha");

    await user.click(screen.getByRole("button", { name: "Revoke Alpha" }));
    const confirm = await screen.findByRole("alertdialog");
    await user.click(within(confirm).getByRole("button", { name: "Revoke token" }));

    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith("Something went wrong. Please try again."),
    );
  });

  it("offers a retry when the list itself fails, and never prints the driver text", async () => {
    const user = userEvent.setup();
    getMyMcpTokensMock.mockRejectedValue(new Error("fetch failed: Neon connection refused"));

    renderPanel();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Something went wrong. Please try again.");
    expect(alert.textContent).not.toContain("Neon");
    expect(alert.textContent).not.toContain("fetch failed");

    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(getMyMcpTokensMock).toHaveBeenCalledTimes(2));
  });

  it("renders inside the account page's new Agent connector tab", async () => {
    const user = userEvent.setup();
    getMyMcpTokensMock.mockResolvedValue([]);

    function AccountHarness() {
      const [tab, setTab] = useState<AccountTab>("profile");
      return (
        <AccountSettings
          account={accountFixture}
          tab={tab}
          onTabChange={setTab}
          onUpdateProfile={vi.fn()}
          onUpdateAvailability={vi.fn()}
          onRevokeSessions={vi.fn()}
          onCreateDelegation={vi.fn()}
          onCancelDelegation={vi.fn()}
          onCreateAccessRequest={vi.fn()}
        />
      );
    }

    renderWithClient(<AccountHarness />);

    const connectorTab = await screen.findByRole("tab", { name: "Agent connector" });
    expect(connectorTab.getAttribute("aria-selected")).toBe("false");
    await user.click(connectorTab);

    expect(await screen.findByText(/Connect an AI agent to this workspace/)).toBeTruthy();
    expect(await screen.findByText("No agent tokens yet")).toBeTruthy();
  });
});

const accountFixture: AccountViewData = {
  profile: {
    id: "profile-1",
    email: "person@example.com",
    name: "Person",
    role: "sales",
    status: "active",
    avatar_url: null,
    job_title: null,
    phone: null,
    locale: "en-HK",
    timezone: "Asia/Hong_Kong",
    primary_department_id: null,
    manager_profile_id: null,
    last_active_at: null,
    session_invalid_before: null,
    suspended_at: null,
    suspended_by: null,
    suspension_reason: null,
    deactivated_at: null,
    deactivated_by: null,
    deactivation_reason: null,
    availability_status: "available",
    leave_starts_at: null,
    leave_ends_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
  },
  teams: [],
  delegations: [],
  accessRequests: [],
};
