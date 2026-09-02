/**
 * The engagement rollup for one client: annualised value, worst renewal risk, earliest
 * renewal, lowest health.
 *
 * Shared because the same arithmetic is read by two surfaces - /clients and the renewal
 * report - and a second copy is how they come to state different revenue numbers.
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
 * value. Note this is one of FOUR copies of that rule - `engagements.ts` and
 * `annualizeValue` in `engagement-utils.ts` have their own. This unifies two of them.
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
