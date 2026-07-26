/**
 * Countdown chip for an approval's 4-hour SLA.
 *
 * `now` is a parameter, not Date.now() inside, so the server and the first client render
 * produce identical markup and hydration stays clean. It previously pinned a hard-coded
 * 2026-05-20, which kept SSR and CSR in agreement but meant every approval raised before
 * that date read "SLA breached" forever, and every one after it showed a countdown of
 * hundreds of hours.
 *
 * Lives here rather than in the route so the route file exports only components — see
 * react-refresh/only-export-components.
 */
const SLA_HOURS = 4;

export function slaChip(createdAt: string, now: number) {
  const elapsed = (now - new Date(createdAt).getTime()) / 36e5;
  const remaining = SLA_HOURS - elapsed;
  if (remaining <= 0)
    return { text: "SLA breached", className: "bg-destructive/15 text-destructive" };
  if (remaining < 1)
    return {
      text: `${(remaining * 60).toFixed(0)}m left`,
      className: "bg-warning/15 text-warning-foreground",
    };
  return { text: `${remaining.toFixed(1)}h left`, className: "bg-info/10 text-info" };
}
