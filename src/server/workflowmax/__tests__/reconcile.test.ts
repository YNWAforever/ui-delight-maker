import { describe, expect, it, vi } from "vitest";
import { WFM_PLAN } from "../plan.server";
import { reconcileWfm, snapshotSchema, WfmSourceSnapshot } from "../reconcile.server";

const clientA = "10000000-0000-4000-8000-000000000001";
const clientB = "10000000-0000-4000-8000-000000000002";
const contact = "20000000-0000-4000-8000-000000000001";

function sharedContactSnapshot() {
  const snapshot = new WfmSourceSnapshot("workflowmax:fixture-org");
  snapshot.add("client", { uuid: clientA, contacts: [{ uuid: contact }] });
  snapshot.add("client", { uuid: clientB, contacts: [{ uuid: contact }] });
  return snapshot.finish(true);
}

describe("WFM source snapshot identities", () => {
  it("counts a shared contact once and retains both client links without issues", () => {
    const snapshot = sharedContactSnapshot();
    expect(snapshot.resources.account_contact).toEqual([contact]);
    expect(snapshot.resources.client).toEqual([clientA, clientB]);
    expect(snapshot.resources.account).toEqual([clientA, clientB]);
    expect(snapshot.contactClientLinks).toEqual({ [contact]: [clientA, clientB] });
    expect(snapshot.issues).toEqual([]);
    expect(snapshotSchema.parse(snapshot)).toEqual(snapshot);
  });

  it("de-dupes repeated contacts and links within the same client", () => {
    const snapshot = new WfmSourceSnapshot("workflowmax:fixture-org");
    expect(() =>
      snapshot.add("client", {
        uuid: clientA,
        contacts: [{ uuid: contact }, { uuid: contact }],
      }),
    ).not.toThrow();
    expect(snapshot.value.resources.account_contact).toEqual([contact]);
    expect(snapshot.value.contactClientLinks).toEqual({ [contact]: [clientA] });
    expect(snapshot.value.issues).toEqual([]);
  });

  it.each(WFM_PLAN.map((step) => step.type))("still rejects duplicate %s UUIDs", (type) => {
    const snapshot = new WfmSourceSnapshot("workflowmax:fixture-org");
    snapshot.add(type, { uuid: clientA });
    expect(() => snapshot.add(type, { uuid: clientA })).toThrow("DUPLICATE_SOURCE_UUID");
  });

  it("still rejects repeated job costs and invoice line items", () => {
    for (const type of ["project", "invoice"] as const) {
      const snapshot = new WfmSourceSnapshot("workflowmax:fixture-org");
      const children =
        type === "project"
          ? { costs: [{ uuid: contact }, { uuid: contact }] }
          : { jobs: [{ tasks: [{ uuid: contact }, { uuid: contact }] }] };
      expect(() => snapshot.add(type, { uuid: clientA, ...children })).toThrow(
        "DUPLICATE_SOURCE_UUID",
      );
    }
  });

  it("keeps snapshots without contactClientLinks backward compatible", () => {
    const snapshot = sharedContactSnapshot();
    delete snapshot.contactClientLinks;
    expect(snapshotSchema.parse(snapshot)).toEqual(snapshot);
  });
});

describe("WFM reconciliation contact counts", () => {
  function database(
    snapshot: ReturnType<typeof sharedContactSnapshot>,
    links: { contact_key: string; client_key: string | null }[] = [
      { contact_key: contact, client_key: clientA },
      { contact_key: contact, client_key: clientB },
    ],
  ) {
    return {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("from account_contact_links")) return { rows: links };
        if (sql.includes("from wfm_raw_objects"))
          return {
            rows: Object.entries(snapshot.resources).flatMap(([resource_type, keys]) =>
              keys.map((external_key) => ({ resource_type, external_key })),
            ),
          };
        if (sql.includes("from wfm_invoices")) return { rows: [] };
        if (sql.includes("from wfm_timesheets")) return { rows: [{ minutes: "0", missing: 0 }] };
        throw new Error("Unexpected reconciliation query");
      }),
    } as unknown as Parameters<typeof reconcileWfm>[0];
  }

  it("reconciles two clients sharing one contact as one projected contact", async () => {
    const snapshot = sharedContactSnapshot();
    const result = await reconcileWfm(database(snapshot), snapshot);
    expect(result.ok).toBe(true);
    expect(result.counts.find((row) => row.resource === "account_contact")).toMatchObject({
      wfm: 1,
      db: 1,
      ok: true,
    });
    expect(result.counts.find((row) => row.resource === "account_contact_link")).toMatchObject({
      wfm: 2,
      db: 2,
      ok: true,
    });
  });

  it("fails when a shared contact is present but its owner or secondary link is missing", async () => {
    const snapshot = sharedContactSnapshot();
    for (const client_key of [clientA, clientB]) {
      const result = await reconcileWfm(
        database(snapshot, [{ contact_key: contact, client_key }]),
        snapshot,
      );
      expect(result.ok).toBe(false);
      expect(result.counts.find((row) => row.resource === "account_contact_link")).toMatchObject({
        wfm: 2,
        db: 1,
        missingCount: 1,
        extraCount: 0,
        ok: false,
      });
    }
  });

  it("detects an equal-count substitution of a contact's client link", async () => {
    const snapshot = sharedContactSnapshot();
    const result = await reconcileWfm(
      database(snapshot, [
        { contact_key: contact, client_key: clientA },
        { contact_key: contact, client_key: "unexpected-client" },
      ]),
      snapshot,
    );
    expect(result.ok).toBe(false);
    expect(result.counts.find((row) => row.resource === "account_contact_link")).toMatchObject({
      wfm: 2,
      db: 2,
      missingCount: 1,
      extraCount: 1,
      ok: false,
    });
  });

  it("rejects links whose account has no raw identity in the contact's namespace", async () => {
    const snapshot = sharedContactSnapshot();
    const result = await reconcileWfm(
      database(snapshot, [
        { contact_key: contact, client_key: clientA },
        { contact_key: contact, client_key: clientB },
        { contact_key: contact, client_key: null },
      ]),
      snapshot,
    );
    expect(result.ok).toBe(false);
    expect(result.issues).toContain("account_contact_links:invalid_account_namespace");
  });

  it("keeps reconciliation compatible with snapshots without link evidence", async () => {
    const snapshot = sharedContactSnapshot();
    delete snapshot.contactClientLinks;
    const db = database(snapshot, []);
    const result = await reconcileWfm(db, snapshot);
    expect(result.ok).toBe(true);
    expect(
      vi.mocked(db.query).mock.calls.some(([sql]) => sql.includes("from account_contact_links")),
    ).toBe(false);
  });

  it("still rejects duplicate UUIDs in manually supplied snapshot resources", async () => {
    const snapshot = sharedContactSnapshot();
    snapshot.resources.account_contact.push(contact);
    await expect(reconcileWfm(database(snapshot), snapshot)).rejects.toThrow(
      "Snapshot contains duplicate UUIDs: account_contact",
    );
  });
});
