# Baseline versus audit

| Surface | Audit | Fresh execution evidence | Disposition |
| --- | --- | --- | --- |
| Application source | 953ec0a | 953ec0a, clean tree, fetched main | Same source: no assumed repairs |
| Production application | bed941b | bed941b, public build + Vercel READY metadata | Same version; deployment hold remains |
| Original n8n probes | 20 pass / 12 fail | Byte-identical copied harness: 20 pass / 12 fail | Preserve historical result; migrate defects to corrected contracts |
| Five workflow provider key guards | 20 probe checks pass | All 20 still pass | Existing repair confirmed; do not redo |
| Full repository tests | Older green CI | Fresh isolated PG: 2,578 / 333, zero failures / skips | Baseline green does not satisfy missing AI regressions |
| Production migration / worker | Audit observations | Not queried / no deployed hash receipt | blocked / not-tested |
| Independent UAT | Prior setup | Independent target checked read-only; migrations 001–022 | Safe target exists; no current candidate acceptance |
| Seven roles | Prior saved sessions | Seven distinct active profiles and cookie sets | Live identity / permissions still not-tested |

R01 must address grouping by mutable `agent_name`, read-model `updated_at` / 15-minute stuck checks and the 24-hour versus 7-day attention count mismatch. The pure UI `isStuckRun` already uses `created_at` and 60 minutes; preserve it and add exact boundary evidence.

R02/R03 must address five lost provider telemetry envelopes, five null-number coercions, quote arithmetic mismatch and fabricated qualification budget. Original evidence and the copied harness output are not a release gate. R04 owner disposition, R10 real sandbox provider / worker receipts and R11 release authorization remain external gates.
