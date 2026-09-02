/**
 * The engagement rollup for one client: annualised value, worst renewal risk, earliest
 * renewal, lowest health.
 *
 * It lives in its own file so that a second consumer cannot drift from it: a second copy of
 * this arithmetic is how two surfaces come to state different revenue numbers. `clients.ts`
 * is its first consumer, and it was extracted ahead of the renewal report, which needs the
 * same annualisation and worst-risk aggregation.
 *
 * Three constraints this fragment must keep, all load-bearing:
 *
 * 1. It is a DERIVED TABLE, not a join. Pre-aggregating to one row per client is what lets
 *    `listClientsPage` wrap it in `select count(*) from (...)` and get a client count rather
 *    than an engagement count.
 * 2. It contains NO $n placeholders. Callers number their own, starting at $1, and a
 *    placeholder here would silently shift theirs.
 * 3. Its inner alias and column names are part of the contract. `listClientsPage` builds
 *    `coalesce(r.health_score, 50) >= $n` from outside this string.
 *
 * `one_off` falls to `else 0` deliberately: a one-off engagement has no annual recurring
 * value. This fragment does not consolidate that rule - three other copies of it remain live,
 * and whoever unifies them next will find them at:
 *   - `engagements.ts`, the `annualized_value` sum
 *   - `engagements.ts`, the `arr_at_risk` sum - the same case block again, nested inside a
 *     `renewal_risk = 'high'` test
 *   - `annualizeValue` in `lib/engagement-utils.ts`, the TypeScript one
 */
export const CLIENT_ENGAGEMENT_ROLLUP = `
  select
    e.client_id,
    sum(
      case e.billing_period
        when 'monthly' then coalesce(e.value, 0) * 12
        when 'quarterly' then coalesce(e.value, 0) * 4
        when 'annual' then coalesce(e.value, 0)
        else 0
      end
    ) as arr,
    min(e.health_score) as health_score,
    min(e.renewal_date) as renewal_date,
    case
      when bool_or(e.renewal_risk = 'high') then 'high'
      when bool_or(e.renewal_risk = 'medium') then 'medium'
      else 'low'
    end as renewal_risk
  from engagements e
  where e.status = 'active'
  group by e.client_id
`;
