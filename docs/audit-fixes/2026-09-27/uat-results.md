# Role UAT — audit release candidate

**Execution state: in progress; release acceptance incomplete.** On 2026-09-30 the dedicated UAT database, independent Auth and seven distinct account sessions were provisioned and verified. The earlier absence-of-sessions blocker is superseded. [Environment](../2026-09-29/isolated-uat-environment.md). On source `6c7ecb0`, sales created a task assigned to a text profile ID; six permitted identities changed its status, while read_only's direct POST was rejected with unchanged database status/version. [Actual browser/DB observations](../2026-09-29/evidence/task-seven-role-before-ui-2026-09-30.json). This is partial U02/U06/U15 evidence, not completion of the full workflows below. The eight baseline probes remain defect evidence, not release gates.

## 2026-09-30 executed Task/Admin entry slice

[Seven-role report](../2026-09-29/task-role-uat-2026-09-30.md) records actual same-task writes, denied direct requests, four effective override/scope scenarios, Admin entry boundaries and ten Task layout/keyboard cases. The full cases above remain pending because their other records, state transitions, import/bulk sizes and cross-entry paths have not all been exercised. Seven sessions are available; session absence is no longer a blocker.
