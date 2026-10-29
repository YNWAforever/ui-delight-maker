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
  function database(snapshot: ReturnType<typeof sharedContactSnapshot>) {
    return {
      query: vi.fn(async (sql: string) => {
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
  });

  it("still rejects duplicate UUIDs in manually supplied snapshot resources", async () => {
    const snapshot = sharedContactSnapshot();
    snapshot.resources.account_contact.push(contact);
    await expect(reconcileWfm(database(snapshot), snapshot)).rejects.toThrow(
      "Snapshot contains duplicate UUIDs: account_contact",
    );
  });
});
