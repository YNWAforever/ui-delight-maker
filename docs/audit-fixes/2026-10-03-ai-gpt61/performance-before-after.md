# R09 measured read-model runtime

Source HEAD 9956d5b plus the recorded working diff. Exact measured runner SHA-256: `8138447121b889240de31637704a6d2920b6400ba30b3397098e801f0e524af9` ([source](evidence/r09-runtime-runner-measured.source.txt)). Commands: `bun scripts/clientops/measure-ai-ops.ts --runs=10000 --cold=10 --warm=30 --config=<approved-local-attestation-file>` and 100000. Both exit 0. CLI/config/Bun typing repairs are disclosed in the ledger; no measured read-model SQL was changed.

Same inspected pgvector/pgvector:pg17 loopback host, same synthetic fixtures per scale; before migrations001–024, after additive025. Read models unchanged. Each scale has 480 measured samples: six surface/page-size combinations, 10 new-pool cold connections +30 warm pooled runs per phase. PostgreSQL caches remain warm even in the cold-connection group; this is neither HTTP/session/browser cold load nor production performance.

| Runs | Surface/page | Warm p95 before ms | After ms | Change | Gate |
|---|---|---:|---:|---:|---|
| 10000 | ai-ops/25/warm-pool | 329.35 | 473.01 | 43.62% | owner-review-required |
| 10000 | ai-ops/50/warm-pool | 390.30 | 407.04 | 4.29% | pass |
| 10000 | ai-review/25/warm-pool | 16.81 | 12.69 | -24.47% | pass |
| 10000 | ai-review/50/warm-pool | 21.29 | 14.55 | -31.65% | pass |
| 10000 | history/25/warm-pool | 12.30 | 21.05 | 71.12% | owner-review-required |
| 10000 | history/50/warm-pool | 13.28 | 23.18 | 74.48% | owner-review-required |
| 100000 | ai-ops/25/warm-pool | 3851.09 | 2892.69 | -24.89% | pass |
| 100000 | ai-ops/50/warm-pool | 2889.48 | 3487.13 | 20.68% | owner-review-required |
| 100000 | ai-review/25/warm-pool | 56.32 | 43.81 | -22.20% | pass |
| 100000 | ai-review/50/warm-pool | 65.19 | 47.15 | -27.68% | pass |
| 100000 | history/25/warm-pool | 50.15 | 55.88 | 11.44% | owner-review-required |
| 100000 | history/50/warm-pool | 69.69 | 69.86 | 0.25% | pass |

All raw samples, p50/p95, actual returned SQL rows, matching counts, serialized bytes and executed EXPLAIN ANALYZE/BUFFERS plans are in the two linked JSON artifacts. Query counts remain fixed at 8 AI Ops (catalogue/directory plus complete run queue), 4 Review and 5 history at both 25/50. No N+1 scaling was observed.

**Performance acceptance is blocked pending owner review.** Some warm p95 changes exceed +10%; all samples are retained. The unchanged read-model SQL and untuned indexes do not support claiming a causal performance improvement from025. Host/cache variation can influence this sequential comparison; it is an explanation, not an owner exception. Do not repeatedly run until green or pick fastest samples. Absolute production SLO and real foreground/background browser acceptance remain not-tested. The new actual QueryObserver regression proves 45s foreground polling, hidden suppression and focus resume in jsdom only.

Real 500-item checkpoint/dedupe, deadline reserve, max3 concurrency, expired intent/no-resend, ack failure ambiguity and checkpoint-failure resume passed on local physical PG with an explicitly mocked external dispatcher. Deployment maxDuration/native n8n continuation must be verified by the worker/operator before enabling runtime flags.

## R09 continuation: exact code comparison and JIT repair

Original migration comparisons above remain unchanged. The continuation compares the original queue and scope source from commit `a55e8691e9e6745927a4f1e52804771fc46724d0` with the working fix on the **same** migrations001–025 and seeded disposable DB. Other timed read-model/authorization/visibility modules must match the baseline or the collector refuses the comparison. Only import paths in the saved baseline modules are adapted; SQL/result behavior is real. The new optional `--baseline-sha=<40-hex commit>` mode retains the existing migration-only mode.

Actual 480 samples per size,960 total: three surfaces ×25/50 ×10 new-pool /30 warm ×before/after. New pools are not cold PostgreSQL caches. This shared development host also ran static/build checks and a small local UAT; phase ordering and host noise limit causal wall-time claims. Raw samples, per-phase actual EXPLAIN plans and source/runner/diff hashes are retained; no rerun selected for a green threshold.

| Rows | Surface/page | Before warm p95 ms | After warm p95 ms | Change | Relative gate |
|---|---|---:|---:|---:|---|
| 10000 | ai-ops/25 | 463.12 | 372.86 | -19.5% | pass |
| 10000 | ai-ops/50 | 733.63 | 71.15 | -90.3% | pass |
| 10000 | ai-review/25 | 19.85 | 126.43 | 536.8% | owner-review-required |
| 10000 | ai-review/50 | 42.12 | 149.03 | 253.8% | owner-review-required |
| 10000 | history/25 | 19.48 | 56.92 | 192.1% | owner-review-required |
| 10000 | history/50 | 20.24 | 53.56 | 164.6% | owner-review-required |
| 100000 | ai-ops/25 | 11353.73 | 1030.87 | -90.9% | pass |
| 100000 | ai-ops/50 | 5619.37 | 638.11 | -88.6% | pass |
| 100000 | ai-review/25 | 128.63 | 366.02 | 184.5% | owner-review-required |
| 100000 | ai-review/50 | 235.57 | 133.07 | -43.5% | pass |
| 100000 | history/25 | 154.24 | 234.44 | 52.0% | owner-review-required |
| 100000 | history/50 | 294.79 | 126.00 | -57.3% | pass |

Actual100k count/page EXPLAIN execution: before2462.456/2434.372ms with242/243 JIT functions; after112.505/266.355ms with0 JIT functions. Actual10k: before170.610/149.338ms; after9.426/25.697ms. These plan timings differ from end-to-end read-model samples and exclude HTTP/Auth/browser/provider. No global JIT setting or schema/index change.

Query counts: AI Ops8, with one10k after/warm sample9; Review4; History5, at both page sizes. All exact min/max counts are retained. The single extra query is reported rather than erased. Several unchanged Review/History warm-p95 comparisons still breach +10%; **owner review remains required**, including the earlier immutable R09 results. This repair does not establish a production SLO or release approval.

Reproduce on the inspected disposable loopback configuration: `bun scripts/clientops/measure-ai-ops.ts --runs=10000 --cold=10 --warm=30 --baseline-sha=a55e8691e9e6745927a4f1e52804771fc46724d0 --config=<approved local private config> --out=<private output>`; repeat100000. Config must attest isolation/sourceRecord and match the inspected loopback Docker image/port. Never use production credentials.

Evidence: [10k samples/plans](evidence/r09-code-runtime-10000.json), [100k samples/plans](evidence/r09-code-runtime-100000.json). No fixture formula is presented as runtime.
