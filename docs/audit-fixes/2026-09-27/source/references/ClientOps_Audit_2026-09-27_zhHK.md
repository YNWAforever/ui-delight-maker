# Fimmick ClientOps：程式碼、工作流程與後台審核

**Repository：YNWAforever/ui-delight-maker · 審核日期：2026-09-27（香港）**  
**固定版本：`2904faa502f7494173f48f412875c1d0a3aba674`（main，PR #81 merge）**

## 1. 管理層結論

ClientOps 已有相當完整的 CRM、報價、Job Sheet、團隊管理及 AI 治理基礎，並非純展示原型。最近的修訂亦確實改善了逐筆資料遮蔽、Lead 匯入、審批指派、Agent policy、報價搜尋及新報表。

**但目前最需要解決的是跨頁權限一致性、審批／報價狀態完整性，以及同事每日工作的操作閉環。單靠再美化 dashboard，不能解決這些問題。**

本輪整理 **30 項 findings：11 項 P1、19 項 P2**。這是下列問題登記的數目，不是掃描器評分。P1 表示會影響資料存取、商業資料正確性或關鍵工作流程，應優先修復；P2 表示操作、規模、效能或維護風險。未發現足以在本次證據下定為 P0 的問題，亦不能據此聲稱沒有其他漏洞。

最先處理：

1. **全域搜尋與首頁可能重新暴露已在其他頁面遮蔽的資料。**
2. **已批准／發出／接受的報價仍可由通用更新路徑改商業內容。**
3. **審批缺乏終態保護，部分跨表操作沒有共用交易。**
4. **經理可以批准報價，但審批頁的按鈕把批准與出單合併，要求經理沒有的權限。**
5. **收入報表混合幣種，並用最後修改日期歸期。**
6. **Job Sheet、批量維護及任務分派仍缺少完整、易用的操作流程。**

## 2. 證據及限制

### 已完成的檢查

| 項目 | 本次結果 |
|---|---|
| GitHub | 讀取 repository、最新 commits／PR 資料、CI 及 Vercel commit status；clone main，SHA 與 connector 一致 |
| 正式網址 | 從程式碼找到並實際開啟 `https://ui-delight-maker.vercel.app`，轉到 `/login`，標題為 Fimmick ClientOps |
| 公開 UI | 實際檢視登入及註冊頁，保存截圖；註冊頁提示使用 `@fimmick.com` |
| 程式碼 | 追蹤 routes → server functions → repositories／read models → migrations，涵蓋商業流程、Admin、AI、匯入及批量操作 |
| 現有測試 | **254 個 test files 通過、13 個跳過；1,804 個 tests 通過、116 個跳過；0 failed** |
| TypeScript | `tsc --noEmit` exit 0 |
| ESLint | exit 0；0 errors，1 個 Fast Refresh warning |
| 純建置 | `vite build` client + SSR 成功；兩個主要 client chunks 超過 500 KB |
| 針對性驗證 | 8 個 characterization probes 通過，代表下述不理想行為獲重現／確認，**不是修復完成** |
| Git 工作樹 | 審核後乾淨；未修改產品程式、未提交／merge／部署 |

### 不能當成已驗證的部分

- **未登入正式後台。** 沒有本次可用的已登入 session，因此後台操作、手機實際布局、真實資料量、不同角色互動仍待實測。程式碼 findings 不冒充正式站操作結果。
- 116 個跳過的測試沒有在本機執行；沒有 `DATABASE_TEST_URL`，不能聲稱本次完成 real-Postgres integration tests。GitHub 最後 PR head `25a9e386…` 的 Checks／Database contract 為 success，這是遠端既有 CI 證據，不是本次重跑。
- main SHA 的 Vercel commit status 為 success；**未取得正式站 runtime 的 build SHA**，不能證明目前每個頁面必定運行同一 SHA。
- 刻意只跑純 Vite build。`bun run build` 會先執行 migration、verify schema，再 seed-on-deploy；本輪沒有連 production DB 執行它。
- 未測試 production 寄信、n8n 呼叫、客戶訊息發送、Xero 或正式資料寫入；沒有改權限、邀請使用者或建立測試帳號。
- 本輪沒有量度登入後的 LCP、INP、p95 API 延遲、DB query plans 或實際同時使用人數。

證據標籤：**C**＝當前程式碼；**T**＝本次本機測試／probe；**L**＝正式網站可見 UI；**R**＝仍須在隔離資料庫／已登入環境驗證的運行風險。

## 3. 現時功能狀態：避免重做已完成工作

