# ClientOps Audit Fixes — Codex GPT-6 Sol Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans`（如環境有提供）逐項執行；沒有技能亦須遵守本文件的任務、測試及 gate。Checklist 用於追蹤。指定執行者為 **Codex GPT-6 Sol**；本交付只有計劃，未修改產品。不要自行啟動平行 agents。

**Goal:** 修復 ClientOps 審核 CO-01–CO-30，令權限、報價到 Job Sheet、審批、日常維護及批量工作可靠且可驗證。

**Architecture:** 保留 TanStack routes → server functions → repositories/read models → Neon 的結構。共用既有 policy evaluator／row authorizer；把跨表 business commands 移到單一 transaction service，UI 消費 server 計算的 allowed actions。以可恢復的逐筆批量結果取代無上限前端並行，不重寫整套 CRM。

**Tech Stack:** 現有 React 19、TanStack Start/Router/Query、TypeScript、Zod 4、Bun、Vite 7、Neon Postgres raw SQL、Vitest；保留現有 n8n 整合。

**Spec:** `references/ClientOps_Audit_2026-09-27_zhHK.md`、同名 `.html`、`references/ClientOps_Audit_Evidence_2026-09-27.zip`。先讀全文，再讀 ZIP 的 probe／logs；HTML 包含公開頁截圖。

**Repository:** https://github.com/YNWAforever/ui-delight-maker  
**Audit baseline:** `2904faa502f7494173f48f412875c1d0a3aba674`（PR #81 merge）。本計劃以此版本落點編寫，不聲稱執行時 main 仍是這個版本。  
**Live entry:** https://ui-delight-maker.vercel.app/login  
**Plan date:** 2026-09-27，Asia/Hong_Kong。

## Global Constraints

- 實作前讀取實際 checkout 的 `AGENTS.md`（若有）、`CLAUDE.md`、README 及 touched domain tests。執行時 fetch 最新 main 並記錄 SHA；不要 reset 使用者工作或退回舊 SHA。
- 保留現有客戶／account ownership、GP 責任、角色、歷史及商業資料；不把本修復變成組織重整。不得以「讓經理用得到」為由直接授予 `quotes.issue`。
- 保留已完成功能：Lead import、quote search/aggregate、accounting lead-linked quote redaction、approval routing、agent policy versions/history/rollback。以差異補修，避免重做。
- TypeScript strict，產品程式不新增 `any`。使用現有 query keys、routeQueryOptions、參數化 SQL、錯誤處理及 audit conventions。
- 不手改 `src/routeTree.gen.ts`；不重複加入 Vite plugins；不手改 `src/components/ui/`。新元件放 feature 目錄並組合既有 primitives。
- 新 schema 只用 `neon/migrations/`，既有 migration 不回寫；`supabase/migrations/` 保持 frozen。本文 migration 名稱是建議新檔，序號須按執行時最新版本分配。
- 不新增 `minimumReleaseAgeExcludes`；不變更 invitation webhook／bootstrap super-admin 設定。不要關掉既有安全或 release gate 來令測試變綠。
- `bun run build` **有 DB migration／seed 副作用**。本地先純 `bunx vite build`；完整 repo gate 在明確 disposable DB／隔離 preview 執行，不能把 production URL 帶入測試或 seed。
- 本次計劃不授權 production migration、真實寄信、訊息發送、Xero 寫入或部署。實作者先完成 code、隔離驗證及 PR；沿用當時使用者已給的發版授權，若未有，交付具體 release candidate 才申請發版。
- 不宣稱已有完整後台驗收：原審核只有公開登入／註冊頁；沒有已登入實測、production DB integration 或 runtime p95。
- `CLAUDE.md` 目前要求固定 UTC。T09 將以本使用者要求修正 HK 工作日期問題，採 explicit `Asia/Hong_Kong` 並同步改文件；不可只改 browser locale 破壞 hydration。

## Review Focus

1. **兩個 reviewer／重送請求／權限於 preview 後失效**：只能產生一個有效終態，重新授權、不重複執行（T05、T07、T13、T15）。
2. **被限制資料經另一入口返回**：search matching、count、CSV、通知、tooltip 與 detail 一致，不只隱藏 UI（T03、T04、T12）。
3. **舊 issued／accepted 資料缺 version、時間或有互相矛盾 snapshot**：隔離待核對，不用目前 draft 補作已發出證據（T06、T07、T09）。
4. **部分成功後斷線／重試／使用者切頁**：成功項不重寫，錯誤可定位，續做不依賴前端記憶（T13、T15、T17）。
5. **香港跨日、幣種、小數、CSV 中英文／換行／公式字串**：資料和業務意思均保留（T09、T14）。

---

## 1. 已知基線及完成的定義

原審核：254 test files pass／13 skip；1,804 tests pass／116 skip；TypeScript exit 0；Lint 0 errors、1 warning；純 Vite build 成功。這些是歷史基線，不是本計劃實作後的結果。ZIP 內 8 個 probes **刻意斷言缺陷存在**，必須反轉為正確行為 regression tests；不得原樣加入 release gate 並把 pass 當已修。

每項 finding 的狀態只能是：`open`、`in_progress`、`verified_fixed`、`already_fixed_with_evidence`、`blocked_external`。有新函數或測試檔並不等於修好。`verified_fixed` 需要行為測試＋涉及 DB 時的真實 Postgres 驗證＋涉及 UI 時的角色 smoke 證據。沒有登入／DB 資源時，完成可做的 code/unit work，但保留相應 release gate 為 blocked，不要以 mock 代替。

## 2. PR 次序、依賴與範圍

| Wave／PR | 任務 | 交付結果 | 前置 gate |
|---|---|---|---|
| 0：基線 | T00 | 最新差異、環境、重現清單 | 三份 references 完整可讀 |
| 1：授權／輸入 | T01 → T02 → T03 → T04 | 各入口一致授權、runtime schemas、匯入寫入權限 | T00 |
| 2：審批／報價 | T05 → T06 → T07；T08、T10 | 終態保護、固定版本、原子交接、Xero／risk 正確 | Wave 1；真實隔離 Postgres |
| 3：數字／支援 | T09、T11 | 按幣種／接受日、HK 日期、受控恢復及誠實發送狀態 | T05–T08、T10 |
| 4：日常／批量 | T12 → T14 → T13 → T15 → T16 → T17 → T18 | 分頁、共用 bulk、可恢復匯入、Job Sheet／Admin／入職 | Wave 1–3 |
| 5：效能／AI | T19、T21 | 真實量測、bundle 改善、AI timeout／telemetry | 主要操作流程穩定 |
| 6：資料來源 | T20（逐域子 PR） | Neon／legacy seam 與對帳／切換 | T02、T03、T12；各域 migration rehearsal |
| 7：發版 | T22 | 當前 SHA gate、角色 smoke、runbooks | 各 finding 有證據或明確 release blocker |

這是依賴次序，不是工期承諾。每個 task 可獨立 review；較大的 task 可拆連續小 PR，但不可部署只完成 schema 或只換 UI、未接好授權的半套功能。T20 可較晚發版，但未切換域的 CO-25 不可標為全部完成。

## 3. 核心設計決定（新增契約，不是現有 API 聲明）

### 3.1 授權及 action eligibility

沿用 `evaluateAuthorization`、`requirePageAuthorization`、`RowAuthorizer.allow`。新增 `RequestAuthorization` 作 server-only request context；在單次 handler／shell orchestration 明確傳遞，不能 module-global cache。不同 HTTP 請求可以各有一次載入，不能為節省 queries 跨使用者／跨請求共用。

新增 `ActionEligibility = { allowed: boolean; reasonCode?: string; label?: string }`；server 依當時 capability、resource scope、狀態及必要資料返回。Client 只作呈現；每個 write 再檢查。拒絕原因不得透露本來無權讀取的 owner／customer 名称。

Search/list query 的候選集合必須在授權後才計 count、搜尋內容或聚合。新 `visibility-scope.server.ts` 將現有 evaluator 規則轉為參數化 SQL scope，支援 manager scope、explicit allow/deny、expiry；用同一 fixture matrix 與 evaluator 做 parity tests。對尚未支持的 legacy scope fail closed／停用該 result type，不可退回全表查詢，也不可 `LIMIT` 後才過濾令總數及頁碼洩漏或失真。RowAuthorizer 保留最後防線。

### 3.2 命令、version 與 idempotency

新 `CommandMeta = { idempotencyKey: string; expectedVersion: number }`。為 mutable quote／approval／job sheet／portion／task 加 `row_version bigint not null default 0`；每次 write 以 compare-and-set 增量，**所有既有、workflow、bulk writer** 都要納入，不能只 UI 更新 version。

`command_receipts` 保存 actor、command kind、key、request hash、resource reference、結果、created_at；unique `(actor_id, command_kind, idempotency_key)`。同 key 同 payload 回同結果；同 key 不同 payload → `CONFLICT`。授權在回傳 receipt 前仍重驗；失權後不能藉重播讀舊敏感 payload。receipt 不永久保存完整客戶 context；資源結果仍套用目前讀取政策。

每個 command 一個 outer transaction；repository 新 `db?: Queryable` 參數透傳到所有 write/read，不容隱藏 nested transaction 或用 pool 在交易外寫入。Lock order 固定 quote → approval → version／job sheet → portion → run；多 record IDs 排序，避免相反順序死鎖。使用既有 `transaction()`，不要新造第二套 DB client。

任何通知 DB row 若屬 command 結果，與業務一起 commit；**外部** n8n／email 不放交易內。需外部呼叫的地方以已提交 run／待執行紀錄＋idempotent dispatch 處理；無實際 delivery integration 就顯示待人手，不假裝已發送。

### 3.3 生命週期

