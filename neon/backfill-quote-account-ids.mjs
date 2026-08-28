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
           coalesce(c.account_id, l.account_id) as proposed_account_id,
           a.name as proposed_account_name,
           case
             when coalesce(c.account_id, l.account_id) is not null then null
             when c.id is null and l.id is null then 'no linked record'
             else 'linked record has no account'
           end as unresolvable_reason
      from quotes q
      left join clients  c on c.id = q.client_id
      left join leads    l on l.id = q.lead_id
      left join accounts a on a.id = coalesce(c.account_id, l.account_id)
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

const APPLY_COMMAND = "DATABASE_URL=... node neon/backfill-quote-account-ids.mjs --apply";

/**
 * An unresolvable quote is a correct outcome, not a failure — but only if the report says
 * enough for a human to fix the underlying link. "No linked record" and "linked record has
 * no account" need different fixes, so they are counted separately rather than lumped
 * together under one number that hides which.
 */
function countReasons(unresolvable) {
  const counts = new Map();
  for (const row of unresolvable) {
    const reason = row.unresolvable_reason ?? "unknown";
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return counts;
}

function printReport(report) {
  console.log("Quote account backfill");
  console.log("======================");
  console.log(`Quotes with no account:      ${report.total}`);
  console.log(`  resolvable from a link:    ${report.resolvable.length}`);
  console.log(`  not resolvable:            ${report.unresolvable.length}`);

  for (const [reason, count] of countReasons(report.unresolvable)) {
    console.log(`    ${reason}: ${count}`);
  }

  if (report.resolvable.length > 0) {
    const sample = report.resolvable.slice(0, 10);
    console.log("");
    console.log(
      `Sample of rows that would change (${sample.length} of ${report.resolvable.length}):`,
    );
    for (const row of sample) {
      const number = row.number ?? `(no number, id ${row.id})`;
      const account = row.proposed_account_name
        ? `${row.proposed_account_name} (${row.proposed_account_id})`
        : row.proposed_account_id;
      console.log(`  ${number} -> ${account}`);
    }
  }

  console.log("");
  console.log("No account is ever inferred from a company name. Every proposal above copies an");
  console.log("account already recorded on that quote's own client or lead.");
}

async function main() {
  const apply = process.argv.includes("--apply");
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Refusing to run.");
    process.exit(1);
  }

  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: url });

  try {
    const report = await resolveBackfill(pool);
    printReport(report);

    if (!apply) {
      console.log("");
      console.log("DRY RUN — nothing was written. No row in `quotes` was modified.");
      console.log(`To apply these changes, re-run with --apply:\n  ${APPLY_COMMAND}`);
      return;
    }

    console.log("");
    const { changed } = await applyBackfill(pool);
    console.log(`APPLIED — ${changed} quote(s) updated.`);

    // A count that disagrees with the report is an error, not a warning: it means the
    // database moved under the report a human just read, so the report they approved is
    // no longer a description of what happened.
    if (changed !== report.resolvable.length) {
      console.error(
        `Expected to change ${report.resolvable.length} row(s) but changed ${changed}. ` +
          "The database changed between the report and the write. Re-run the dry run.",
      );
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

// Only run when invoked as a script. The test imports the two functions above directly, and
// importing a module must never open a database connection as a side effect.
const invokedPath = process.argv[1];
if (invokedPath) {
  const { pathToFileURL } = await import("node:url");
  if (pathToFileURL(invokedPath).href === import.meta.url) {
    await main().catch((error) => {
      // Exiting non-zero rather than reporting "0 rows changed", which would read as success.
      console.error(error);
      process.exit(1);
    });
  }
}