| 範圍 | 現時實作 | 剩餘重點 |
|---|---|---|
| Leads | 列表／詳細頁、建立／修改、bulk writes、CSV validate + commit、AI qualification／reply／quote | 搜尋與匯入權限、匯入可靠性、批量規模 |
| Quotes | 草稿、模板、line items、審批要求、版本、issue、accept、Job Sheet | 商業欄位鎖定、狀態交易、角色一致性 |
| Approvals | 單筆／批量決定、reviewer 指派、notes、optimistic rollback | 按角色／逐筆 action eligibility、終態／併發保護、失敗重試 |
| Job Sheets | 從接受報價建立、billing portions、會計接受及鎖定、手動 Xero reference | PO／負責人編輯、search、bulk、真正 invoice 狀態 |
| Clients／Accounts／Relationships | 公司／客戶 workspace、contacts、engagements、signals、touchpoints | 閉環交付、避免跨資料庫資料分裂 |
| Tasks | board／list、移動狀態、查詢、owner／priority filter、逐筆內容遮蔽 | owner 真實姓名、分頁、批量分派／日期 |
| Admin | People／Teams／Access／Audit、邀請、角色、停用及 ownership reassignment | 大量使用者搜尋、部分成功回饋、實際權限顯示 |
| AI Ops | policy versions／history／rollback、dispatch policy、run history、內容遮蔽 | 卡住 run 回復、審批後執行、tokens／成本／quality 證據 |
| Reports | revenue、pipeline、conversion、agents、tasks、人手審批工作量、renewal／expansion | 金額及日期口徑、資料存取、營運意義 |