| 資源 | 本次採用規則 |
|---|---|
| Quote | 沿用 DB 值 `draft/pending_approval/approved/sent/viewed/accepted/rejected/expired/revised`；「issued」是 UI 說法及 version reason，不新增同義 status |
| Quote edit | 一般商業編輯只在 draft/revised 且無未關閉審批時允許。批准後不修改原商業內容；建立有 parent/version reference 的 revision，再審批。accepted amendment 走 change order，不改原 Job Sheet |
| Approval | pending → approved/rejected/escalated；escalated → 重新分派後再 approved/rejected。新增明確 superseded 終態供舊請求被替代，不能假記成 reviewer rejected。approved/rejected/superseded 不可改；重新提交建立新 approval，連結舊項，不覆寫歷史 |
| Quote approval | manager 可批准而不發出；issuance 要 `quotes.issue`。Combined command 若保留，必須同時檢查 quote approve、quote issue、approval decide 的各 resource |
| Acceptance | 明確提交 issuedVersionId；version 屬該 quote 且可接受。接受 snapshot 由該 immutable issued snapshot 複製／引用，不從當前可編輯 quote 產生；Job Sheet 金額及幣種來自 accepted version |
| Xero portion | notes 不改 status；確認入單需非空 invoice number 或 reference，加明確確認 action。清空欄位不得隱式退回 planned；更正要理由、版本及 audit |
| Risk review | approval、engagement 變更、run outcome、audit 同一交易。決定失敗全部不提交 |
| Agent | 沿用 running/waiting_approval/completed/failed；timeout／cancel 記 failed + outcome_code，不隨意增加一套 status。run completed 不等於訊息 delivered |

舊 quote 缺 issued snapshot、accepted_at 或多個有效 pending approval：先輸出 reconciliation 清單；有證據才 backfill。無證據標 legacy-unverified、禁止危險 command，提供管理員核對路徑；不刪舊紀錄、不用 updated_at 假造 acceptance。

### 3.4 Bulk／匯入契約

第一版用**明確 IDs**，最多 100 records/action，不做無上限「全選所有結果」。跨頁可累積 IDs，但工具列必須說明「已選 N 筆」及 cap。預覽有 actor-owned token、action、固定 IDs/hash、versions、expiry（10 分鐘）；commit 重新逐筆授權及驗證，不把 preview 當 grant。

```ts
// Proposed public contracts; implement in src/lib/operations/bulk-contract.ts
export type BulkItemStatus = 'succeeded' | 'failed' | 'forbidden' | 'stale' | 'not_found';
export type BulkItemResult = {
  id: string; status: BulkItemStatus; code?: string;
  message?: string; retryable: boolean; resultingVersion?: number;
};
export type BulkResult = {
  operationId: string; state: 'paused' | 'running' | 'completed';
  processed: number; total: number; results: BulkItemResult[];
};
```

New bulk actions 以 Zod discriminated union 明確 payload，不開放任意 table/column/update。支援 task assign/due/priority/status、approval decide/assign、team add-member、job-sheet assign/invoice-target-date，以及既有 Lead actions；每個 action 映射既有 capability + resource。批量決定僅同一 approval type 且相同 action，預覽列每筆摘要；不做 bulk quote acceptance、不新增任意批量升權。

逐筆 transaction、結果及 item idempotency 一起 commit。每次 process 最多 20 items，server concurrency ≤ 4，處理約 5 秒便於 item 邊界返回；statement timeout 作資料庫保護，不能把 timeout 直接當作「一定沒有寫入」。persistent operation/item receipt 讓斷線後查詢及續做；UI 續呼叫而非一次 100 個 request。關頁後暫停，重新進入可 Resume，文案不可承諾背景仍執行。若要無人值守 background worker，是後續獨立部署項目。

CSV import：UTF-8、最多 5 MiB／5,000 data rows；parse/preview 後持久 normalized rows、actor、file hash、每列 diff／error；24 小時後未 commit 的預覽失效。每輪最多 20 rows，與 bulk 共用 resumable runner。每列 all-or-nothing，不一個 5,000-row 長 transaction。已完成 row 不重寫；invalid/forbidden/skipped/stale 全部有結果。preview 存敏感資料需 server-only、owner access、7 日 retention cleanup（metadata/audit 依現有政策保留）。

匯入去重只採可信 existing record ID／確定的既有 matching key；**不可把公司名稱或 email 一律設 global unique**。先盤點現有 key／重複群，保留 ambiguous 為人工處理；對已有明確身份的 key 建正規化 mapping＋唯一约束，同時併發只會指向一筆。保留 Lead reimport 不重設 status/owner/score 的規則。

### 3.5 顯示、效能及新設定

- Monetary amount 在 SQL NUMERIC 聚合；回傳 decimal-safe 值；commercial UI 顯示兩位小數（現有 schema 為兩位）。按 currency 分開，不引入未有來源的匯率。報表命名為「已接受報價金額」，不是已收款。
- datetime 使用 explicit Asia/Hong_Kong（SSR/CSR 一致）；date-only 作日期字串，禁止 UTC conversion；未有 profile timezone 欄位前不新增不必要設定。
- Page default 50、max 100；sort 加穩定 id tie-breaker；pending queue 與 history/detail 分離。Polling 只限可見 pending queue，30 秒一次；history 不輪詢，寫入後 invalidate 相關 keys。
- 本文的 100 records、5 MiB、5,000 rows、20-item chunk、concurrency 4、30 秒、10 分鐘等均是**本次設計上限／預設值**，不是審核已量到的系統能力。以 load test 驗證後只可調低安全 cap，調高須附量測。

## 4. 逐項執行任務

每個 code task 必須先加能描述正確行為的測試、確認在未修版本 FAIL，再作最小修復、跑指定測試及相關現有 tests、`git diff --check`，然後在 feature branch commit。測試 filename 下列標為「新增」的均是計劃路徑；不要宣稱已存在。Route tests 放 `src/routes/__tests__/-*.test.tsx`，避免變成路由。Task 不可只增加 source regex assertion；狀態／交易問題必須有 real DB tests。

### T00：固定新基線及 finding 對照

**Findings：** 全部  
**Depends on：** 無

**Files：** 讀取 `CLAUDE.md`、`README.md`、`.github/workflows/checks.yml`、`.github/workflows/database-contract.yml`；新增 `docs/audit-fixes/2026-09-27/status.md` 及 `baseline.md`。

**Interfaces／產出：** 產出 baseline SHA、audit SHA diff、30-row status table、環境 availability；不變更產品。

- [ ] **1. 行為測試／基線：** 檢查 references 的 SHA256／ZIP 清單；fetch 後比較最新 main 與 audit SHA。每個 finding 用現有 call chain 判斷 still-open 或 already-fixed，後者仍需 regression evidence。
- [ ] **2. 確認 Red：** 對新增正確行為測試先在未修程式跑一次；保存失敗原因。T00/T22 為文件／驗證任務，以實際查核結果取代人造 failing test。
- [ ] **3. 最小實作：** 用 `git status --short` 保存起點；若有 unrelated changes，建立隔離 `codex/clientops-audit-fixes` 工作分支／worktree，不覆蓋。記錄 Bun／lockfile；跑基線 gate，DB 測試另記 skip 原因。
- [ ] **4. 接入及相容：** 確認新基線後將 audit probes 分配至 T03/T05/T06/T07/T08/T09/T14，先記錄舊行為，不把 probes 當產品正確性測試。
- [ ] **5. 驗證：** `git diff --check`；references hashes 一致；30 個 CO ID 各一列，有實際 baseline SHA；缺 production session 不阻擋 code tasks。
- [ ] **6. 提交：** 只 stage 本 task 檔案，`git diff --check`，commit `docs: record clientops audit fix baseline`；更新 finding status及證據路徑。

### T01：把 write casts 換成 runtime contracts

**Findings：** CO-30  
**Depends on：** T00

**Files：** 修改 `src/server-functions/{tasks,quotes,approvals,job-sheets,lead-import,client-import,event-import}.ts`；新增 `src/lib/operations/input-schemas.ts`、`errors.ts`；沿用 `src/lib/types.ts` enum。

**Interfaces／產出：** 輸出 `CommandMetaSchema`、`TaskMutationSchema`、`QuoteCommercialPatchSchema`、`ApprovalDecisionSchema`、`JobSheetMutationSchema` 及對應 z.infer types；錯誤 code 統一 INVALID_INPUT/FORBIDDEN/NOT_FOUND/CONFLICT/INVALID_STATE。

- [ ] **1. 行為測試／基線：** 新增 `src/server-functions/__tests__/audit-input-validation.test.ts`：NaN/Infinity、negative amount、非法日期、未知 enum、空 IDs、101 bulk IDs、超長 notes 皆拒絕且 repository call count=0；合法 null 清欄位與 missing 不混淆。
- [ ] **2. 確認 Red：** 對新增正確行為測試先在未修程式跑一次；保存失敗原因。T00/T22 為文件／驗證任務，以實際查核結果取代人造 failing test。
- [ ] **3. 最小實作：** 以 strict Zod object 白名單拒絕未知欄位；通用 quote patch 不可夾 lifecycle/version fields。UUID、trim、日期格式＋真實日曆日、notes≤10,000 字、search≤200 字；money 按 NUMERIC schema 上限及 2 decimals。ID 合法不代表授權。
- [ ] **4. 接入及相容：** 將所有 touched serverFn validators 接到 schemas，UI field errors 可定位；在 T05–T17 新 API 同樣使用，不以 `as` 代替 parse。
- [ ] **5. 驗證：** `bunx vitest run src/server-functions/__tests__/audit-input-validation.test.ts` → PASS；再跑既有 tasks/quotes/approvals/job-sheets server-function tests。
- [ ] **6. 提交：** 只 stage 本 task 檔案，`git diff --check`，commit `fix: validate clientops write boundaries`；更新 finding status及證據路徑。

### T02：單請求 authorization context 與 visibility scope

**Findings：** CO-22；CO-01–03 基礎  
**Depends on：** T01

**Files：** 修改 `src/server/auth/authorization.server.ts`、`resource-ownership.ts`、`src/server-functions/admin-users.ts`、`src/server/app-shell/loaders.ts`；新增 `src/server/auth/visibility-scope.server.ts`。

