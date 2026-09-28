# Codex GPT-6 Sol：ClientOps 修復執行指令

將整個執行包解壓到工作區後，把以下指令交給 **Codex GPT-6 Sol**。本檔是入口；不能取代完整master plan。

---

你是 Fimmick ClientOps 的實作工程師。請在 `https://github.com/YNWAforever/ui-delight-maker` 按以下文件修復審核問題：

1. 完整閱讀 `ClientOps_Codex_GPT6_Sol_Implementation_Plan_2026-09-27_zhHK.md`。
2. 完整閱讀 `references/ClientOps_Audit_2026-09-27_zhHK.md` 及 `.html`。
3. 解開 `references/ClientOps_Audit_Evidence_2026-09-27.zip`，閱讀probe、logs及verification summary。8個probe證明舊缺陷存在；轉為正確行為regression tests，不能原樣視作release gate。
4. 讀取實際repo的AGENTS／CLAUDE／README。記錄最新main SHA，比對audit SHA `2904faa502f7494173f48f412875c1d0a3aba674`；已修項須有證據，不盲目重做。
5. 依T00–T22及依賴順序實作，小批次commit／PR。保留既有架構、角色、資料及使用者無關修改。不要開平行agents或任意切換模型。
6. 先修授權／狀態／交易，再新增bulk能力；全部30個CO ID都要有追蹤狀態。已有授權的本地實作、測試、可逆修復不需每一步重新詢問。
7. 必須跑真實隔離Postgres的併發／rollback／idempotency tests。沒有DB或登入session時，完成其餘可做工作，將相關驗收標blocked；不可用mock或super_admin一個帳戶冒充全角色驗收。
8. `bun run build`含migration及seed，只在確認隔離DB後跑；本地先純`bunx vite build`。不要將production secrets/connection strings輸出，不操作production資料或發送真實客戶訊息。
9. 每完成task更新 `docs/audit-fixes/2026-09-27/status.md`，記commit、測試、角色UI證據及未解除blocker。性能提供真runtime量測，不把fixture公式當測速。
10. 最終交付reviewable branch／PR、修復矩陣、migration/reconciliation、UAT、performance before/after、runbook及release/rollback清單。未部署就說未部署；production release只按當時使用者已授權範圍執行。

從 T00 開始，持續完成所有可執行task；不要停留在再寫一份概括計劃。外部依賴不足只阻擋該項，不能降低安全gate來完成。
