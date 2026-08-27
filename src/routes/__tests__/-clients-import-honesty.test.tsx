// @vitest-environment jsdom

import type { ComponentType, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { crmQueryKeys } from "@/lib/query-keys";

const validateMock = vi.hoisted(() => vi.fn());
const commitMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());
const routerInvalidateMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());
const toastSuccessMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    fullPath: "/clients/import",
    useLoaderData: vi.fn(),
    useSearch: vi.fn(),
  }),
  useNavigate: () => navigateMock,
  useRouter: () => ({ invalidate: routerInvalidateMock }),
  Link: ({ to, children }: { to: string; children?: ReactNode }) => <a href={to}>{children}</a>,
}));
vi.mock("sonner", () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock, message: vi.fn() },
}));
vi.mock("@/server-functions/client-import", () => ({
  validateClientImportRows: validateMock,
  commitClientImportFn: commitMock,
}));
vi.mock("@/server-functions/products", () => ({ getProducts: vi.fn() }));

import { Route } from "../clients.import";

const HEADER = "company_name,owner_email,product_name,start_date,value";
const CSV = [HEADER, "Northstar,ops@fimmick.com,Retainer,2026-01-01,5000", "  ,,,,"].join("\n");

/** Only `name` and `text()` are read, and jsdom's File/Blob pair is not reliable here. */
const csvFile = (text: string, name = "clients.csv") =>
  ({ name, text: () => Promise.resolve(text) }) as unknown as File;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  validateMock.mockReset();
  commitMock.mockReset();
  navigateMock.mockReset();
  routerInvalidateMock.mockReset();
  routerInvalidateMock.mockResolvedValue(undefined);
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
  vi.mocked(Route.useLoaderData).mockReturnValue([{ id: "product-1", name: "Retainer" }] as never);
  vi.mocked(Route.useSearch).mockReturnValue({ show: "all" } as never);
});

afterEach(cleanup);

function renderImport() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
  const Component = Route.options.component as ComponentType;
  render(
    <QueryClientProvider client={queryClient}>
      <Component />
    </QueryClientProvider>,
  );
  return { invalidateQueries };
}

const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;

async function uploadValidCsv() {
  validateMock.mockResolvedValue({
    valid: [
      { company_name: "Northstar", owner_email: "ops@fimmick.com", product_name: "Retainer" },
    ],
    errors: [{ row: { company_name: "Ghost Ltd" }, reason: "Unknown product: Nope" }],
  });
  fireEvent.change(fileInput(), { target: { files: [csvFile(CSV)] } });
  await screen.findByRole("button", { name: /^Commit 1 row$/ });
}

describe("/clients/import file step", () => {
  it("says so when a file has no data rows instead of silently doing nothing", async () => {
    renderImport();
    fireEvent.change(fileInput(), { target: { files: [csvFile(HEADER)] } });

    expect(await screen.findByText("No data rows found in that file")).toBeTruthy();
    // A headers-only file never reaches the server, and no commit control appears.
    expect(validateMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /^Commit/ })).toBeNull();
  });

  it("sanitises a validation failure rather than printing the driver's text", async () => {
    validateMock.mockRejectedValue(new Error('relation "profiles" does not exist at character 21'));
    renderImport();

    fireEvent.change(fileInput(), { target: { files: [csvFile(CSV)] } });
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledTimes(1));

    expect(toastErrorMock.mock.calls[0][0]).toBe("Something went wrong. Please try again.");
  });

  it("names every row that will be skipped, and why", async () => {
    renderImport();
    await uploadValidCsv();

    expect(screen.getAllByText(/Will be imported/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Skipped — Unknown product: Nope/).length).toBeGreaterThan(0);
    expect(screen.getByText("Will be skipped")).toBeTruthy();
  });
});

describe("/clients/import commit step", () => {
  it("commits once however many times the button is clicked", async () => {
    const pending = deferred<{ created: number; updated: number; skipped: number }>();
    commitMock.mockReturnValue(pending.promise);
    renderImport();
    await uploadValidCsv();

    const commit = screen.getByRole("button", { name: "Commit 1 row" });
    fireEvent.click(commit);
    await waitFor(() => expect(commitMock).toHaveBeenCalledTimes(1));

    const busy = screen.getByRole("button", { name: "Committing…" });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(busy);
    expect(commitMock).toHaveBeenCalledTimes(1);

    pending.resolve({ created: 1, updated: 0, skipped: 1 });
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled());
  });

  it("makes step 3 terminal, so the same rows cannot be committed a second time", async () => {
    commitMock.mockResolvedValue({ created: 1, updated: 0, skipped: 1 });
    renderImport();
    await uploadValidCsv();

    fireEvent.click(screen.getByRole("button", { name: "Commit 1 row" }));
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled());

    // The preview and its commit control are gone. Re-running the same rows does not duplicate
    // them, but it appends another activity_logs entry and flips "created" to "updated" — which
    // reads exactly like a second successful import.
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Commit/ })).toBeNull());
    expect(screen.getByText(/1 client created, 0 updated, 1 skipped/)).toBeTruthy();
  });

  it("invalidates the lists a successful import changed", async () => {
    commitMock.mockResolvedValue({ created: 2, updated: 1, skipped: 0 });
    const { invalidateQueries } = renderImport();
    await uploadValidCsv();

    fireEvent.click(screen.getByRole("button", { name: "Commit 1 row" }));
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled());

    // `/clients` is a cached list route with a 30s stale time and this file invalidated nothing,
    // so "All clients" returned the user to the pre-import list for up to half a minute.
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: crmQueryKeys.clients.lists() });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: crmQueryKeys.accounts.lists() });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: crmQueryKeys.engagements.lists() });
  });

  it("sanitises a failed commit and leaves the rows loaded for a retry", async () => {
    commitMock.mockRejectedValue(
      new Error('duplicate key value violates unique constraint "clients_company_name_key"'),
    );
    renderImport();
    await uploadValidCsv();

    fireEvent.click(screen.getByRole("button", { name: "Commit 1 row" }));
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledTimes(1));

    const message = toastErrorMock.mock.calls[0][0] as string;
    expect(message).toBe("Something went wrong. Please try again.");
    expect(message).not.toMatch(/duplicate key|constraint/i);
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Commit 1 row" })).toBeTruthy();
  });
});