**Interfaces／產出：** export `RequestAuthorization`、`loadRequestAuthorization(): Promise<RequestAuthorization>`；`checkWithContext(ctx, checks: readonly CapabilityCheck[]): Promise<readonly AuthorizationDecision[]>`；`buildVisibilityScope(ctx, resourceType, alias): {sql:string; values:readonly unknown[]}`。Context 含既有 session/actor/overrides；不送 client。

- [ ] **1. 行為測試／基線：** 新增 `src/server/auth/__tests__/request-context.test.ts`：同 request 的 nav/session/capabilities 只載入一組 context；A/B 並行 request 不互見；下一個 request 撤權立即生效。新增 `visibility-scope.integration.test.ts`：7 roles、allow/deny/scope/expiry 對既有 evaluator 結果相同。
- [ ] **2. 確認 Red：** 對新增正確行為測試先在未修程式跑一次；保存失敗原因。T00/T22 為文件／驗證任務，以實際查核結果取代人造 failing test。
- [ ] **3. 最小實作：** 先把私有 load context 抽成可傳遞介面；既有 require* wrapper 保持相容但內部可接 context。Shell 合併讀取一次，消除 nav 每項重讀；不用 global memo。
- [ ] **4. 接入及相容：** visibility builder 只接受內部白名單 alias/resource，不接受 client SQL；scope 同時尊重 explicit resource grant 及 deny。Unknown resource fail closed。權限 changes 與寫入的重驗策略記錄，bulk 每 chunk 載新 context。
- [ ] **5. 驗證：** `bunx vitest run src/server/auth/__tests__/request-context.test.ts src/server/auth/__tests__/visibility-scope.integration.test.ts` → PASS（後者有 DB，不可 skip）；記錄 auth queries 含 session lookup。
- [ ] **6. 提交：** 只 stage 本 task 檔案，`git diff --check`，commit `perf: reuse request authorization context safely`；更新 finding status及證據路徑。

### T03：封閉搜尋、首頁、列表的旁路

**Findings：** CO-01、CO-02、CO-03  
**Depends on：** T02

**Files：** 修改 `src/server-functions/{search,dashboard,approvals,job-sheets}.ts`、`src/server/repositories/{workspace-search,approvals,job-sheets}.ts`、`src/server/read-models/dashboard.ts`、`src/routes/index.tsx`。

**Interfaces／產出：** Consumes T02 scope；search/list read 接受 server context；輸出最小 DTO、per-record ActionEligibility。Dashboard sections 個別授權；accounting 有 job-sheet 工作隊列，不能要求 leads.view 才能讀首頁。

- [ ] **1. 行為測試／基線：** 新增 `src/server-functions/__tests__/cross-surface-visibility.integration.test.ts`：accounting 搜 lead 敏感字不回 result／count；task deny 的 title/description 不影響 search match；approval context_data、job-sheet list/detail/report/export 同筆 deny 一致；有 quote 權無 lead 權仍可看遮蔽 quote。
- [ ] **2. 確認 Red：** 對新增正確行為測試先在未修程式跑一次；保存失敗原因。T00/T22 為文件／驗證任務，以實際查核結果取代人造 failing test。
- [ ] **3. 最小實作：** 在 SQL match/aggregate/count 前套 scope；移除 select * 和不必要 context_data。Homepage 只查可用 section，permission error 不轉成空清單來掩蓋。任何通知／tooltip 查出同一路徑旁路也納入本項回歸。
- [ ] **4. 接入及相容：** Queue/detail 分開 DTO；保留合法 partial-redaction 而非一律整頁403。七角色畫面各有允許的下一步；看不到實體的錯誤避免洩漏存在性。
- [ ] **5. 驗證：** `bunx vitest run src/server-functions/__tests__/cross-surface-visibility.integration.test.ts` → PASS＋原 quote-linked visibility、tasks／agent subject redaction tests 不退步。
- [ ] **6. 提交：** 只 stage 本 task 檔案，`git diff --check`，commit `fix: enforce visibility across clientops read surfaces`；更新 finding status及證據路徑。

### T04：匯入每種 write 重新授權

**Findings：** CO-04  
**Depends on：** T01、T02

**Files：** 修改 `src/server-functions/{lead-import,client-import,event-import}.ts`、`src/server/repositories/{lead-import,client-import}.ts`；新增 `src/server/imports/authorize-row.server.ts`。

**Interfaces／產出：** `authorizeImportRow(ctx, rowPlan, db: Queryable): Promise<RowAuthorizationResult>`；RowAuthorizationResult 用 discriminated union：allowed 或 forbidden + 非敏感 reasonCode。rowPlan 為 parser/validator 產生的 server plan，含每項 create/update。

- [ ] **1. 行為測試／基線：** 新增 `src/server-functions/__tests__/import-row-authorization.integration.test.ts`：create allow/update deny 的既有 record 不變；new contact／engagement 分別驗證對應 capability；preview 後改 owner／deactivate 仍在 commit 拒絕；同列禁止部分寫入。
- [ ] **2. 確認 Red：** 對新增正確行為測試先在未修程式跑一次；保存失敗原因。T00/T22 為文件／驗證任務，以實際查核結果取代人造 failing test。
- [ ] **3. 最小實作：** 把 existing-match lookup／write plan 與 auth 接在一起；Lead 填空欄仍算 update；Client tier/industry 更新不可用 accounts.create 代替。預覽不向無 view 權人暴露既有值。
- [ ] **4. 接入及相容：** 每列開始時驗目前 scope，交易內以已鎖定 owner/version 驗證 target；全部授權及驗證成功才 write；保留 create-only 新 record 合法路徑。
- [ ] **5. 驗證：** `bunx vitest run src/server-functions/__tests__/import-row-authorization.integration.test.ts` → PASS；既有 Lead reimport 不重設 status/owner/score 測試通過。
- [ ] **6. 提交：** 只 stage 本 task 檔案，`git diff --check`，commit `fix: authorize every import side effect`；更新 finding status及證據路徑。

### T05：審批終態與 idempotent transaction 原語

**Findings：** CO-06；CO-07 基礎  
**Depends on：** T01、T02

**Files：** 修改 `src/server/repositories/approvals.ts`、`src/server/db/neon.server.ts`（僅必要相容變更）、`src/lib/types.ts`；新增 `src/server/commands/receipts.server.ts`、`approval-decision.server.ts`；新增 migration suffix `command_versions_and_receipts.sql`。

**Interfaces／產出：** `decideApprovalCommand(ctx, input: {id; decision; notes?} & CommandMeta): Promise<HumanApproval>`；內部 `decideApprovalInTransaction(db, ctx, input)` 不自行 begin/commit；所有 repositories 透傳 Queryable。

- [ ] **1. 行為測試／基線：** 新增 `src/server/db/__tests__/approval-command.integration.test.ts`：兩 DB connections 同時 approve/reject 只能一個成功；同 key retry 只一個 audit；相同 key 不同 payload conflict；失敗 rollback；終態新版 key 不可覆寫；reassign/decision race 用 version 擋。
- [ ] **2. 確認 Red：** 對新增正確行為測試先在未修程式跑一次；保存失敗原因。T00/T22 為文件／驗證任務，以實際查核結果取代人造 failing test。
- [ ] **3. 最小實作：** 加 row_version／command receipts migration，ApprovalStatus及DB check加入superseded、superseded_by關聯，schema verifier及所有status readers同步；lock row、檢查目前狀態/version，再決定。Receipt/approval/run/audit 都在一交易；相同 decision 的有效 retry 不重改 decided_at。
- [ ] **4. 接入及相容：** 盤點現有 assignApproval、workflow writeback、quote rejection 對 approvals 的所有 writers，接 state/version guard；escalated 保留待處理語義，已決定不能 reassign。
- [ ] **5. 驗證：** `bunx vitest run src/server/db/__tests__/approval-command.integration.test.ts` → PASS 且 0 skipped；使用真 PG lock／rollback 行為，不能只 expect SQL 字串。
- [ ] **6. 提交：** 只 stage 本 task 檔案，`git diff --check`，commit `fix: make approval decisions terminal and idempotent`；更新 finding status及證據路徑。

### T06：報價商業內容及版本不可變

**Findings：** CO-05  
**Depends on：** T05

**Files：** 修改 `src/server/repositories/{quotes,quote-versions}.ts`、`src/server-functions/quotes.ts`、`src/lib/{quote-to-cash,quote-document,quote-pdf-source}.ts`、`src/routes/quotes.$id.tsx`、`quotes.$id_.pdf.tsx`；新增 migration suffix `quote_version_integrity.sql`。

**Interfaces／產出：** `updateQuoteCommercial(ctx, {id, patch, ...meta})` 僅 draft/revised；`createQuoteRevision(ctx, {id, baseVersionId, reason, ...meta})` 產新 revision reference。現有 QuoteVersionReason 沿用；PDF resolve 必須 version-aware。

- [ ] **1. 行為測試／基線：** 新增 `src/server/db/__tests__/quote-immutability.integration.test.ts`：approved/sent/viewed/accepted 更新 total/currency/line items 均拒絕；revision B 不改 issued A；issued PDF/hash 不漂移；直接 repository 路徑及舊 writer 都受約束。
- [ ] **2. 確認 Red：** 對新增正確行為測試先在未修程式跑一次；保存失敗原因。T00/T22 為文件／驗證任務，以實際查核結果取代人造 failing test。
- [ ] **3. 最小實作：** 列出所有商業欄位（items/tax/discount/terms/currency/total/client-facing identity）與可改 metadata；schema 防止不可變 snapshot 更新／刪除，quote 商業更新依 status guard。version record 不用外部可編輯 product/contact 即時資料重算。
- [ ] **4. 接入及相容：** 為舊資料做 dry-run reconciliation：missing snapshot、snapshot與現表不符、accepted version 混亂。可證明的才修；其餘 blocked legacy-unverified。保留審計，禁止一鍵把所有舊 quotes 當 draft 解鎖。
- [ ] **5. 驗證：** `bunx vitest run src/server/db/__tests__/quote-immutability.integration.test.ts` → PASS；原 quote PDF/version/document tests 通過，實際預覽 A/B 文檔內容。
- [ ] **6. 提交：** 只 stage 本 task 檔案，`git diff --check`，commit `fix: preserve immutable commercial quote versions`；更新 finding status及證據路徑。