舊文件 `backend-dependencies.md` 的 BD-5（Lead CSV）、BD-6（指派）、BD-9（報價搜尋／aggregate）、BD-10（審批 request）、BD-11（accounting 看 lead-linked quote）、BD-12（shell capabilities）已全部或部分落地，不應原封不動再當 backlog。尤其 BD-11 的 lead identity 現有降級遮蔽，不能再報「所有 lead-linked 報價 accounting 都打不開」。參考 [src/server-functions/quote-workspace.ts:104](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/server-functions/quote-workspace.ts#L104)、[src/server/app-shell/loaders.ts:5](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/server/app-shell/loaders.ts#L5)。

## 4. 日常工作及支援流程

| 同事／階段 | 已有路徑 | 現時摩擦或風險 | 建議完成條件 |
|---|---|---|---|
| 新同事入職 | Admin 邀請 → activation → profile／team → 登入 | 公開 Sign Up 的說法與 invitation-only workspace 不一致；未啟用 workspace 缺清晰下一步 | 清楚分辨「身份帳戶已建立」與「已獲 workspace access」，提供找管理員／重發邀請路徑 |
| Sales 每日處理 | 首頁 → Lead → AI draft／task → quote | 跨頁遮蔽不一致；Task owner 顯示 ID；首頁對 accounting 不適合 | 按角色顯示今日事項、到期／待接手／待審批，跨頁使用相同授權 |
| Manager 審批 | Approvals → review／edit → approve | Manager 沒有 issue 權限；unassigned approval 又可能無法自行認領 | 分開批准及出單；由 server 回傳每筆 allowed actions；加合規的 claim／routing |
| Sales → Accounting | Issue → 客戶接受 → Job Sheet → billing portions | quote 多步操作非原子；PO／accounting owner 無完整編輯入口 | 原子交接及狀態時間線；明確 owner、PO／例外理由、billing schedule |
| Accounting 每日工作 | Job Sheets → accept → 手動 Xero reference | 缺 company／quote number 搜尋、bulk；notes 也被視作 entered in Xero | 以「待補資料／待接受／待輸入／已核對」分隊列，bulk 有預覽和逐筆結果 |
| Client Success | Client／relationship → touchpoint → renewal risk → review | 部分舊模組仍依賴 Supabase；risk 決定與實際套用分開提交 | 一個客戶資料來源；審批／套用一起完成，失敗可恢復 |
| Admin 支援 | People／Teams／Access／Audit | 首 100 名限制、bulk member 部分失敗不刷新、有效權限難定位 | 搜尋型 picker、逐筆 result、理由、scope-aware access preview |
| AI／技術支援 | AI Ops → failed／stuck run → record | 有 stuck 計數，但未找到受控 expire／cancel／retry 操作閉環 | run timeout、重試規則、outbox／delivery 狀態、操作審計與診斷 ID |

## 5. P1 問題：先修權限與商業資料完整性

### CO-01 全域搜尋繞過各類資料及逐筆遮蔽（C、T）

**證據：** [src/server-functions/search.ts:6](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/server-functions/search.ts#L6) 只要求 accounts／contacts／leads／quotes 其中一種 view；[src/server/repositories/workspace-search.ts:17](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/server/repositories/workspace-search.ts#L17) 卻 UNION 所有這些資料及 tasks，沒有把 actor／逐筆決定傳入。Accounting baseline 沒有 `leads.view`，仍可經搜尋取得 Lead result。Task 詳細內容已在 tasks 頁遮蔽，但 search 仍搜尋 title／description 並返回 title。

**影響：** 使用者在專用頁被拒絕，仍可從搜尋獲公司、聯絡人、任務名稱及存在性資訊。Probe 已驗證 handler 會原樣返回 Lead result；資料庫為 mock，未在 production 探查敏感資料。

**修復／驗收：** 按 entity capability 及 row scope 過濾，搜尋匹配本身也必須在允許資料內；accounting、resource deny、manager scope 測試涵蓋 search 與列表。不得只在畫面藏結果。

### CO-02 首頁 read model 是另一條未按內容授權的路徑（C）

**證據：** [src/server-functions/dashboard.ts:10](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/server-functions/dashboard.ts#L10) 只檢查 `leads.view`；[src/server/read-models/dashboard.ts:38](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/server/read-models/dashboard.ts#L38) 直接讀取 tasks title、approvals summary、agent output summary、quote value 等，未套用新 row authorizer。

**影響：** 對 task／agent subject 的 deny 不會自動在首頁生效；accounting baseline 反而不能使用這個首頁 read，雖然有 job sheet／quote 工作要做。

**修復／驗收：** 依角色及各 section capability 組裝首頁；無權 section 不查內容，逐筆 denial 同樣有效；accounting 登入應有可用 landing page。

### CO-03 Approvals／Job Sheets 的列表未套用逐筆 deny（C）

**證據：** [src/server-functions/approvals.ts:13](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/server-functions/approvals.ts#L13) + [src/server/repositories/approvals.ts:6](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/server/repositories/approvals.ts#L6) 返回整批 `human_approvals.*`，包括 context_data。[src/server-functions/job-sheets.ts:22](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/server-functions/job-sheets.ts#L22) 的 paginated list 也只有 surface gate；detail 則有 resource check。較新的 AI Review 頁已用 per-row authorizer，兩者不一致。

**影響：** 明確限制某 approval／job sheet 的 override，可在 detail 阻擋但列表仍送出資料。不是說所有 role 必須只看自己，而是現有 explicit deny 的語義不能因頁面改變。

**修復／驗收：** 定義 queue 允許保留哪些 metadata，其餘在 server 遮蔽；filter、count、export 同步遵守，加入 cross-surface tests。

### CO-04 CSV 匯入只有 create 權限，卻會修改既有資料（C）

**證據：** [src/server-functions/lead-import.ts:26](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/server-functions/lead-import.ts#L26) 只要求 `leads.create`，repository 會填寫匹配 Lead 的空欄位。[src/server-functions/client-import.ts:30](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/server-functions/client-import.ts#L30) 只要求 `accounts.create`，[src/server/repositories/client-import.ts:42](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/server/repositories/client-import.ts#L42) 會更新既有 Client industry／tier，建立 contacts／engagements，沒有逐筆 update／相關 create 授權。

**影響：** 有 create 但被 deny update 某 record 的使用者，可能透過匯入走到正常編輯不允許的 write。

**修復／驗收：** preview 分 create／update／skip／forbidden；commit 重新授權每筆及每種附帶 write，server 回逐筆結果；測試 explicit deny 及 manager 範圍。

### CO-05 已批准／發出／接受的報價仍可修改商業內容（C、T）

**證據：** [src/server/repositories/quotes.ts:333](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/server/repositories/quotes.ts#L333) 阻止直接寫 lifecycle fields，但通用 `updateQuote` 沒有 quote status guard，仍可更新 total、currency、line_items 等。Probe 確認 repository 生成的 UPDATE 沒有狀態條件。

**影響：** approved／issued version snapshot、目前 quote、accepted version、Job Sheet total 可能變成不同版本的商業條款；接受流程又從目前 quote 建 snapshot，而非強制接受已發出的 immutable version。

**修復／驗收：** 已發出版本固定；接受指定 issued version；修改走新 revision／change order 及再審批。Server 與 DB 層保護 immutable 商業欄位，測試 UI 以外的直接呼叫。

### CO-06 已決定的審批可被另一個決定覆寫（C、T）

**證據：** [src/server/repositories/approvals.ts:118](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/server/repositories/approvals.ts#L118) 的 UPDATE 只有 `where id=$1`，沒有 pending／escalated 條件；notes、decided_at 也被重寫。Probe 先 approve 再 reject，repository 未拒絕。

**影響：** 兩位 reviewer、重試或舊分頁可改變終態，與 UI「不可 undo」說法不一致。Audit log 有紀錄，仍不代表狀態有效。

**修復／驗收：** 鎖定 row、驗證 transition、版本／expected status compare-and-set；重送同決定 idempotent、相反決定回 conflict；真實 Postgres 併發測試。

### CO-07 Quote 審批／出單／接受的跨表操作非原子，request 有競態（C、R）

**證據：** [src/server-functions/quotes.ts:523](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/server-functions/quotes.ts#L523) 先 approve，再 issue version，最後 decide approval；[src/server-functions/quotes.ts:549](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/server-functions/quotes.ts#L549) 先寫 accepted quote，再建立 Job Sheet，未共用一個外層 transaction。[src/server-functions/quotes.ts:212](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/server-functions/quotes.ts#L212) 在 transaction 外先查 existing pending approval，schema 未見每 quote 單一 pending approval 的 unique 約束。

**影響：** 中途失敗可留下「報價已接受但尚無 Job Sheet」或「已 issue 但 approval 仍 pending」；同時 request 可能產生重複待批。現有 Job Sheet unique key 對重試有幫助，但不能令整個流程原子化。

**修復／驗收：** 每個 business command 使用單一交易、quote row lock、持久 idempotency key／唯一約束；在每一步注入故障及雙請求，驗證只產生一組一致狀態。現有 quote-version CTE lock 仍應另作 real-DB concurrent test，不能只靠 SQL 字串檢查認定已解競態。

### CO-08 審批／出單權限不一致，Manager 流程會卡住（C、T）

**證據：** [src/lib/admin/policy.ts:32](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/lib/admin/policy.ts#L32) 的 manager 有 `quotes.approve`、`approvals.decide`，沒有 `quotes.issue`。[src/routes/approvals.tsx:460](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/routes/approvals.tsx#L460) 對 quote_send 的 Approve 一律呼叫 approveAndIssueQuote，而 handler 只檢查 `quotes.issue`。反過來，這個合併 handler 沒有另外檢查 `quotes.approve`／`approvals.decide`，對自訂 permission overrides 也有落差。

**影響：** 經理被指派後仍不能完成 UI 的批准；只獲 issuance 特例的人，合併 command 卻可走內部 approve。Approvals 按鈕只以 busy 控制，未使用有效 capability 判斷可操作性。

**修復／驗收：** 明確分離「批准」與「出單」，或為 combined command 同時檢查所需能力和兩個 resource；每笔 server 回傳 allowed actions，不以 role 名猜測。

### CO-09 Xero notes 被當成已入單；清空欄位可把狀態退回 planned（C、T）

**證據：** [src/server/repositories/job-sheets.ts:468](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/server/repositories/job-sheets.ts#L468) 任一 invoice number／reference／date／**notes** 非空即設為 `entered_in_xero`；全部清空則退回 planned（cancelled 例外）。Probe 確認只填「Need invoice later」也符合該 SQL 分支。

**影響：** 工作隊列把未開 invoice 看作完成；若 Job Sheet 尚未 accepted，清除 Xero 資料亦會移除 portions 對 entered_in_xero 的商業欄位保護條件。

**修復／驗收：** invoice linkage 與備註分離；有有效 invoice identifier 並經明確確認才入已輸入狀態；更正／解除必須有專用 action、理由、audit，不由空欄位隱式觸發。

### CO-10 收入／pipeline 金額混幣種，歷史期間會隨修改漂移（C）

**證據：** [src/server/read-models/operations.ts:104](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/server/read-models/operations.ts#L104)、[src/server/read-models/operations.ts:172](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/server/read-models/operations.ts#L172) 用 `sum(total_value)`，未按 currency 分組／兌換；revenue 以 updated_at 而非 accepted_at 歸期。[src/lib/reports.ts:132](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/lib/reports.ts#L132) 報表欄位顯示 HKD。Dashboard aggregate 也無 currency 分組。`formatCurrencyAmount` 用整數 formatter，正式商業金額小數會被隱藏。

**影響：** HKD 100 + USD 100 可顯成 HKD 200；舊已接受報價稍作更新便移入新週。這是報價接受值，也不應誤讀為收款／會計收入。

**修復／驗收：** 先按幣種分開；若要統一 HKD，保存 rate、date、source；採固定 acceptance event／version。正式 quote／billing 顯示小數，compact KPI 可明確取整。用兩幣種及舊 quote 更新的測試驗收。

### CO-11 Renewal-risk 審批完成與實際套用分兩次交易（C、R）

**證據：** [src/server-functions/approvals.ts:22](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/server-functions/approvals.ts#L22) 先完成 decideApproval（並釋放 waiting run），之後才呼叫 [src/server/workflows/decide-risk-review.server.ts:14](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/server/workflows/decide-risk-review.server.ts#L14) 的另一個 transaction。

**影響：** 第二步失敗時，審批顯示已批准、run 已 completed，但 engagement 未更新；UI 重試又可能重覆活動紀錄／改決定。

**修復／驗收：** approval、engagement、run、audit 一起提交，或引入明確 approved_pending_apply 狀態及可恢復的執行工作；故障注入證明不可出現假完成。

## 6. P2 問題：可用性、批量維護及維運

### CO-12 Unassigned／escalated 審批及卡住 Agent 缺復原閉環（C、R）

`human_approval` ownership 取 assigned_to；manager 對有 resource id 卻無 owner 的 target 被拒絕（[src/server/auth/resource-ownership.ts:52](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/server/auth/resource-ownership.ts#L52)、[src/lib/admin/policy.ts:157](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/lib/admin/policy.ts#L157)）。assignApprovalFn 也先檢查同一 target，所以無 owner 的 queue 並不等於經理可自行接手。Escalated quote approval 不再能從 queue approve；舊 waiting run 仍保持，新的手動 approval 沒有自動連回舊 run。`findActiveRun` 沒有 timeout 排除，可能一直阻止相同 agent 重跑。

**改善：** claim／reassign 有明確 scope；supersede 舊 approval 時一起完成舊 run 的狀態轉移；增加帶理由、audit、重試鍵的 expire／cancel／retry。驗收無主、escalated、失聯 callback 三種情況。

### CO-13 「Approved — the agent will proceed」沒有相應通用執行流程（C）

[src/routes/approvals.tsx:498](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/routes/approvals.tsx#L498) 對非 quote approval 顯示此成功訊息；decideApproval 的 follow-up 只有 cs_risk_review。Reply draft writeback 建立 message_send approval，但本 repository 未找到審批後的 message dispatch／delivery status／outbox。

**改善：** 若當前產品只供人手複製，清楚寫「草稿已批准，待人手發送」並提供可追蹤交接；如要自動發送，另建有 consent／channel／recipient／delivery receipt 的發送流程。不能從 n8n 外部可能存在的流程推定目前已能發送。

### CO-14 Task owner 顯示 UUID，filter 選項會隨結果縮窄（C）

[src/routes/tasks.tsx:212](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/routes/tasks.tsx#L212) 由當前 rows 的 assigned_to 建 options，label 就是 ID；篩選某 owner 後，其他 owner 可從選單消失，要先返回 All 才容易切換。沒有獨立可搜尋的有效人員名單。

**改善：** 取得 profile display name，提供 My tasks／Unassigned／Team；owner picker 與當前結果分離；支援批量分派、到期日及 priority，保留 status 樂觀更新／rollback。

### CO-15 Tasks／Approvals 未分頁，Approvals 每 12 秒讀整個歷史（C）

[src/server/repositories/tasks.ts:47](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/server/repositories/tasks.ts#L47) 沒有 LIMIT；priority 在 handler 拉回後才 filter。Approvals `select *` 無分頁，而 [src/routes/approvals.tsx:212](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/routes/approvals.tsx#L212) 每 12 秒 refetch 全列表，包括已決定紀錄及 context_data。

**改善：** server-side filter + pagination；pending queue、counts、history、detail 分開；不輪詢巨大已完成歷史；只對可見隊列更新。驗收 10,000 tasks／100,000 approvals 的 payload、DB／auth 呼叫及 p95，不以 fixture 算式代替。

### CO-16 批量操作模式不一致，部分成功仍難重試（C）

Leads 已有 allSettled、成功 refresh、保留失敗 IDs，應保留。Approvals 雖有 allSettled，[src/routes/approvals.tsx:529](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/routes/approvals.tsx#L529) 最後清空整個 selection；失敗者要重新選。Teams [src/routes/admin.teams.tsx:257](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/routes/admin.teams.tsx#L257) 用 Promise.all，任何一項失敗會略過 success 之後的 refresh，即使其他 membership 已成功寫入。

**改善：** 共用 bulk result 模型；每筆 success／failed／forbidden／stale、保留失敗 selection、只重試失敗、進度和可下載錯誤清單；禁止無上限前端並行 N 個單筆請求。

### CO-17 CSV parser 不支援合法多行 quoted cell（C、T）

[src/lib/csv-import.ts:9](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/lib/csv-import.ts#L9) 先 split newline，再逐行處理引號。Probe 的一筆含換行 enquiry_text CSV 被解析成兩筆；註解所說的 quoted fields 支援不完整。

**改善：** 使用整個串流的 CSV state machine／成熟 parser；保留行號、BOM、escaped quote、多行欄位，reject malformed quote；Lead／Client／event importer 共用一致契約。

### CO-18 匯入規模、重入與 server 結果回報不足（C、R）

Lead／Client importer 在一個長 transaction 逐行 SELECT 再 INSERT／UPDATE；未見相應 normalized business-key unique constraint 或 import idempotency record。兩個並行 imports 的 check-then-insert 可能重複。commit 重新 validation 後只取 valid 子集，server 新發生的 invalid rows 沒在結果中完整回傳。

**改善：** preview／commit token、檔案摘要、逐筆 error、chunk／background job、business-key 約束及既有重複資料處理方案；test concurrent retry、timeout 重送及 owner 在 preview 後失效。保留現有「Lead reimport 不重設 status／owner／score」保護。

### CO-19 Job Sheet 缺日常維護的重要欄位與搜尋（C）

[src/routes/job-sheets.tsx:41](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/routes/job-sheets.tsx#L41) 只公開 status／page／limit；company name、quote number、owner、PO、invoice 日期不具完整搜尋／filter。Detail 會顯示 PO、client order、accounting_owner，但 [src/server-functions/job-sheets.ts:1](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/server-functions/job-sheets.ts#L1) 沒有一般 header 更新 endpoint；normal creation 也未填這些欄位。

**改善：** 可編輯 handoff header、支援 accounting owner、PO 或缺 PO 原因、billing instructions；server search join 公司／quote number；bulk assign／日期／匯出 billing schedule。鎖定後修改只能走具理由的更正流程。

### CO-20 Admin access／接手人 picker 限首 100 人（C）

[src/routes/admin.access.tsx:81](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/routes/admin.access.tsx#L81) 固定 active page 1 limit 100，以這一頁作 picker；[src/routes/admin.people.tsx:319](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/routes/admin.people.tsx#L319) 的 successors 同樣只取首 100。沒有可取得後續結果的搜尋控制，團隊擴大會選不到人。

**改善：** 共用 remote search combobox，pagination、active／role eligibility；已選項即使不在當前頁也能解析名稱。驗收第 101／250 位人員可找可選。

### CO-21 公開 Sign Up 與 invitation-only 工作區說法不一致（C、L、R）

正式頁顯示「Create an account with your @fimmick.com email」及 Create an account；README 說 invitation-only。[src/lib/auth/neon-auth.server.ts:143](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/lib/auth/neon-auth.server.ts#L143) 只接受已有 active profile 的身份，沒有 profile 返回 null。外觀上鼓勵自助註冊，卻未交代 workspace activation。

**改善：** 清楚標示需邀請；登入成功但 profile 未啟用時顯示「等待管理員／完成邀請」而非一般登入頁。未實際建立帳號，不能斷言 production 已出現 loop；此為程式路徑推斷及 UX 風險。

### CO-22 App shell 重覆載入 auth／authorization context（C）

[src/server-functions/admin-users.ts:119](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/server-functions/admin-users.ts#L119) 先 requireAnyCapability，再對 5 個 nav items 各 requireCapability；每次 [src/server/auth/authorization.server.ts:49](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/server/auth/authorization.server.ts#L49) 都重新 auth lookup 及 4 組權限背景 queries。Shell 還另讀 session、preferences、effective capabilities。許多 handler 亦在 requireCapability 後再 requireNeonAuthSession。

**改善：** request-scoped context 共用、一次計算 navigation／capabilities；不可跨使用者或長期 cache 權限。量度完整 request 的 auth／DB 次數，別只計 repository query。

### CO-23 共用 JS 與登入 bundle 仍偏大（C、T）

本次 Vite output：主 entry **688.64 KB／gzip 217.29 KB**；login form **614.42 KB／gzip 174.50 KB**；charts **317.60 KB／gzip 80.66 KB**。這些是產物大小，並非全部同時載入，也不是實測 download time。

**改善：** 依 bundle graph 拆分 auth UI／shared imports、確認 route lazy loading；加入實際入口總 transfer budget。保留 SSR／hydrate 一致性，不能只把 chunk 改名來通過 route budget。

### CO-24 效能 verify 部分是公式產生的 fixture，不是 runtime 量測（C）

[scripts/clientops/measure-route-performance.ts:48](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/scripts/clientops/measure-route-performance.ts#L48) 按 routeCount／fixture load 計算 databaseQueryCount／routeChunkBytes，`hasNPlusOne:false` 是固定值。文件雖有說明 deterministic fixtures，不能把它解讀為真實效能已改善。另有 DB loader contract 及 bundle script，應保留，但覆蓋範圍不同。

**改善：** 清楚分開 schema／contract／synthetic／runtime 指標；採真實 query instrumentation、cold/warm navigation、p50／p95、payload 及 slow-query evidence；納入 auth context 和共用 bundles。

### CO-25 Neon／Supabase 雙資料來源增加支援成本（C、R）

projects、deals、customer-success、engagement-events、automation-playbooks 仍呼叫 legacy Supabase，ownership resolver 亦有這些分支；`getProjectWorkspace`／customer-success workspace 的 tasks 讀 Supabase，但主要 Task writes 已是 Neon。Projects 尚未有正式 route，不能把這些全部說成目前日常可見功能。

**改善：** 列出實際可達 caller，逐域遷移；保留 ID mapping、permission overrides、owner 語義及歷史；row count／checksum／抽樣 reconciliation。先驗證 RLS／session bridging，不能只改成 service key 或把 empty result 當遷移成功。

### CO-26 香港工作日期與 UI 時間顯示不一致（C、T）

[src/lib/business-date.ts:1](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/lib/business-date.ts#L1) 用 Asia/Hong_Kong；[src/lib/format.ts:3](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/lib/format.ts#L3) 固定 UTC，畫面通常不標 UTC。Probe：香港 9 月 27 日 00:30 的 timestamp 顯為 9 月 26 日 16:30。

**改善：** datetime 依明確業務／profile timezone，date-only 不做跨日轉換；SSR/CSR 同一 explicit timezone，邊界測試 23:59／00:00。不是用 UTC 才能避免 hydration mismatch。

### CO-27 文件／發版檢查與最新功能狀態不同步（C）

backend-dependencies 部分已完成仍寫 missing；CLAUDE.md migrations 範圍仍 001–007，實際有 009；兩個 GitHub workflows 僅 pull_request 觸發。當前遠端 PR head 綠燈，不等於 main merge commit 完成同一整套測試；production readiness 清單仍未附當前登入 smoke 證據。

**改善：** 以 feature→route→server→migration→test→live verification 的狀態表取代散落完成描述；main／merge gate、preview smoke、runtime SHA 對照；不要把舊 checklist 未勾直接當成從未部署。

### CO-28 AI policy 已做，但執行品質／成本證據及旁路仍不足（C）

n8n workflow templates 未見回傳 tokens_used；server 有欄位及 forwarding 不等於已有真實 telemetry。[src/server-functions/ai-note-tidy.ts:1](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/server-functions/ai-note-tidy.ts#L1) 直接調 OpenRouter，未走 agent_runs／policy／相同 telemetry；`triggerN8n` 沒有 application timeout。

**改善：** 統一 AI invocation 的 timeout、input size、模型版本、耗時、token／成本、request id、失敗狀態；成本資料未有時顯示「未記錄」。Memory 未建不能當成已具長期記憶；不要重做已完成 policy versions。

### CO-29 CSV export 未防試算表公式解讀（C、T）

[src/lib/csv.ts:51](https://github.com/YNWAforever/ui-delight-maker/blob/2904faa502f7494173f48f412875c1d0a3aba674/src/lib/csv.ts#L51) 只做 CSV 引號 escaping；`=1+1` 原樣輸出。Renewal／reviewer 等報表帶使用者可輸入名稱，Excel 可能把開頭公式字串解讀為公式。Probe 證明未中和，未在 Excel 執行惡意內容。

**改善：** spreadsheet-safe text escaping，區分 numeric 欄與文字，測試 `= + - @`、tab／CR 及中英文；不要把 RFC quoting 誤當公式保護。

### CO-30 多個 write validator 只是 TypeScript cast（C）

tasks、quotes、approvals、job-sheets 等 `.validator((data:unknown)=>data as ...)` 沒有 runtime schema；相比 Admin Zod，枚舉、日期、金額有限值／非負值、內容長度、rows 上限缺一致的入口驗證。

**改善：** 共用 Zod schemas + 業務 transition 驗證；DB constraints 保底；錯誤可定位到欄位及 row，不把無效資料送到 SQL 後才顯示通用 failure。不要只增加測試數字或 regex guard 次數。

## 7. 批量維護的產品設計要求

先修授權與狀態，再增加 bulk；否則只是把單筆風險放大。

| 頁面 | 現有 bulk | 建議優先新增 | 必須保留的控制 |
|---|---|---|---|
| Leads | 多選寫入、partial-failure 處理、CSV import | owner／status／priority／下一步，儲存篩選視圖 | 保留失敗 IDs、每筆 update auth、不可把 won 直接回退 |
| Approvals | approve／reject | reviewer 分派、按類型／owner／SLA 的隊列 | 批准與發送分開、顯示每筆 eligibility、避免混合不可比較決定 |
| Job Sheets | 未見完整 bulk | accounting owner、target invoice date、billing export／CSV reconciliation | accepted／invoiced 商業欄位鎖；不 bulk「接受客戶報價」而無逐筆證據 |
| Tasks | 單筆 status 移動 | owner、due date、priority、標記完成 | expected version／status，部分成功可恢復 |
| Admin People／Teams | 邀請流程、multi-add members；離職按 bucket reassign | remote search、team membership preview、一般 owner reassignment | 權限變更理由、role/scope 檢查、不可批量提升為高權限而無逐筆評估 |
| Clients／Campaigns | CSV import 路徑 | preview diff、duplicate resolution、owner／標籤維護 | 不覆寫已確認歷史、合法 CSV、逐筆授權及錯誤回報 |

通用 bulk contract：

- Selection 清楚顯示「本頁 N 筆」或「符合條件共 N 筆」，不可含糊跨頁。
- Preview 顯示 before／after、不可操作原因、影響金額／owner／期限。
- Server 擁有執行權限及資料範圍；以 IDs 或 frozen filter snapshot 執行，附 idempotency key。
- 回傳每筆狀態與 request id；部分成功不回滾已完成顯示，不自動重寫成功項。
- 小量限制 concurrency；大批次用持久 job、progress／resume。權限／資料在 preview 後改變時重新檢查。
- 操作後保留 filter、scroll、未成功選取；Undo 只用於確實可逆且有版本保護的動作。

## 8. UI／UX 優化方向

**首頁以角色工作隊列為主。** Sales：今日跟進／待補報價；Manager：待審／待指派；Accounting：待補交接資料／待開單；Client Success：到期 engagement／未跟進 signal。每條都應有 owner、deadline、阻塞原因、下一個允許 action，而非增加 KPI 卡片。

**詳情頁固定「身份 → 狀態 → 下一步 → 證據」。** Quote 明確顯示 draft／issued／accepted 哪個版本，誰批准及何時；Job Sheet 同時顯示公司、來源 quote、billable portions、剩餘差額、PO／缺件、會計 owner。

**權限在操作之前解釋。** 看得到記錄不代表可改；由 server 回傳 per-record action eligibility。對 restricted 資料用一致文案，避免一頁遮蔽、另一頁 search／tooltip／export 露出。

**Admin 成為維護工具。** 人員及團隊可搜尋、可分頁；有效權限顯示 role baseline、override、scope、expiry 的差別；離職流程另外驗證歷史 assigned_to 是否應保留。當前 reassignment 更新所有 matching rows，不限 open，須由業務決定哪些歷史欄位屬 ownership、哪些屬事件證據。

**無障礙／手機待實測。** 現有 ResponsiveRecordList、keyboard state、ErrorState 及 confirmation patterns 是正面基礎；不能只因元件名稱就宣稱 WCAG 或手機通過。需實測 390px／768px、200% zoom、keyboard focus、dialog、sticky bulk bar 及長表單。

## 9. 建議修復順序與交付驗收

| 批次 | 範圍 | 驗收結果 |
|---|---|---|
| A：權限一致性 | CO-01～04、CO-08；search／dashboard／lists／imports | 7 個角色 + allow/deny overrides；每個 record 在所有入口遵守同一 policy；無權資料不出現在 response |
| B：商業狀態完整性 | CO-05～11、CO-12～13 | quote immutable version；單一審批終態；故障注入／併發／重試不產生半完成；Xero entry 有真實依據 |
| C：日常／批量維護 | CO-14～21、CO-29～30 | Accounting 可完成 handoff；批量 100 筆含部分 failure 可只重試失敗；CSV round-trip；第 101 人可選 |
| D：效能／維運 | CO-22～28 | request-scoped auth reuse、真實 p95／payload／query evidence、shared bundle budget、清晰 recovery runbook |

工作量估算須待登入後 role matrix、資料量及 production integrations 確認，本報告不提供虛假的精確工時。實施時應逐批 PR，保留現有 gate 及已修正能力；不建議一次整套重寫。

## 10. 後台實測清單（待登入／隔離環境）

| Scenario | 角色／資料 | 應驗證 |
|---|---|---|
| 權限一致性 | accounting；task deny；manager scoped | Search／首頁／list／detail／report／export 同一筆結果一致 |
| 報價生命週期 | sales→manager→admin／issuer→accounting | draft→pending→approved→issued→accepted→Job Sheet；錯誤可恢復 |
| 同時審批 | 兩個 reviewer sessions | 一個成功、一個 conflict；不覆寫終態 |
| 接受版本 | issued A，draft revision B | 客戶接受 A 只能生成 A 的 Job Sheet／金額 |
| Bulk partial failure | 100 筆中含 forbidden、stale、missing | 每筆回饋、成功不重寫、失敗可重試 |
| CSV | 中文、BOM、quoted multiline、重複、兩個 concurrent imports | 行數／內容正確、無重複、錯誤可下載 |
| Accounting | PO 缺失、分期差額、只有 Xero note | 不誤報已完成，清楚下一步 |
| AI | missing webhook、timeout、lost callback、escalation | 誠實狀態、受控恢復、不重複執行／發送 |
| 量測 | desktop／390px；cold／warm；不同資料量 | navigation p50/p95、LCP／INP、query 數、payload、無意外 overflow |

## 11. 驗證產物與重現方法

Evidence ZIP 包含：現有 tests／typecheck／lint／Vite build log、8 個 audit probes 及執行 log、公開登入／註冊截圖、此報告兩種格式及檢查摘要。

Audit probes 使用 mock database，檢查真實 handler／repository 的傳遞及 SQL／純函數行為；不是 production DB 測試。要重跑，可把 `audit-probes.test.ts` 暫放 repository 的 `scripts/` 後執行 `vitest run scripts/audit-probes.test.ts`。該檔刻意斷言現時問題存在，修復後應轉成「不再發生」的 regression tests，不能當作正式產品正確性 gate。

遠端證據：

- [審核 commit](https://github.com/YNWAforever/ui-delight-maker/commit/2904faa502f7494173f48f412875c1d0a3aba674)
- [PR #81](https://github.com/YNWAforever/ui-delight-maker/pull/81)
- [最近 PR head Checks](https://github.com/YNWAforever/ui-delight-maker/actions/runs/33910526178)
- [最近 PR head Database contract](https://github.com/YNWAforever/ui-delight-maker/actions/runs/33910526164)
- [已核實正式登入頁](https://ui-delight-maker.vercel.app/login)

**審核結論限於上述 SHA、可讀程式碼及本輪可取得的網站狀態。沒有修改產品，亦沒有宣稱完成登入後的端到端驗收。**
