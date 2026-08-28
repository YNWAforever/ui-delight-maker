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