### T07：原子審批、出單、接受及 Job Sheet

**Findings：** CO-07、CO-08  
**Depends on：** T03、T05、T06

**Files：** 修改 `src/server-functions/quotes.ts`、`src/server/repositories/{quotes,quote-versions,job-sheets,approvals,notifications}.ts`、`src/routes/{approvals,quotes.$id}.tsx`；新增 `src/server/commands/quote-lifecycle.server.ts`；migration suffix `quote_open_approval_constraint.sql`。

**Interfaces／產出：** `approveQuoteCommand(ctx,{id,approvalId,...meta})`；`issueQuoteCommand(ctx,{id,...meta})`；`acceptQuoteCommand(ctx,{id,issuedVersionId,acceptanceEvidence,...meta})` → {quote,jobSheet}；request/reject 同 service。AcceptanceEvidence={reference:string,note?:string}，reference必填可為文件／email reference，非假造客戶授權。

- [ ] **1. 行為測試／基線：** 新增 `src/server/db/__tests__/quote-lifecycle-atomic.integration.test.ts`：在每次 write 後注入故障皆 rollback；兩次 request 只一個 open approval；兩次 acceptance 只一個 sheet；接受 A 只取 A，B 不滲入；manager approve成功/issue拒絕；issue-only override 不能 combined approve。
- [ ] **2. 確認 Red：** 對新增正確行為測試先在未修程式跑一次；保存失敗原因。T00/T22 為文件／驗證任務，以實際查核結果取代人造 failing test。
- [ ] **3. 最小實作：** 所有 business steps 用同一 db transaction；quote row lock＋open approval 唯一約束（quote_send、quote id、pending/escalated）。先列既有 duplicates 待核對，不任意刪除；supersede 必須正式關閉舊 pending/run 並保留連結。
- [ ] **4. 接入及相容：** 把「批准」與「發出」分 UI actions；combined 若保留檢查三個 capabilities及兩個resources。Accept 複製 issued snapshot 建 accepted version，固定 accepted_at，不重寫；job-sheet amount/currency/identity 都取 snapshot。安全地處理目前僅 quote-id 的舊 caller：server 明確選唯一 current issued版本，否則 conflict，UI 盡快升級 explicit version。
- [ ] **5. 驗證：** `bunx vitest run src/server/db/__tests__/quote-lifecycle-atomic.integration.test.ts` → PASS；兩角色 session smoke 完成 draft→approve→issue→accept→sheet；失權按鈕解釋及 server拒絕一致。
- [ ] **6. 提交：** 只 stage 本 task 檔案，`git diff --check`，commit `fix: transact quote lifecycle and separate issuance`；更新 finding status及證據路徑。

### T08：Xero linkage 與入帳狀態分離

**Findings：** CO-09  
**Depends on：** T05、T07

**Files：** 修改 `src/server/repositories/job-sheets.ts`、`src/server-functions/job-sheets.ts`、`src/components/job-sheets/billing-portions-table.tsx`；新增 `src/server/commands/billing-portion.server.ts`。

**Interfaces／產出：** `updateXeroNotes(ctx,{portionId,notes,...meta})`；`confirmXeroEntry(ctx,{portionId,invoiceNumber?,reference?,invoiceDate,...meta})`；`correctXeroEntry(ctx,{portionId,reason,patch,...meta})`。現有 capability `job_sheets.update_billing`＋resource scope；解除需受控更正流程，不新增普通人隱式解鎖。

- [ ] **1. 行為測試／基線：** 新增 `src/server/db/__tests__/xero-state.integration.test.ts`：notes-only 保持 planned；空 identifier 拒絕 confirm；clear 不解鎖；accepted sheet commercial欄仍不可改；cancelled 不被 notes復活；stale version拒絕。
- [ ] **2. 確認 Red：** 對新增正確行為測試先在未修程式跑一次；保存失敗原因。T00/T22 為文件／驗證任務，以實際查核結果取代人造 failing test。
- [ ] **3. 最小實作：** 停止由任意欄位有值推導 entered_in_xero；確認入單要求 identifier及invoice date，有 audit evidence。status correction 不等於可修改已接受條款；需要改額走 change order。
- [ ] **4. 接入及相容：** 舊 notes-only entered 項輸出核對清單，不自動全部退 planned；UI 顯示待核對／待輸入／已記錄 reference，明說為人工記錄，未聲稱與 Xero 同步。
- [ ] **5. 驗證：** `bunx vitest run src/server/db/__tests__/xero-state.integration.test.ts` → PASS；accounting smoke notes save 與 confirm 分開。
- [ ] **6. 提交：** 只 stage 本 task 檔案，`git diff --check`，commit `fix: separate xero notes from invoice confirmation`；更新 finding status及證據路徑。

### T09：幣種、接受期間與 HK 日期

**Findings：** CO-10、CO-26  
**Depends on：** T06、T07

**Files：** 修改 `src/server/read-models/{operations,dashboard}.ts`、`src/lib/{reports,format,business-date}.ts`、對應 reports／quote／job-sheet UI；新增 `src/lib/money.ts`；同步 CLAUDE 日期規則。

**Interfaces／產出：** `CurrencyTotal={currency:string; amount:string}`（decimal string）；`formatCommercialMoney(amount,currency):string`；`formatDateTime(value,{timeZone?:string})` default Asia/Hong_Kong；date-only走独立formatter不轉瞬間。

- [ ] **1. 行為測試／基線：** 新增 `src/server/read-models/__tests__/revenue-currency.integration.test.ts`：HKD100/USD100 兩組，不能 HKD200；accepted舊quote更新 metadata仍原期間；缺 accepted_at進unverified桶。擴充 `src/lib/__tests__/format.test.ts`：HK00:30顯27日、date-only不前移、兩位小數、SSR/CSR一致。
- [ ] **2. 確認 Red：** 對新增正確行為測試先在未修程式跑一次；保存失敗原因。T00/T22 為文件／驗證任務，以實際查核結果取代人造 failing test。
- [ ] **3. 最小實作：** 報表改按 accepted event/version＋HK半開日期區間 [start,end)；pipeline/dashboard同樣分 currency；compact KPI要標註取整，正式金額不用整數formatter。不建立虛構 FX rate。
- [ ] **4. 接入及相容：** 舊無時間資料不拿 updated_at backfill，顯示「未有可靠接受日期」數量；report標籤／CSV為「已接受報價金額」，與invoice/收款分開。
- [ ] **5. 驗證：** `bunx vitest run src/server/read-models/__tests__/revenue-currency.integration.test.ts src/lib/__tests__/format.test.ts` → PASS；跨月/年、00:00邊界及100.25金額驗收。
- [ ] **6. 提交：** 只 stage 本 task 檔案，`git diff --check`，commit `fix: report quote values by currency and acceptance date`；更新 finding status及證據路徑。

### T10：Renewal-risk 審批與套用原子化

**Findings：** CO-11  
**Depends on：** T05

**Files：** 修改 `src/server-functions/approvals.ts`、`src/server/workflows/decide-risk-review.server.ts`、`src/server/repositories/approvals.ts`；必要的 engagement repository 透傳 Queryable。

**Interfaces／產出：** `decideRiskReviewInTransaction(db,ctx,{approvalId,decision,notes?,...meta})`；由單一 approval command dispatcher 路由 cs_risk_review，只有該 dispatcher 管 outer transaction。

- [ ] **1. 行為測試／基線：** 新增 `src/server/db/__tests__/risk-review-atomic.integration.test.ts`：更新 engagement失敗→approval仍pending、run仍waiting、無新audit；success只一個事件；同 key retry不重套risk；payload指向不同engagement拒絕。
- [ ] **2. 確認 Red：** 對新增正確行為測試先在未修程式跑一次；保存失敗原因。T00/T22 為文件／驗證任務，以實際查核結果取代人造 failing test。
- [ ] **3. 最小實作：** 先lock/authorize approval及目標engagement；從已保存 review context讀取可套用提案，不接受 client隨便傳 risk。approval、engagement、run、activity一起 commit。
- [ ] **4. 接入及相容：** 確保 generic decideApproval 不會先把run改completed再轉另一transaction；reject不套用，但以明確 outcome完成review run。
- [ ] **5. 驗證：** `bunx vitest run src/server/db/__tests__/risk-review-atomic.integration.test.ts` → PASS；現有 risk/writeback tests全部通過。
- [ ] **6. 提交：** 只 stage 本 task 檔案，`git diff --check`，commit `fix: apply risk decisions atomically`；更新 finding status及證據路徑。

### T11：無主審批、stuck run 恢復及真實訊息狀態

**Findings：** CO-12、CO-13  
**Depends on：** T05、T07、T10

**Files：** 修改 `src/server-functions/{approvals,agent-runs}.ts`、`src/server/repositories/{approvals,agent-runs}.ts`、`src/routes/{approvals,ai-review,agents.$name}.tsx`、workflow writebacks；新增 `src/server/commands/agent-recovery.server.ts` 及 migration suffix `agent_recovery_metadata.sql`（approval superseded欄位由T05提供）。

**Interfaces／產出：** `claimApprovalCommand(ctx,{id,...meta})`、`recoverAgentRunCommand(ctx,{runId,action:"expire"|"cancel"|"retry",reason,...meta})`；outcome_code與superseded_by/retry_of links；message approval另存 handoff_status=awaiting_manual_send/manual_send_recorded，不等同delivery receipt。

