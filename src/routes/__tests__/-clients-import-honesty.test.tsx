// @vitest-environment jsdom
import type { ComponentType, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crmQueryKeys } from "@/lib/query-keys";

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  commit: vi.fn(),
  resume: vi.fn(),
  get: vi.fn(),
  routerInvalidate: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    fullPath: "/clients/import",
    useLoaderData: vi.fn(),
  }),
  useRouter: () => ({ invalidate: mocks.routerInvalidate }),
  Link: ({ to, children }: { to: string; children?: ReactNode }) => <a href={to}>{children}</a>,
}));
vi.mock("@/server-functions/import-sessions", () => ({
  previewImportFn: mocks.preview,
  commitImportFn: mocks.commit,
  resumeImportFn: mocks.resume,
  getImportResultFn: mocks.get,
}));
vi.mock("@/server-functions/products", () => ({ getProducts: vi.fn() }));
import { Route } from "../clients.import";

const ID = "11111111-1111-4111-8111-111111111111";
const HASH = "a".repeat(64);
const CSV = "external_id,company_name\nlegacy-1,Northstar";
const file = (text: string) => ({ name: "clients.csv", text: async () => text }) as File;
const row = (status: string | null, action = "create") => ({
  recordIndex: 1,
  sourceLine: 2,
  action,
  status,
  errors: [],
  id: status === "succeeded" ? ID : null,
  retryable: false,
});
const preview = () => ({
  sessionId: ID,
  previewHash: HASH,
  previewExpiresAt: "2026-09-28T00:00:00.000Z",
  state: "preview",
  processed: 0,
  total: 1,
  rows: [row(null)],
});
const completed = () => ({
  sessionId: ID,
  state: "completed",
  processed: 1,
  total: 1,
  rows: [row("succeeded", "created")],
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
function renderImport() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
  const Component = Route.options.component as ComponentType;
  const screenResult = render(
    <QueryClientProvider client={queryClient}>
      <Component />
    </QueryClientProvider>,
  );
  return { ...screenResult, invalidate };
}
async function upload() {
  fireEvent.change(document.querySelector('input[type="file"]')!, {
    target: { files: [file(CSV)] },
  });
  await screen.findByRole("button", { name: "Commit next 20" });
}
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.mocked(Route.useLoaderData).mockReturnValue([{ id: "product-1", name: "Retainer" }] as never);
  mocks.preview.mockResolvedValue(preview());
  mocks.commit.mockResolvedValue(completed());
  mocks.resume.mockResolvedValue(completed());
  mocks.get.mockResolvedValue(completed());
});
afterEach(cleanup);

describe("/clients/import durable session", () => {
  it("rejects an empty file before creating a server session", async () => {
    renderImport();
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: { files: [file("company_name")] },
    });
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "No data rows found in that file",
    );
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it("shows the server's full-row preview and source line before commit", async () => {
    mocks.preview.mockResolvedValue({
      ...preview(),
      total: 2,
      processed: 1,
      rows: [
        row(null),
        {
          ...row("invalid"),
          recordIndex: 2,
          sourceLine: 3,
          action: "review",
          errors: ["Owner is unavailable"],
        },
      ],
    });
    renderImport();
    await upload();
    expect(screen.getByText("1 / 2")).toBeTruthy();
    expect(screen.getByText("2 / 3")).toBeTruthy();
    expect(screen.getByText("Owner is unavailable")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download issues CSV" })).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("persists the idempotency key before one write and refreshes affected lists", async () => {
    const pending = deferred<ReturnType<typeof completed>>();
    mocks.commit.mockReturnValue(pending.promise);
    const { invalidate } = renderImport();
    await upload();
    fireEvent.click(screen.getByRole("button", { name: "Commit next 20" }));
    await waitFor(() => expect(mocks.commit).toHaveBeenCalledTimes(1));
    const key = JSON.parse(localStorage.getItem("clientops-import:client:")!).idempotencyKey;
    expect(key).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Working…" }));
    expect(mocks.commit).toHaveBeenCalledTimes(1);
    pending.resolve(completed());
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: crmQueryKeys.clients.lists() }),
    );
    expect(screen.queryByRole("button", { name: "Commit next 20" })).toBeNull();
  });

  it("replays the same key after an ambiguous network response", async () => {
    mocks.commit.mockRejectedValueOnce(new Error("Network interrupted"));
    renderImport();
    await upload();
    fireEvent.click(screen.getByRole("button", { name: "Commit next 20" }));
    await screen.findByRole("alert");
    const key = JSON.parse(localStorage.getItem("clientops-import:client:")!).idempotencyKey;
    fireEvent.click(screen.getByRole("button", { name: "Commit next 20" }));
    await waitFor(() => expect(mocks.commit).toHaveBeenCalledTimes(2));
    expect(mocks.commit.mock.calls[0][0].data.idempotencyKey).toBe(key);
    expect(mocks.commit.mock.calls[1][0].data.idempotencyKey).toBe(key);
  });

  it("recovers a paused session after reload and continues it", async () => {
    localStorage.setItem(
      "clientops-import:client:",
      JSON.stringify({
        sessionId: ID,
        previewHash: HASH,
        previewExpiresAt: "2026-09-28T00:00:00.000Z",
        idempotencyKey: "same-key",
      }),
    );
    mocks.get.mockResolvedValue({
      sessionId: ID,
      state: "paused",
      processed: 0,
      total: 1,
      rows: [row(null)],
    });
    renderImport();
    const continueButton = await screen.findByRole("button", { name: "Continue next 20" });
    fireEvent.click(continueButton);
    await waitFor(() => expect(mocks.resume).toHaveBeenCalledWith({ data: { sessionId: ID } }));
  });
});
