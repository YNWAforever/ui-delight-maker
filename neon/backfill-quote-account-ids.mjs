/**
 * Which NULL-account quotes can be repaired, and from where.
 *
 * Only ever copies an account already recorded on the quote's own client or lead.
 * Nothing is inferred from a company name — that is precisely what the integrity audit
 * found the product must not do, and it is why this is a repair rather than a guess.
 *
 * Client wins over lead, matching `linkedRecord` and `resolveLinkedQuoteVisibility`.
 */
export async function resolveBackfill(db) {
  const { rows } = await db.query(`
    select q.id,
           q.number,
           coalesce(c.account_id, l.account_id) as proposed_account_id
      from quotes q
      left join clients c on c.id = q.client_id
      left join leads   l on l.id = q.lead_id
     where q.account_id is null
     order by q.created_at
  `);

  return {
    total: rows.length,
    resolvable: rows.filter((r) => r.proposed_account_id !== null),
    unresolvable: rows.filter((r) => r.proposed_account_id === null),
  };
}

/**
 * Write the resolvable rows. Wrapped in a transaction: a partial backfill is worse than
 * none, because the dry-run report would no longer describe the remaining work.
 *
 * `account_id is null` is what makes this idempotent and non-destructive — a quote that
 * already has an account is outside the statement entirely.
 *
 * Takes a dedicated connection when `db` can hand one out (a `pg` Pool can), because BEGIN
 * and the UPDATE must run on the same connection; a pool would otherwise be free to route
 * them to two, leaving the UPDATE outside the transaction it is supposed to be inside.
 */
export async function applyBackfill(db) {
  const client = typeof db.connect === "function" ? await db.connect() : null;
  const connection = client ?? db;

  try {
    await connection.query("begin");
    try {
      const { rows } = await connection.query(`
        update quotes
           set account_id = sub.proposed_account_id
          from (
            select q.id, coalesce(c.account_id, l.account_id) as proposed_account_id
              from quotes q
              left join clients c on c.id = q.client_id
              left join leads   l on l.id = q.lead_id
             where q.account_id is null
               and coalesce(c.account_id, l.account_id) is not null
          ) as sub
         where quotes.id = sub.id
           and quotes.account_id is null
        returning quotes.id
      `);
      await connection.query("commit");
      return { changed: rows.length };
    } catch (error) {
      await connection.query("rollback");
      throw error;
    }
  } finally {
    client?.release();
  }
}