- [ ] **1. 行為測試／基線：** 新增 `src/server/db/__tests__/approval-recovery.integration.test.ts`：null owner 的manager只有linked subject在scope才可claim；owner未知fail closed；兩人claim只能一個；supersede原run不再鎖新run；晚到callback不可復活舊run；cancel/retry不重送外部message。
- [ ] **2. 確認 Red：** 對新增正確行為測試先在未修程式跑一次；保存失敗原因。T00/T22 為文件／驗證任務，以實際查核結果取代人造 failing test。
- [ ] **3. 最小實作：** Claim以subject/requester可證明scope判斷，不對所有unassigned放權。Escalation顯示review owner；retry先關閉舊active狀態並保留原因，新run有新attempt id。無法證明外部是否執行時顯示「結果待確認」，不盲目retry。
- [ ] **4. 接入及相容：** 目前採manual handoff：成功文案「草稿已批准，待人手發送」，提供複製、記錄sent reference及actor/time。這只記錄人手聲明，不是平台已發送。不新增自動WhatsApp/email或聲稱n8n外部一定不存在。
- [ ] **5. 驗證：** `bunx vitest run src/server/db/__tests__/approval-recovery.integration.test.ts` → PASS；無主、escalated、lost callback與duplicate callback逐一 smoke。
- [ ] **6. 提交：** 只 stage 本 task 檔案，`git diff --check`，commit `fix: add controlled approval and agent recovery`；更新 finding status及證據路徑。

### T12：Tasks／Approvals 分頁及人員搜尋

**Findings：** CO-14、CO-15；CO-20 共用  
**Depends on：** T02、T03、T05

**Files：** 修改 `src/server-functions/{tasks,approvals,admin-users}.ts`、`src/server/repositories/{tasks,approvals}.ts`、`src/routes/{tasks,approvals}.tsx`、`src/lib/query-keys.ts`；新增 `src/components/people/profile-search-combobox.tsx`。

**Interfaces／產出：** `Page<T>={items:T[];nextCursor:string|null;total?:number}`；`listAssignableProfiles({query,cursor,limit,purpose,resourceId?})` 返回 id/displayName/isEligible/reason，不洩漏私有profile資料；cursor含sort和filter hash。

- [ ] **1. 行為測試／基線：** 新增 `src/server-functions/__tests__/queues-pagination.integration.test.ts`：priority server-filter、stable pagination無重複、count僅可見records、page cap100、context_data不在list；第250人可找到。新增 `src/routes/__tests__/-tasks-owner-picker.test.tsx`：選A後仍可搜B，UUID不作label，Unassigned/My tasks可用。
- [ ] **2. 確認 Red：** 對新增正確行為測試先在未修程式跑一次；保存失敗原因。T00/T22 為文件／驗證任務，以實際查核結果取代人造 failing test。
- [ ] **3. 最小實作：** 實作50/page/max100、SQL filters＋適合索引；分pending/history/detail，30秒只poll visible pending，background及history停止，detail按需載入。Board也不可一次載全部，可各lane分頁。
- [ ] **4. 接入及相容：** Profile picker query獨立於rows；purpose=task_filter需tasks.view且只傳可見task關聯的最小姓名，purpose=task_assign需tasks.update並按可分派scope，approval reviewer需approvals.decide，admin access/successor需對應permissions/users管理能力；不把一般Task使用者逼成users.view全人員目錄權限。selected ID可單獨resolve可讀displayName；拿不到名字顯示「未能取得名稱」不洩漏原ID作使用文案。Filter寫URL、refresh後保留。
- [ ] **5. 驗證：** `bunx vitest run src/server-functions/__tests__/queues-pagination.integration.test.ts src/routes/__tests__/-tasks-owner-picker.test.tsx` → PASS；10k tasks/100k approvals量測於T19。
- [ ] **6. 提交：** 只 stage 本 task 檔案，`git diff --check`，commit `feat: paginate work queues and resolve people names`；更新 finding status及證據路徑。

### T13：一致的批量結果與續做

**Findings：** CO-16；日常 bulk 基礎  
**Depends on：** T01、T05、T07、T12、T14

**Files：** 新增 `src/lib/operations/bulk-contract.ts`、`src/server/operations/bulk.server.ts`、`src/server-functions/bulk-operations.ts`、`src/components/operations/bulk-action-bar.tsx`；修改 `src/routes/{leads,approvals,tasks,admin.teams}.tsx`；migration suffix `bulk_operations.sql`。

**Interfaces／產出：** `previewBulk(ctx,request):Promise<BulkPreview>`（token/expiresAt/rows/eligibleCount）；`commitBulk(ctx,{previewToken,idempotencyKey}):Promise<BulkResult>`；`resumeBulk(ctx,{operationId}):Promise<BulkResult>`；`getBulkResult`有owner access，types見3.4。

- [ ] **1. 行為測試／基線：** 新增 `src/server/db/__tests__/bulk-resume.integration.test.ts`：100筆=70success/10forbidden/10stale/10missing逐筆結果，重新resume成功筆write count仍1；worker互搶同item只有一個commit；preview失效或被換actor拒絕；半途斷線能續。新增 `src/routes/__tests__/-bulk-partial-results.test.tsx` 驗保留失敗selection及refresh。
- [ ] **2. 確認 Red：** 對新增正確行為測試先在未修程式跑一次；保存失敗原因。T00/T22 為文件／驗證任務，以實際查核結果取代人造 failing test。
- [ ] **3. 最小實作：** operation/item rows、payload hash、item receipt在DB持久化；claim item row lock／lease、lease expiry可恢復。已提交結果同transaction保存，避免業務成功但receipt丟失。process最多20、並行4、時間到return paused；呼叫處理期間running，全部有結果才completed。
- [ ] **4. 接入及相容：** 逐action白名單handler呼叫同單筆command，重新auth/status/version。進度不假裝原子全成功；teams不用Promise.all一個fail遮蓋其他success。只retry retryable failed；stale需refresh+新preview、forbidden不可loop。保留Leads既有良好partial模式。
- [ ] **5. 驗證：** `bunx vitest run src/server/db/__tests__/bulk-resume.integration.test.ts src/routes/__tests__/-bulk-partial-results.test.tsx` → PASS；button鍵盤／busy／progress／failed export（T14安全CSV）驗收。
- [ ] **6. 提交：** 只 stage 本 task 檔案，`git diff --check`，commit `feat: persist bulk results and resume failed operations`；更新 finding status及證據路徑。

### T14：正確 CSV parsing 及安全 export

**Findings：** CO-17、CO-29  
**Depends on：** T01

**Files：** 修改 `src/lib/{csv-import,csv}.ts` 及其 callers；擴充 `src/lib/__tests__/{csv-import,csv}.test.ts`。

**Interfaces／產出：** `parseImportCsv`兼容現有正常 callers，內部整檔state machine；新增 parse result帶recordIndex/startLine/errors；export用typed columns text/number/date，text經 `escapeSpreadsheetText(value:string):string` 再RFC quoting。

- [ ] **1. 行為測試／基線：** 測試一列 quoted multiline只得1record，BOM/CRLF/escaped quotes/空尾列/中文正常；unclosed quote明确error。Text =,+,-,@、前置空白tab/CR中和，合法numeric -12.50仍數字；round-trip字串內容可說明地保留。
- [ ] **2. 確認 Red：** 對新增正確行為測試先在未修程式跑一次；保存失敗原因。T00/T22 為文件／驗證任務，以實際查核結果取代人造 failing test。
- [ ] **3. 最小實作：** 不要先split newline；使用單一整檔parser，所有Lead/Client/event入口共用；若採第三方parser先看依賴／供應鏈規則，本計劃預設不加新package。
- [ ] **4. 接入及相容：** 所有report/bulk error CSV套typed export；formula defense不等同加CSV引號。提供UTF-8 BOM給Excel時不可破壞parser；用無害 =1+1案例檢視Excel/LibreOffice顯為literal。
- [ ] **5. 驗證：** `bunx vitest run src/lib/__tests__/csv-import.test.ts src/lib/__tests__/csv.test.ts` → PASS；多行和公式兩個舊probe改正向 regression。
- [ ] **6. 提交：** 只 stage 本 task 檔案，`git diff --check`，commit `fix: handle multiline csv and neutralize formulas`；更新 finding status及證據路徑。

### T15：可恢復、可對帳的 CSV 匯入

**Findings：** CO-18  
**Depends on：** T04、T13、T14

**Files：** 修改 `src/server-functions/{lead-import,client-import,event-import}.ts`、其repository及import routes；新增 `src/server/imports/import-session.server.ts`；migration suffix `import_sessions_and_identity_keys.sql`。

**Interfaces／產出：** `previewImport(ctx,{kind,csvText}):Promise<ImportPreview>`；`commitImport(ctx,{sessionId,previewHash,idempotencyKey}):Promise<ImportResult>`；`resumeImport(ctx,{sessionId}):Promise<ImportResult>`；ImportResult含每列recordIndex/action/status/errors/id及processed/total；ImportRowStatus = succeeded/failed/forbidden/stale/invalid/skipped/ambiguous，獨立於BulkItemStatus，adapter不可把invalid默默丟掉。

- [ ] **1. 行為測試／基線：** 新增 `src/server/db/__tests__/import-resume.integration.test.ts`：5,000 rows中validation/auth/duplicate各種結果總數對齊；timeout重送不重複create；兩import同可信key只一record；同name不同客戶不merge；owner preview後inactive不write；一row contact失敗整row rollback。
- [ ] **2. 確認 Red：** 對新增正確行為測試先在未修程式跑一次；保存失敗原因。T00/T22 為文件／驗證任務，以實際查核結果取代人造 failing test。
- [ ] **3. 最小實作：** 5MiB/5000 cap、24h preview expiry、persist rows/hash/versions、7日cleanup；每輪20rows／每列txn。所有新validation結果逐列返回，不只取valid subset；client總數可reconcile。Raw CSV不寫一般logs。已commit的session可在24h preview expiry後繼續，但7日retention前到期仍未完成者明確標expired並停止，不刪掉後假裝完成；保留最小去重receipt及audit到既有保留期。
- [ ] **4. 接入及相容：** 做key inventory及existing duplicates dry-run，明確 external ID優先；normalized legacy key僅在業務identity確定才建立unique mapping。Ambiguous要求使用者選既有ID或skip，無人工選擇不得自動merge。保存reimport保護及來源行號。
- [ ] **5. 驗證：** `bunx vitest run src/server/db/__tests__/import-resume.integration.test.ts` → PASS；browser上傳→preview diff→20row chunks→close/resume→error download演示，說明關頁暫停。
- [ ] **6. 提交：** 只 stage 本 task 檔案，`git diff --check`，commit `feat: make csv imports resumable and auditable`；更新 finding status及證據路徑。

