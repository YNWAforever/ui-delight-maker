import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { WfmObject } from "../http.server";
import { importWfmHistory } from "../importer.server";
import { WfmHistoryStore, type WfmConnection } from "../store.server";

const namespace = "workflowmax:fixture-org";
const clientA = "10000000-0000-4000-8000-000000000001";
const clientB = "10000000-0000-4000-8000-000000000002";
const contactKey = "20000000-0000-4000-8000-000000000001";
const contact = {
  uuid: contactKey,
  firstName: "Shared",
  lastName: "Contact",
  contactDetails: { email: "shared@example.test" },
};
const firstClient = { uuid: clientA, name: "First client", contacts: [contact] };
const secondClient = {
  uuid: clientB,
  name: "Second client",
  contacts: [
    { ...contact, firstName: "Secondary", contactDetails: { email: "other@example.test" } },
  ],
};

/** In-memory SQL boundary: exercise the real store and importer without a DB connection. */
function fakeDatabase() {
  let state = {
    identities: new Map<string, string>(),
    raw: new Map<string, { namespace: string; type: string; key: string; payload: WfmObject }>(),
    accounts: new Map<string, string>(),
    contacts: new Map<string, { account_id: string; name: string; email: unknown }>(),
    links: new Set<string>(),
    receipts: new Map<
      string,
      { id: unknown; status: unknown; action: unknown; errorCode: unknown }
    >(),
  };
  let transaction: typeof state | undefined;
  let failLink = 0;
  const query = vi.fn(async (sql: string, values: readonly unknown[] = []) => {
    const args = values as readonly string[];
    if (sql === "begin") transaction = structuredClone(state);
    else if (sql === "commit") transaction = undefined;
    else if (sql === "rollback") {
      if (!transaction) throw new Error("No transaction to roll back");
      state = transaction;
      transaction = undefined;
    } else if (sql.startsWith("select pg_advisory_")) {
      return { rows: [] };
    } else if (sql.startsWith("insert into wfm_import_runs")) {
      return { rows: [{ id: randomUUID() }] };
    } else if (sql.startsWith("update wfm_import_runs")) {
      return { rows: [] };
    } else if (sql.startsWith("insert into import_identity_keys")) {
      const identityKey = JSON.stringify(values.slice(0, 3));
      const existing = state.identities.get(identityKey);
      const id = existing ?? args[3];
      state.identities.set(identityKey, id);
      return { rows: [{ resource_id: id, created: !existing }] };
    } else if (sql.startsWith("select resource_id from import_identity_keys")) {
      const id = state.identities.get(JSON.stringify(values));
      return { rows: id ? [{ resource_id: id }] : [] };
    } else if (sql.startsWith("insert into wfm_raw_objects")) {
      const [id, ns, type, key, payload] = args;
      const existing = state.raw.get(id);
      if (existing && (existing.namespace !== ns || existing.type !== type || existing.key !== key))
        return { rows: [] };
      state.raw.set(id, { namespace: ns, type, key, payload: JSON.parse(payload) });
      return { rows: [{ id }] };
    } else if (sql.startsWith("insert into accounts(")) {
      state.accounts.set(args[0], args[1]);
    } else if (sql.startsWith("select id from wfm_raw_objects")) {
      const [id, ns, type, key] = args;
      const raw = state.raw.get(id);
      return {
        rows: raw?.namespace === ns && raw.type === type && raw.key === key ? [{ id }] : [],
      };
    } else if (sql.startsWith("select account_id from account_contacts")) {
      const existing = state.contacts.get(args[0]);
      return { rows: existing ? [{ account_id: existing.account_id }] : [] };
    } else if (sql.startsWith("insert into account_contacts(")) {
      const [id, account, name, email] = args;
      const existing = state.contacts.get(id);
      // Model the existing SQL owner guard: a cross-account projection returns no rows.
      if (existing && existing.account_id !== account) return { rows: [] };
      state.contacts.set(id, { account_id: account, name, email });
      return { rows: [{ id }] };
    } else if (sql.startsWith("insert into account_contact_links(")) {
      if (failLink && --failLink === 0) {
        throw new Error("WFM_LINK_WRITE_FAILED");
      }
      if (!state.contacts.has(args[0]) || !state.accounts.has(args[1]))
        throw new Error("Link foreign key violation");
      state.links.add(JSON.stringify(values));
    } else if (sql.startsWith("insert into wfm_import_receipts(")) {
      const receiptKey = JSON.stringify([args[0], args[2], args[3]]);
      const existing = state.receipts.get(receiptKey);
      const action =
        existing?.action === "created" && args[6] === "updated" && sql.includes("action=case")
          ? "created"
          : args[6];
      state.receipts.set(receiptKey, {
        id: values[4],
        status: values[5],
        action,
        errorCode: values[7],
      });
    } else throw new Error(`Unexpected fake DB query: ${sql}`);
    return { rows: [] };
  });
  const release = vi.fn();
  // The fake's result shapes depend on SQL, just like the generic driver contract.
  const connection = { query, release } as unknown as WfmConnection;
  return {
    pool: { connect: vi.fn(async () => connection) },
    query,
    release,
    state: () => state,
    identity: (type: string, key: string, sourceNamespace = namespace) =>
      state.identities.get(JSON.stringify([sourceNamespace, type, key]))!,
    failNextLink: (attempt = 1) => (failLink = attempt),
  };
}

