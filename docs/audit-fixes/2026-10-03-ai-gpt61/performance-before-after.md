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