### T16：Job Sheet 交接及會計批量維護

**Findings：** CO-19  
**Depends on：** T07、T08、T09、T13

**Files：** 修改 `src/server-functions/job-sheets.ts`、`src/server/repositories/job-sheets.ts`、`src/routes/job-sheets.tsx`、`src/routes/job-sheets.$id.tsx`；新增 `src/components/job-sheets/handoff-header-form.tsx`；必要migration suffix `job_sheet_handoff_fields.sql`。

**Interfaces／產出：** `updateJobSheetHeader(ctx,{id,accountingOwner,poNumber?,noPoReason?,clientOrder?,billingInstructions?,...meta})`；`listJobSheetsPage`加company/quote/owner/PO/status/date filters；bulk action擴充assign及portion targetInvoiceDate。

- [ ] **1. 行為測試／基線：** 新增 `src/server-functions/__tests__/job-sheet-handoff.integration.test.ts`：公司及quote number可搜；PO缺少但有reason可提交review；缺兩者提示；owner無效拒絕；accepted後commercial edit拒絕；total portions與accepted snapshot amount一致；bulk部分鎖定只該筆failed。
- [ ] **2. 確認 Red：** 對新增正確行為測試先在未修程式跑一次；保存失敗原因。T00/T22 為文件／驗證任務，以實際查核結果取代人造 failing test。
- [ ] **3. 最小實作：** Header顯示公司、quote/version、金額幣種、sales/accounting owner、PO缺件及next action；billing schedule明示總額／分期／差額。接受前PO或原因必填及accounting owner有效，保留其他既有必填gate。
- [ ] **4. 接入及相容：** 更新header是明確endpoint而非泛用patch；accepted後只可改允許的非商業metadata或受控更正。invoice日期用date-only；list filters保留URL、手機可用、bulk export用T14。
- [ ] **5. 驗證：** `bunx vitest run src/server-functions/__tests__/job-sheet-handoff.integration.test.ts` → PASS；sales交接→accounting補件→accept→billing→Xero記錄完整smoke。
- [ ] **6. 提交：** 只 stage 本 task 檔案，`git diff --check`，commit `feat: complete job sheet handoff and maintenance`；更新 finding status及證據路徑。

### T17：Admin 大名單、Teams 及接手人

**Findings：** CO-20；CO-16 Admin落地  
**Depends on：** T12、T13

**Files：** 修改 `src/routes/{admin.people,admin.access,admin.teams}.tsx`、`src/server-functions/{admin-users,admin-teams,admin-access}.ts`、`src/server/admin/reassignment.server.ts`；重用profile-search-combobox。

**Interfaces／產出：** Admin pickers使用T12 search/cursor/selected hydration；existing reassignment preview增加open-work/history分類及各bucket count；membership bulk走T13。有效權限UI顯示baseline/override/scope/expiry來源。

- [ ] **1. 行為測試／基線：** 新增 `src/routes/__tests__/-admin-large-directory.test.tsx`：第101/250人可選，已選項不在當頁仍顯名；inactive不可接手；part-success仍refresh成功項。DB測試已有deactivation/reassignment再加audit actor/歷史事件身份不變。
- [ ] **2. 確認 Red：** 對新增正確行為測試先在未修程式跑一次；保存失敗原因。T00/T22 為文件／驗證任務，以實際查核結果取代人造 failing test。
- [ ] **3. 最小實作：** 解除page1 limit100 picker；search server-side、debounce、pagination。不因缺options把已選人清空。Team add先previeweligible/duplicate/forbidden。
- [ ] **4. 接入及相容：** 離職重新指派先列所有資源語義：live ownership可轉，created_by/decided_by等事件身份不可改。對closed assigned_to等含糊欄先在preview明列並保持現值，需owner決定後獨立migration；不可默默全history重寫。
- [ ] **5. 驗證：** `bunx vitest run src/routes/__tests__/-admin-large-directory.test.tsx` → PASS；既有admin reassignment/super-admin protection tests通過。
- [ ] **6. 提交：** 只 stage 本 task 檔案，`git diff --check`，commit `feat: improve admin directory and reassignment workflow`；更新 finding status及證據路徑。

### T18：邀請與身份帳戶狀態清楚分離

**Findings：** CO-21  
**Depends on：** T02

**Files：** 修改 `src/components/auth/{login-auth-page,login-auth-form}.tsx`、`src/routes/{login,login.$authPath,invite.$token,invite.$token.complete}.tsx`、`src/lib/auth/neon-auth.server.ts`；新增 `src/components/auth/workspace-access-state.tsx`。

**Interfaces／產出：** 新增 server-only `resolveWorkspaceAccess()` discriminated state：anonymous/active/invited/suspended/deactivated/no_profile；既有requireNeonAuthSession仍只放active進workspace。

- [ ] **1. 行為測試／基線：** 新增 `src/components/auth/__tests__/workspace-access-state.test.tsx`：有identity無profile顯待邀請不是login loop；suspended拒絕workspace；invite有效/過期/已使用文案；未登入不可查任意email是否存在。
- [ ] **2. 確認 Red：** 對新增正確行為測試先在未修程式跑一次；保存失敗原因。T00/T22 為文件／驗證任務，以實際查核結果取代人造 failing test。
- [ ] **3. 最小實作：** Login文案清楚「內部工作區，需管理員邀請」；Sign Up不承諾domain即有權限。不改身份provider全域設定來修copy；invite completion route仍可完成註冊。
- [ ] **4. 接入及相容：** 按current authenticated identity讀activation state，不提供email enumeration API；提供已有邀請／找管理員指引，沒有真實resend endpoint就不造可按但無功能的button。
- [ ] **5. 驗證：** `bunx vitest run src/components/auth/__tests__/workspace-access-state.test.tsx` → PASS；用隔離測試帳戶驗signup/invite/active/suspended，不在production註冊。
- [ ] **6. 提交：** 只 stage 本 task 檔案，`git diff --check`，commit `fix: clarify invitation and workspace access states`；更新 finding status及證據路徑。

### T19：真實量測與入口 bundle 優化

**Findings：** CO-23、CO-24  
**Depends on：** T02、T03、T12；各主要UI PR完成

**Files：** 修改 `scripts/clientops/{measure-route-performance,check-route-bundles}.ts`、`src/components/auth/login-auth-form.tsx`、入口shared imports；新增 `scripts/clientops/measure-runtime.ts`、`src/server/db/query-metrics.server.ts`；使用現有build manifest。

**Interfaces／產出：** RuntimeMeasurement={sha,environment,dataset,route,role,cacheState,samples,p50Ms,p95Ms,dbCount,dbDurationMs,payloadBytes,initialJsGzipBytes}；metrics區分contract/synthetic/runtime，不固定hasNPlusOne=false。

- [ ] **1. 行為測試／基線：** 新增 `scripts/clientops/__tests__/runtime-measurement.test.ts`：query instrumentation含auth及failed queries，concurrentrequests不混計；manifest入口包含transitive shared chunks；synthetic輸出不能通過runtime gate。真browser/DB結果作artifact，不用mock timings。
- [ ] **2. 確認 Red：** 對新增正確行為測試先在未修程式跑一次；保存失敗原因。T00/T22 為文件／驗證任務，以實際查核結果取代人造 failing test。
- [ ] **3. 最小實作：** 先量後拆auth UI／charts/shared imports；保留SSR/route loader/hydration。不可單純改chunk名藏budget。查bundle graph再刪unused or lazyload，避免無差別manualChunks造成依賴循環。
- [ ] **4. 接入及相容：** 隔離seed 10k tasks/100k approvals，至少30 warm samples＋10 cold導航，固定region/device/throttle記錄；記DB全request queries及p95/payload。新目標：page50 payload≤150KiB、SQL及payload不隨總rows線性膨脹、warmlist p95≤800ms、login initialJS gzip≤300KiB且較重新量到baseline減≥20%；未達就標未過，不能改公式。
- [ ] **5. 驗證：** `bunx vite build`、`bun run performance:bundles`、`bun scripts/clientops/measure-runtime.ts --mode=verify` → 真量測artifact。LCP≤2.5s/INP≤200ms只作受控lab目標，不宣稱field CWV合格。
- [ ] **6. 提交：** 只 stage 本 task 檔案，`git diff --check`，commit `perf: measure real routes and reduce initial bundles`；更新 finding status及證據路徑。

### T20：逐域消除 legacy 雙來源

**Findings：** CO-25  
**Depends on：** T02、T03、T12

**Files：** 修改 `src/server/repositories/{automation-playbooks,customer-success,deals,engagement-events,projects}.ts`、`src/server/auth/resource-ownership.ts`；新增 `scripts/clientops/reconcile-legacy-domains.ts` 及逐域Neon migrations；不新增Supabase import。

**Interfaces／產出：** 保持repository public接口；domain adapter各有neon/legacy讀取切換（server-only allowlist setting）；reconcile結果含table/count/ID mapping/normalized hash/FK/owner/override checks。