async function run(
  db: ReturnType<typeof fakeDatabase>,
  clients: WfmObject[],
  sourceNamespace = namespace,
) {
  const store = await WfmHistoryStore.open(db.pool, sourceNamespace);
  const snapshot = await importWfmHistory({
    store,
    source: {
      sourceNamespace,
      async *list(path) {
        if (path === "v2/clients") yield* clients;
      },
    },
  });
  return { snapshot, runId: store.runId };
}

function contactReceipt(db: ReturnType<typeof fakeDatabase>, runId: string) {
  return db.state().receipts.get(JSON.stringify([runId, "account_contact", contactKey]));
}

describe("WFM shared contact writes", () => {
  it("keeps identical source UUIDs in different organisations separate", async () => {
    const db = fakeDatabase();
    const otherNamespace = "workflowmax:other-org";
    await run(db, [firstClient, secondClient]);
    await run(db, [secondClient, firstClient], otherNamespace);
    const id = db.identity("account_contact", contactKey);
    const otherId = db.identity("account_contact", contactKey, otherNamespace);
    expect(otherId).not.toBe(id);
    expect(db.state().contacts.size).toBe(2);
    expect(db.state().links).toEqual(
      new Set([
        JSON.stringify([id, db.identity("account", clientA)]),
        JSON.stringify([id, db.identity("account", clientB)]),
        JSON.stringify([otherId, db.identity("account", clientA, otherNamespace)]),
        JSON.stringify([otherId, db.identity("account", clientB, otherNamespace)]),
      ]),
    );
    expect(db.state().raw.get(id)?.payload.firstName).toBe("Shared");
    expect(db.state().raw.get(otherId)?.payload.firstName).toBe("Secondary");
  });
  it("imports two client links using one identity, canonical payload, projection and receipt", async () => {
    const db = fakeDatabase();
    const { snapshot, runId } = await run(db, [firstClient, secondClient]);
    const id = db.identity("account_contact", contactKey);
    const owningAccount = db.identity("account", clientA);
    const otherAccount = db.identity("account", clientB);

    expect(snapshot.resources.account_contact).toEqual([contactKey]);
    expect(snapshot.contactClientLinks).toEqual({ [contactKey]: [clientA, clientB] });
    expect(snapshot.issues).toEqual([]);
    expect(db.state().contacts.size).toBe(1);
    expect(db.state().contacts.get(id)).toEqual({
      account_id: owningAccount,
      name: "Shared Contact",
      email: "shared@example.test",
    });
    expect(db.state().raw.get(id)?.payload).toEqual({ ...contact, clientUUID: clientA });
    expect(
      [...db.state().raw.values()].filter((row) => row.type === "account_contact"),
    ).toHaveLength(1);
    expect(db.state().identities.size).toBe(5); // Two clients, two accounts, one contact.
    expect(db.state().links).toEqual(
      new Set([JSON.stringify([id, owningAccount]), JSON.stringify([id, otherAccount])]),
    );
    expect(contactReceipt(db, runId)).toEqual({
      id,
      status: "succeeded",
      action: "created",
      errorCode: null,
    });
    expect(db.state().receipts.size).toBe(5);
    expect(
      db.query.mock.calls.filter(([sql]) => sql.startsWith("insert into account_contacts(")),
    ).toHaveLength(1);
    expect(db.query.mock.calls.some(([sql]) => sql === "rollback")).toBe(false);
    expect(db.release).toHaveBeenCalledOnce();
  });

  it("keeps one contact and link for repeated sightings within the same client", async () => {
    const db = fakeDatabase();
    const { snapshot, runId } = await run(db, [{ ...firstClient, contacts: [contact, contact] }]);
    expect(snapshot.resources.account_contact).toEqual([contactKey]);
    expect(snapshot.contactClientLinks).toEqual({ [contactKey]: [clientA] });
    expect(db.state().contacts.size).toBe(1);
    expect(db.state().links.size).toBe(1);
    expect(db.state().identities.size).toBe(3);
    expect(contactReceipt(db, runId)?.action).toBe("created");
  });

  it("preserves the owner on reordered replay and lets the owner's details refresh", async () => {
    const db = fakeDatabase();
    await run(db, [firstClient, secondClient]);
    const id = db.identity("account_contact", contactKey);
    const owner = db.identity("account", clientA);
    const refreshed = { ...contact, firstName: "Refreshed" };
    const { runId } = await run(db, [secondClient, { ...firstClient, contacts: [refreshed] }]);
    expect(db.identity("account_contact", contactKey)).toBe(id);
    expect(db.state().contacts.size).toBe(1);
    expect(db.state().contacts.get(id)).toMatchObject({
      account_id: owner,
      name: "Refreshed Contact",
    });
    expect(db.state().raw.get(id)?.payload).toEqual({ ...refreshed, clientUUID: clientA });
    expect(db.state().links.size).toBe(2);
    expect(contactReceipt(db, runId)).toMatchObject({ id, status: "succeeded", action: "updated" });
  });

  it("restores a pre-028 owner's link when only a secondary client is replayed", async () => {
    const db = fakeDatabase();
    await run(db, [firstClient]);
    db.state().links.clear(); // Existing contacts predate the association table.
    await run(db, [secondClient]);
    const id = db.identity("account_contact", contactKey);
    expect(db.state().links).toEqual(
      new Set([
        JSON.stringify([id, db.identity("account", clientA)]),
        JSON.stringify([id, db.identity("account", clientB)]),
      ]),
    );
    expect(db.state().raw.get(id)?.payload).toEqual({ ...contact, clientUUID: clientA });
  });

  it.each([false, true])(
    "rolls back both links and the second client on failure (pre-028: %s)",
    async (legacy) => {
      const db = fakeDatabase();
      const store = await WfmHistoryStore.open(db.pool, namespace);
      try {
        await store.upsert("client", firstClient);
        const id = db.identity("account_contact", contactKey);
        if (legacy) db.state().links.clear();
        db.failNextLink(2);
        await expect(store.upsert("client", secondClient)).rejects.toThrow("WFM_LINK_WRITE_FAILED");
        expect(db.state().contacts.size).toBe(1);
        expect(db.state().links.size).toBe(legacy ? 0 : 1);
        expect(db.state().raw.get(id)?.payload).toEqual({ ...contact, clientUUID: clientA });
        expect(db.identity("client", clientB)).toBeUndefined();
        expect(db.identity("account", clientB)).toBeUndefined();
        expect(
          db.state().receipts.get(JSON.stringify([store.runId, "client", clientB])),
        ).toMatchObject({
          status: "failed",
          errorCode: "WFM_LINK_WRITE_FAILED",
        });
      } finally {
        await store.close(false);
      }
    },
  );

  it("retains the raw identity collision guard when a secondary client reuses a contact", async () => {
    const db = fakeDatabase();
    const store = await WfmHistoryStore.open(db.pool, namespace);
    try {
      await store.upsert("client", firstClient);
      const id = db.identity("account_contact", contactKey);
      db.state().raw.get(id)!.namespace = "workflowmax:other-org";
      await expect(store.upsert("client", secondClient)).rejects.toThrow(
        "WFM_IDENTITY_TARGET_COLLISION",
      );
      expect(db.state().links.size).toBe(1);
      expect(db.state().contacts.get(id)?.account_id).toBe(db.identity("account", clientA));
    } finally {
      await store.close(false);
    }
  });
});
