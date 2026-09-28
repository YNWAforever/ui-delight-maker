import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCapability: vi.fn(),
  requireNeonAuthSession: vi.fn(),
  query: vi.fn(),
  listProducts: vi.fn(),
  commitLeadImport: vi.fn(),
  commitClientImport: vi.fn(),
  listEventImportAccountCandidates: vi.fn(),
  listEventImportAccountContacts: vi.fn(),
  commitEventImport: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (data: unknown) => data;
    const chain = {
      validator(validator: (data: unknown) => unknown) {
        validate = validator;
        return chain;
      },
      handler<T extends ({ data }: { data: never }) => unknown>(handler: T) {
        return async ({ data }: { data: unknown }) => handler({ data: validate(data) } as never);
      },
    };
    return chain;
  },
}));
vi.mock("@/server/auth/authorization.server", () => ({
  requireCapability: mocks.requireCapability,
}));
vi.mock("@/lib/auth/neon-auth.server", () => ({
  requireNeonAuthSession: mocks.requireNeonAuthSession,
}));
vi.mock("@/server/db/neon.server", () => ({ query: mocks.query }));
vi.mock("@/server/repositories/products", () => ({ listProducts: mocks.listProducts }));
vi.mock("@/server/repositories/lead-import", () => ({ commitLeadImport: mocks.commitLeadImport }));
vi.mock("@/server/repositories/client-import", () => ({
  commitClientImport: mocks.commitClientImport,
}));
vi.mock("@/server/repositories/event-import", () => ({
  listEventImportAccountCandidates: mocks.listEventImportAccountCandidates,
  listEventImportAccountContacts: mocks.listEventImportAccountContacts,
  commitEventImport: mocks.commitEventImport,
}));

import { commitLeadImportFn } from "../lead-import";
import { commitClientImportFn } from "../client-import";
import { commitEventImportFn } from "../event-import";

const ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCapability.mockResolvedValue(undefined);
  mocks.requireNeonAuthSession.mockResolvedValue({ profile: { id: ID } });
  mocks.query.mockResolvedValue([]);
  mocks.listProducts.mockResolvedValue([]);
  mocks.listEventImportAccountCandidates.mockResolvedValue([]);
  mocks.listEventImportAccountContacts.mockResolvedValue([]);
  mocks.commitLeadImport.mockResolvedValue({ created: 0 });
  mocks.commitClientImport.mockResolvedValue({ created: 0 });
  mocks.commitEventImport.mockResolvedValue({ created: 0 });
});

describe("import write input boundaries", () => {
  it("retires authenticated Lead and Client direct writes", async () => {
    await expect(
      commitLeadImportFn({
        data: { rows: [{ company_name: "A", contact_email: "a@example.com" }] },
      }),
    ).rejects.toThrow(/Direct CSV commit is retired/);
    await expect(
      commitClientImportFn({
        data: { rows: [{ company_name: "A" }] },
      }),
    ).rejects.toThrow(/Direct CSV commit is retired/);
    expect(mocks.commitLeadImport).not.toHaveBeenCalled();
    expect(mocks.commitClientImport).not.toHaveBeenCalled();
  });

  it("rejects 5,001 lead rows before loading DB context", async () => {
    await expect(
      commitLeadImportFn({ data: { rows: Array.from({ length: 5_001 }, () => ({})) } }),
    ).rejects.toThrow();
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.commitLeadImport).not.toHaveBeenCalled();
  });

  it("rejects 5,001 client rows before loading DB context", async () => {
    await expect(
      commitClientImportFn({ data: { rows: Array.from({ length: 5_001 }, () => ({})) } }),
    ).rejects.toThrow();
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.commitClientImport).not.toHaveBeenCalled();
  });

  it("rejects 5,001 event rows before account matching", async () => {
    const row = {
      company_name: "Acme",
      contact_name: "Pat",
      email: "",
      phone: "",
      attendee_status: "attended",
      interests: [],
      notes: "",
    };
    await expect(
      commitEventImportFn({
        data: { campaignId: ID, rows: Array.from({ length: 5_001 }, () => row) },
      }),
    ).rejects.toThrow();
    expect(mocks.listEventImportAccountCandidates).not.toHaveBeenCalled();
    expect(mocks.commitEventImport).not.toHaveBeenCalled();
  });

  it("rejects an empty campaign ID before any imported write", async () => {
    await expect(commitEventImportFn({ data: { campaignId: "", rows: [] } })).rejects.toThrow();
    expect(mocks.listEventImportAccountCandidates).not.toHaveBeenCalled();
    expect(mocks.commitEventImport).not.toHaveBeenCalled();
  });
});