- [ ] **1. 行為測試／基線：** 新增 `src/server/db/__tests__/legacy-domain-parity.integration.test.ts`：workspace tasks與mainTasks同ID/owner/status；ID/ownership/scope/permission override保留；legacy unavailable時明確error不冒充empty；未切換域仍可用。
- [ ] **2. 確認 Red：** 對新增正確行為測試先在未修程式跑一次；保存失敗原因。T00/T22 為文件／驗證任務，以實際查核結果取代人造 failing test。
- [ ] **3. 最小實作：** 先由routes/serverFns列reachable callers，優先修customer-success/project task讀寫一致；目前無route的module也保留契約，不藉機創建新project UI。逐域inventory→backfill rehearsal→parity→切read/write→觀察。
- [ ] **4. 接入及相容：** 資料copy可重跑且保留ID；cutover需凍結該域writes或可靠捕捉增量，不能依賴silent dual-write。新store已接writes後rollback先reconcile反向delta或暫停writes，不能直接flip丟資料。Supabase auth/RLS失敗不能改用service key繞過。
- [ ] **5. 驗證：** `bunx vitest run src/server/db/__tests__/legacy-domain-parity.integration.test.ts` → PASS；每域counts/hash/抽樣一致才啟用；未獲legacy資料則交付adapter及blocked對帳，CO-25仍open。
- [ ] **6. 提交：** 只 stage 本 task 檔案，`git diff --check`，commit `refactor: consolidate clientops data sources by domain`；更新 finding status及證據路徑。

### T21：AI invocation、timeout 及可用 telemetry

**Findings：** CO-28  
**Depends on：** T05、T11

**Files：** 修改 `src/server-functions/ai-note-tidy.ts`、`src/lib/n8n.ts`、`src/lib/agents.ts`、agent run/writeback repositories、`n8n/workflows/` templates；新增 `src/server/workflows/ai-invocation.server.ts`。

**Interfaces／產出：** `invokeGovernedAI(ctx,{workflowType,subjectType,subjectId,input,idempotencyKey})` 回runId/outcome；沿用現有policy/version決定，note-tidy登記自己的workflow contract；usage={inputTokens?,outputTokens?,totalTokens?,cost?,currency?,source?} unknown維持null。

- [ ] **1. 行為測試／基線：** 新增 `src/server/workflows/__tests__/ai-invocation.test.ts`：policydeny無providercall；input>20k chars拒絕；timeout明確failed；no usage不顯0成本；duplicate callback只套一次；舊runlatecallback不改newrun。再加realDB run state測試。
- [ ] **2. 確認 Red：** 對新增正確行為測試先在未修程式跑一次；保存失敗原因。T00/T22 為文件／驗證任務，以實際查核結果取代人造 failing test。
- [ ] **3. 最小實作：** n8n trigger application deadline15s，directLLM60s（須小於deployment timeout留10s餘量，否則調低）；在未知外部執行情況標ambiguous、不自動重試非idempotent動作。Provider secrets/完整客戶prompt不進普通logs。
- [ ] **4. 接入及相容：** 已部署n8n合同先確認後改templates，usage來源需provider實際回傳；缺資料顯「未記錄」。保留policy版本及rollback，不重建policy。外部workflow未部署則標integration blocked，不能說已收到tokens。
- [ ] **5. 驗證：** `bunx vitest run src/server/workflows/__tests__/ai-invocation.test.ts` → PASS；sandbox provider受控驗timeout／usage／callback；禁止production message或未授權付費呼叫。
- [ ] **6. 提交：** 只 stage 本 task 檔案，`git diff --check`，commit `fix: govern ai calls and record reliable execution outcomes`；更新 finding status及證據路徑。

### T22：文件、CI、角色驗收及 release candidate

**Findings：** CO-27；全部完成gate  
**Depends on：** T00–T21的適用驗收完成

**Files：** 修改 `.github/workflows/{checks,database-contract}.yml`、README、CLAUDE、backend-dependencies相關doc；新增 `docs/audit-fixes/2026-09-27/{release-checklist,operations-runbook,uat-results}.md`；runtime build metadata只公開commit SHA。

**Interfaces／產出：** Feature status表每列route/server/migration/test/preview evidence；CI加push main（merge_group僅啟用merge queue時）及目前PR gate；release candidate包含SHA、migrations、reconciliation、rollforward/rollback。

- [ ] **1. 行為測試／基線：** CI檢查main triggers有效、DB integration無預期外skip；UAT矩陣第7節逐項有role/data/expected/actual/evidence。無authenticated sessions則明確blocked，不填pass。
- [ ] **2. 確認 Red：** 對新增正確行為測試先在未修程式跑一次；保存失敗原因。T00/T22 為文件／驗證任務，以實際查核結果取代人造 failing test。
- [ ] **3. 最小實作：** 執行第6節全部release gates，preview顯示runtimeSHA與candidate一致；README修正已實作功能／migration範圍／日期規則。記錄新bulk caps、importresume、stuckrun、legacyreconcile支援流程。
- [ ] **4. 接入及相容：** 保留歷史audit原文、status表指向修復PR及測試。建立draft PR或reviewable branch依當時授權；完整結果後才處理production release授權。不在此計劃交付階段執行以上產品改動。
- [ ] **5. 驗證：** 所有P1有行為＋realDB＋必要UI evidence；CO01–CO30無漏列；未完成external gates有owner/原因/解除方式；git diff --check乾淨，release文件可重現。
- [ ] **6. 提交：** 只 stage 本 task 檔案，`git diff --check`，commit `docs: verify and document clientops audit remediation`；更新 finding status及證據路徑。

## 5. CO-01–CO-30 完整追蹤表

| Finding | 主責 task | 關鍵驗收 |
|---|---|---|
| CO-01 Search旁路 | T03 | 無權實體不回result、不參與match/count |
| CO-02 Dashboard旁路／角色首頁 | T03 | 每section和row授權，accounting有可用入口 |
| CO-03 Approvals／Job Sheets列表 | T03、T12 | detail/list/count/export同一policy，list最小DTO |
| CO-04 匯入權限 | T04 | 每列每種create/update均授權，forbidden不部分寫 |
| CO-05 Quote商業immutability | T06 | issued/accepted版本及PDF不受revision更改 |
| CO-06 審批終態 | T05 | 併發一個有效決定，retry不重寫timestamp/audit |
| CO-07 跨表原子性 | T07 | 每步故障rollback、單一open approval、一次accept一張sheet |
| CO-08 Manager approve／issue | T07 | manager可批准，無issue不能發出，combined完整授權 |
| CO-09 Xero狀態 | T08 | notes不入單、clear不解鎖、明確更正 |
| CO-10 金額／期間 | T09 | 幣種分組，接受日固定，commercial小數保留 |
| CO-11 Risk套用 | T10 | approval/engagement/run/audit共同提交 |
| CO-12 無主／stuck recovery | T11 | scope claim、supersede、晚到callback防護 |
| CO-13 假發送成功文案 | T11 | manual handoff明確，無delivery不宣稱已發送 |
| CO-14 Task owner UUID | T12 | 真姓名、獨立可搜picker、filter不縮窄 |
| CO-15 未分頁／全history polling | T12、T19 | server分頁、可見pending才poll、真大資料量量測 |
| CO-16 bulk部分成功 | T13、T17 | persistent逐筆結果、只續未完成、失敗selection保留 |
| CO-17 多行CSV | T14 | 合法一列multiline仍一列，malformed可定位 |
| CO-18 import規模／重入 | T15 | 每列transaction、每列結果、可信identity去重、斷線續做 |
| CO-19 Job Sheet維護 | T16 | handoff header、search、owner/日期bulk可用且受鎖 |
| CO-20 Admin首100人 | T12、T17 | 第101/250人可選、active eligibility、selected hydration |
| CO-21 signup/invitation | T18 | identity與workspace access分開、無假button或login loop |
| CO-22 重複auth | T02 | 單request共用，跨request不cache權限 |
| CO-23 bundle過大 | T19 | 真入口shared transfer縮減，不只改chunk名 |
| CO-24 synthetic當runtime | T19 | 指標分類、真request/query/p95 artifacts |
| CO-25 Neon／legacy | T20 | 每域caller inventory、ID/owner/tasks對帳、受控cutover |
| CO-26 UTC顯示偏差 | T09 | HK datetime一致、date-only不轉時區 |
| CO-27 docs/CI落後 | T22 | main SHA gate、feature證據表、preview runtime SHA |
| CO-28 AI旁路/telemetry | T21 | note-tidy同治理、timeout、usage真值或unknown |
| CO-29 CSV公式 | T14 | text中和公式開頭、numeric保持數值 |
| CO-30 runtime casts | T01 | 無效資料SQL前拒絕，Zod＋business transitions |

## 6. 資料遷移、測試及 release gate

### 6.1 Migration 的實際執行方式

本輪 baseline migrations 為 001–009。新增 migration 依當時 main 的下一號命名，不把範例 suffix 當現成檔案。先檢查 `scripts/clientops/apply-client-relationship-schema.ts`／verify script 是列舉還是自動發現，按現有方式登記每個新檔；schema contract tests 同步。

1. **Expand**：nullable新reference／metadata、row_version default、receipt/session tables、索引；旧程式仍可讀。為所有 writers 補 version increment，必要 DB trigger 統一遞增，避免有些 writes忘記increment；不要trigger與app兩邊各加一次。
2. **Inventory**：read-only報告 duplicate open approval、missing issued version、contradictory accepted snapshot、notes-only Xero entry、無accepted_at、ambiguous import keys。報告不含多餘客戶敏感原文。
3. **Reconcile**：可從既有證據推導者，使用可重跑腳本＋audit；無法推導者留待核對。不能把「未能確認」轉為假資料来通過 NOT NULL/unique。
4. **Constrain**：先check再validate；partial unique對quote_send非空quote id及open statuses；合法legacy例外隔離，不使migration隨機失敗。金額／version constraints與既有狀態一致。
5. **Cut over**：新版commands／UI一致後開啟新操作；不允許舊不安全endpoint继续旁路新service。
6. **Contract**：至少經一輪穩定驗收後才移除舊欄位／adapter。不可在同一PR刪legacy schema/資料。

前台新UI未開也必須修server漏洞；feature flag不能用於「暫時恢復不安全寫入」。Quote歷史與financial truth有疑點時，disable affected command比假造snapshot更合適。

Receipt鎖定次序：先驗actor及目前最低讀/寫權限→lookup同key/hash→若存在仍驗資源授權並返回可見結果→否則取得唯一receipt slot及resource lock→expectedVersion/state→business write＋receipt commit。不能在retry先拒絕舊expectedVersion，否則正確idempotent retry也會失敗。兩個同key請求用unique constraint/lock等待同一結果；不將未提交的receipt當成功。

### 6.2 本地／隔離 CI 命令

先確認 `DATABASE_URL`、`DATABASE_TEST_URL` 指向**可丟棄且與production不同**的DB；不要在terminal輸出完整connection string。測試建立schema的方法依目前integration harness，勿在未知DB執行truncate/drop。

```bash
bun install --frozen-lockfile
bun run test
bun run lint
bunx tsc --noEmit
bunx vite build
bun run performance:bundles
git diff --check
```

這組是可重跑基本 gate；**不等同**已驗證 migrations。其後用隔離環境執行 repo 完整要求：

```bash
bun run clientops:migrate-schema
bun run clientops:verify-schema
bun run test
bun run build
```

完整 build含migration/seed。隔離測試可按現有fixture需設定seed；production `CLIENTOPS_SEED_*`永不啟用。每條命令記錄exit code、SHA、env label、日期；不記秘密。T19新增runtime runner後另跑真實performance gate，舊`performance:routes:verify`只保留contract/synthetic含义。

必須執行的新增真實 DB tests：approval-command、quote-immutability、quote-lifecycle-atomic、xero-state、risk-review-atomic、approval-recovery、bulk-resume、import-resume、authorization parity；DB gate沒資源就blocked，不能默默skip後merge成完成。

Real concurrency fixture用兩個獨立PG connections及同步barrier，至少覆蓋「同key相同payload」「不同key相反決定」「同quote重複request」「accept重送」「同import identity」「late callback」。故障注入點在transaction內部write之後；驗證所有表的終態及rows數，不只catch error。

### 6.3 前端／操作 gate

- 390px、768px、1440px；200% zoom；Tab／Shift+Tab／Enter／Escape；modal focus trap及返回focus。
- List可水平捲必要欄位，mobile不令bulk bar遮住下一步；長名字／長公司名／中文／空值有合理顯示。
- Toolbar明示scope/count；預覽before/after和不可操作原因；loading／empty／permission denied／network failure不同狀態。
- Mutation成功或部分成功後refresh對應query，不清失敗selection；切回頁面可查operation並resume。
- 用畫面與network response共同驗權限；沒有某action時，不只按鈕disable，直接serverFn亦拒絕。
- 不為了「漂亮」移除owner、deadline、版本、審批者、阻塞原因或財務小數。保留scanner-first工作列表。

### 6.4 Release candidate 與 rollback

每個PR交付：finding IDs、行為before/after、修改檔案、migration、跑過與未跑tests、preview screenshots、runtimeSHA、已知限制。設定branch protection／required checks若需repo admin介入，先提供具體check names及PR結果，不假裝已配置。

Production release之前應有備份/PITR及migration rehearsal證據；如果執行環境沒有管理DB備份的權限，明列由operator完成的gate。接受/發送等不可逆動作只在合成資料做smoke。

Rollback優先：停用有問題的新bulk/import入口→保留receipt/state→修復後roll forward。原子性／權限漏洞不能回退到舊不安全handler。Additive schema不急於down migration；禁止刪receipt、approval history、accepted snapshots。Legacy cutover已有新寫入時，先停寫及對帳再選反向同步，不能只切回舊DB。

Release後在授權範圍內檢查：403/409變化是否符合預期、queue積壓、stuck runs、bulk/import失敗比例、慢query、真實bundle/載入、通知重複。記錄觀察窗口與查詢來源，不自行建立定時automation或寄訊息給同事。

## 7. 角色 UAT 腳本（供 Sol 執行及記錄）

| Case | 操作及角色 | 必須看到的結果 |
|---|---|---|
| U01 入職 | anonymous → invited identity → active；另試no_profile/suspended | 邀請／workspace狀態清楚；無權身份不能讀CRM |
| U02 Sales日常 | 找Lead→跟進task→draft quote→request approval | 真owner姓名、下一步清楚、quote status一致 |
| U03 Manager批准 | scoped manager review→approve；試issue | 批准成功；無issue權有明確待發出交接，不能偷發出 |
| U04 Issuer／Accounting | issuer發A→另建B→accounting接受A | sheet只用A、固定accepted_at、B不影響歷史 |
| U05 併發決定 | reviewer A approve／B reject同時送 | 一success一conflict、無假兩個成功、refresh顯最終決定 |
| U06 跨入口deny | accounting及explicit task/approval/job deny | search/home/list/detail/report/export一致，network不送敏感欄 |
| U07 Accounting每日 | 搜公司／quote→補PO或reason→assign→分期→note→confirm | 缺件可理解、note不入單、accepted商業欄鎖定 |
| U08 Bulk100筆 | 混合success/forbidden/stale/missing→中斷→resume | 成功不重寫，失敗保留，stale新preview後才重試 |
| U09 CSV5000筆 | BOM/中文/multiline/duplicates/非法owner→preview→commit→resume | 每列有結果、總數對齊、不靜默丟invalid、不誤merge同名公司 |
| U10 Admin250人 | 找第250人→teams multi-add→離職接手 | 可選、partial refresh、audit身份保留、scope不可越權 |
| U11 AI支援 | unassigned→claim；escalated→review；timeout→恢復；late callback | 受控retry、無重複執行、舊callback不改新run、cost未知不造0 |
| U12 人手發送 | approve message draft→copy→記錄sent reference | 明確待人手；記錄不等於delivery receipt；沒有真外部發送 |
| U13 Client Success | signal→risk review→apply；注入更新錯誤 | 全成功或全不變，不出現批准但未套用 |
| U14 日期／報表 | HK跨月午夜、HKD/USD及100.25金額 | HK時間一致、兩幣種分開、更新不改歷史期間、小數保留 |
| U15 手機／鍵盤 | 390px與200% zoom走U02/U07/U08 | focus可見、dialog不困住、bulk bar不遮內容、錯誤可讀 |

至少覆蓋7角色（super_admin/admin/manager/sales/client_success/accounting/read_only）及explicit allow/deny/expired override。不得用super_admin一個帳號宣稱全角色驗收。沒有role sessions則記錄未驗證範圍，先完成可執行的隔離測試。

## 8. 不需阻塞整個工程的業務／環境問題

| 未確定事項 | 本計劃採用的預設 | 何時需要業務／operator提供資料 |
|---|---|---|
| 是否自動發客戶訊息 | 維持人手發送，真實handoff文案 | 啟用自動channel時才確認recipient/consent/provider/delivery |
| 是否換算HKD | 各currency分開 | 需要統一報表時再提供FX source/date/rules |
| 缺舊issued／acceptance證據 | legacy-unverified，不自動重造 | 該record接受／修復需歷史證據 |
| 無主approval屬哪team | 可證明subject scope才claim；否則admin處理 | 需要擴大routing規則才調整policy |
| 離職歷史assigned_to語義 | 保留已完成歷史，事件actor不改 | Owner決定某closed-work欄是否仍屬current responsibility |
| Legacy DB存取／對帳 | 可寫adapter/tests，不切換未知資料 | 每域cutover前提供隔離snapshot/授權連線 |
| Production/preview帳戶與DB | 先unit/隔離工作、保留external gate | 最終角色smoke、real DB、發版前 |
| 運行成本數據缺失 | 顯示未記錄，不算零 | Provider/n8n實際usage schema及部署對接 |

## 9. Sol 最終交付格式與停止條件

每個task完成後更新 `docs/audit-fixes/2026-09-27/status.md`：CO ID、task、baseline狀態、commit/PR、unit/DB/UI證據、remaining blocker。報告「已實作」與「已驗證」分開。

最終交付必須包含：

1. PR／branch＋exact SHA；本次修好哪些CO，哪些已由新main解決，哪些仍blocked。
2. Schema及資料修復清單；沒有自動修改的legacy anomalies數量及處理路徑。
3. 7角色權限矩陣、交易／並發／重試結果、bulk/import操作demo。
4. 真實performance baseline/after（同環境及data），不可用公式值替代。
5. 按角色日常工作及Admin支援runbook；不熟工程的同事可完成恢復／續做。
6. Release／rollback清單；未部署時明說未部署。

P1的auth／financial state／atomicity tests失敗時停止擴大bulk功能，先修回一致狀態；不是停止所有可做的文件或不相關測試。遇到外部access不足，只block真正依賴該資源的task，其餘繼續。不得降低assertions、刪security gates、虛構live screenshots或將skipped寫成passed。

## 10. 本計劃的驗證與輸入來源

本文件根據三份使用者指定審核檔案及固定audit SHA的程式落點編寫；未在本輪再宣稱完整審核最新main或重新登入live。ZIP內MD/HTML與獨立檔案byte-for-byte一致。23 tasks覆蓋30 findings；新interfaces／caps／migration suffix明確屬實作提案。

| 輸入 | SHA-256 |
|---|---|
| ClientOps_Audit_2026-09-27_zhHK.md | `5b7c8a4873873ed5bbfefc9cbc4d300f72e7050b09b7812dc32ef0d047df70eb` |
| ClientOps_Audit_2026-09-27_zhHK.html | `1ebd10fc359ee042de7f450b286d23d6c97f1b354871e08788164bc28a04ae7e` |
| ClientOps_Audit_Evidence_2026-09-27.zip | `71f14519b06b73f1e3bb1d104eb93374fe4ff0b5a5760e5b4031f31e210ed757` |

建議在執行repo保存本master plan到 `docs/superpowers/plans/2026-09-27-clientops-audit-fixes.md`，references放相鄰子目錄並保持相對路徑可讀。本次僅提供獨立執行包，未寫入產品repo。
