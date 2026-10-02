# T20 — 本機快照匯出與一致脫敏

基線 main：`cec0cdeb5e3c01ef9e73ac363e8822f008549d77`。使用者確認快照「未匯出」。這次提供可執行工具；沒有讀取 production、legacy Supabase 或真實 Neon 客戶資料。

## 目前完成與仍欠的資料

- 工具：`scripts/clientops/export-legacy-snapshots.ts`。不新增套件，不修改 application routes、授權、資料來源 guard 或 migration。
- 支援兩個已確認的獨立本機 PostgreSQL 副本，或兩份已由負責人匯出的本機 JSON。
- 兩份資料使用同一個隨機 256-bit HMAC key；保留 ID／owner／scope／task／override 的相等關係和差異。key 不寫入磁碟，每次執行使用新 key。
- 使用者表示已有獨立本機副本；尚欠其設定檔路徑及來源時間點、schema、write freeze／delta／ID mapping 的負責人紀錄。現有七角色 UAT 假資料不能代替 legacy 歷史快照。
- CO-25 與實際 migration／backfill／cutover acceptance 仍 blocked_external。所有30個 CO 維持19 verified_fixed／11 blocked_external。

## A. 尚未有 JSON：從獨立本機副本匯出

1. 資料負責人提供 legacy Supabase 與對應 Neon 的已批准備份及來源紀錄，在**兩個獨立、可丟棄的本機 DB**恢復。來源紀錄應包含 project／branch／snapshot 時間、恢復 DB、負責人及完整性檢查。這個工具不下載、建立或恢復 production 備份。
2. DB 名稱分別使用 `clientops_snapshot_legacy_*`、`clientops_snapshot_neon_*`；只接受 `127.0.0.1` 或 `::1`。localhost、remote hostname、URL query／fragment override、production mode 和相同 DB target 均拒絕。不得以 tunnel／proxy 指向 production 冒充本機副本。URL與確認旗標只屬 operator attestation，不能自行證明來源。
3. 從 application repo 根目錄建立空白設定檔：

```powershell
Set-Location 'C:\tmp\ui-delight-maker-git\.worktrees\clientops-merge-record'
bun scripts/clientops/export-legacy-snapshots.ts --init
Copy-Item -LiteralPath '.clientops-perf\snapshots\export-config.example.json' `
  -Destination '.clientops-perf\snapshots\export-config.private.json'
```

4. 在本機編輯 private 設定檔。`legacy`、`neon` 各自的 `connectionString` 必須只連接已恢復副本；填寫 `sourceRecord`（負責人紀錄識別／路徑），核實後才將 `isolationConfirmed` 改為 `true`。不要貼出設定內容或提交 Git。保留原本 `formatVersion: 1`。
5. 匯出：

```powershell
bun scripts/clientops/export-legacy-snapshots.ts `
  --config=.clientops-perf/snapshots/export-config.private.json
```

工具先驗證**兩個** target，才開啟連線。每個 DB 使用同一個 `REPEATABLE READ READ ONLY` transaction，固定 table allowlist、30秒 statement timeout／10秒 lock timeout，最後 ROLLBACK。`row_security=off` 會在 RLS 將過濾行時報錯，並不授予 BYPASSRLS、不改 policy。不完整 SELECT 權限、view／foreign table、無 id 欄、資料超限均停止。已有合理權限的**本機副本**可完成整表匯出；不能把受角色過濾的 subset 當成完整快照。[PostgreSQL transaction 說明](https://www.postgresql.org/docs/17/sql-set-transaction.html)。

## B. 已有負責人匯出的兩份本機 JSON

每份格式是 `{"tables":{"tasks":[{"id":"original-id",...}],...}}`；不要先分別隨機重寫兩份 ID。

```powershell
bun scripts/clientops/export-legacy-snapshots.ts `
  --legacy='C:\approved-copies\legacy.raw.json' `
  --neon='C:\approved-copies\neon.raw.json'
```

這個模式只讀兩個不同本機檔案，不連接 DB；來源授權／完整性仍需負責人紀錄。它不把 raw 檔複製到輸出目錄，也不刪除 operator 的原檔。

## 輸出路徑與判讀

成功產生一個新的、被 Git ignore 的目錄：

`C:\tmp\ui-delight-maker-git\.worktrees\clientops-merge-record\.clientops-perf\snapshots\pair-<random>\`

其中四個檔案：

| 檔案                  | 用途                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------- |
| `legacy.masked.json`  | legacy 脫敏快照                                                                               |
| `neon.masked.json`    | Neon 脫敏快照                                                                                 |
| `reconciliation.json` | 原有 T20 對帳結果：count／hash／ID mapping／owner／scope／override／FK                        |
| `manifest.json`       | 執行時間、來源紀錄 hashes、每表 count／檔案 SHA-256、來源仍未獨立驗證及 releaseAccepted=false |

stdout 只列結果旗標及四個**完整路徑**。提供給 Codex 的是兩個 masked JSON 及 manifest／對帳檔的路徑，並附來源紀錄路徑；不要貼原始資料或憑證。`--init` 只建立設定模板，**不會產生快照**；已有模板時不覆寫。

- exit 0：這份 pair 的限定 snapshot parity matched。
- exit 2，stdout 有 `prepared_incomplete`：已產生脫敏檔，但有 drift／missing table／dangling FK，仍 blocked。
- exit 2，只有 generic stderr：輸入／設定／DB／權限／runtime／輸出錯誤；不接受為快照。
- 每次執行新目錄、不覆寫舊 pair。兩份必須來自**同一次執行**；獨立 run 的 token 不可混用。
- POSIX files 使用600；Windows 使用目錄繼承 ACL，operator 必須核實只有獲授權人員可存取。Git ignore 不代表檔案公開分享安全。

可重跑原有 CLI（固定新 report 路徑，不能覆寫）：

```powershell
bun scripts/clientops/reconcile-legacy-domains.ts `
  --legacy='<stdout legacy 完整路徑>' `
  --neon='<stdout neon 完整路徑>' `
  --out='<新的對帳 report 完整路徑>'
```

## 完整性與脫敏界線

固定表：tasks、customer_success_profiles、success_touchpoints、projects、deals、engagement_events、channel_identities、automation_playbooks、automation_runs、permission_overrides，加上 profiles、accounts。不存在的表**不會**補成空陣列；已存在但零行的表才輸出 []。真實 Neon 尚無某 domain 時，工具不建立假 table 來完成 gate。

- row 頂層欄名必須是標準 snake_case schema 欄名，保留作既有 comparer 的介面；巢狀 JSON keys 也脫敏。
- 所有非空文字、數字、nested content 都轉為 HMAC token。僅保留 null／boolean／空文字，以及既有 FK checker 需要的 permission_overrides.resource_type=task。稀疏／缺值／重複 ID／型別差異保留。
- 數字使用 JSON reviver 原始數值字面量，避免 bigint／decimal 被 JS rounding 合併。數值表示1.0與1也會保守列為 drift，不能未經來源 schema／normalisation 證據自動放寬。Node／Bun 若不支援 source context 就停止。
- 每個檔案最多100 MiB；每表最多100,000行；巢狀內容最多64層。超限停止，不截成可通過的 subset。
- HMAC 是 pseudonymisation；table sizes／關係仍具識別風險，輸出仍屬受限制的驗收資料。
- key 不保留，因此 masked IDs 不能反解或用作 migration／backfill 的 row IDs；真實資料搬遷及 reversal mapping 另需批准的操作流程。
- snapshot parity 不能證明來源 provenance、跨 DB 同一時間點、RLS policy parity、全角色 UI、write freeze／catch-up、PITR或 production readiness。manifest 永遠 releaseAccepted=false，sourceProvenanceVerified=false。

## 驗證與交付紀錄

- RED：初始 raw pass-through／缺 guard 18/22失敗；實際 PG exporter／transaction 缺行為6/6失敗；CLI無檔案生成2/5失敗；decimal rounding／Unicode replacement兩項實際誤判 matched。
- GREEN：40項針對性測試、0 skipped，包括兩個獨立真實 PostgreSQL copies 的 CLI／穩定 MVCC／寫入25006拒絕及 rollback／RLS拒絕／數值精度／view拒絕／pair masked FK／missing／duplicates／stdout無 secret／原有對帳 CLI 相容。
- 第一輪完整 suite：329 files／2,514 tests／0 skipped。whole-source lint：0 errors／1 existing warning；app tsc、standalone runtime tsc、純 Vite build PASS。自我審查另修正port=0的環境 fallback（1項RED -> GREEN）、加強新目錄內 partial-file清理；最終40項及runtime typecheck／changed lint PASS。最後來源的全套fresh PG／CI仍在執行，結果完成後追加。角色 UI：N/A（本次僅本機 CLI，沒有 application／policy/UI修改）；現有七角色證據保留，不能代替 legacy 對帳。
- 執行測試只使用自行新建的隔離 DB 和 synthetic rows。沒有真實來源 export、migration、backfill、seed-on-production、cutover、provider/customer send 或 production deployment。

## Runbook／rollback／release

1. 負責人保存來源 backup／時間點／schema／scope／ID記錄；核實副本、無 tunnel及本機權限。
2. 一次執行匯出，查看 manifest／對帳並人工核對資料與 scope。missing／mismatch 維持 blocked；不得刪欄或複製一邊成兩份消除差異。
3. 將 masked pair 路徑及來源紀錄路徑交付驗收。真實 mapping／增量／全角色／migration reversal gate另行逐一執行。
4. 工具沒有 source writes；失敗不需要 DB rollback 操作，transaction會結束。只清理本次自建 fixture DB／輸出，先核實 absolute path 和所有者；不刪其他 backups／sessions／UAT資料。
5. Source rollback 可 revert 本次工具與 runtime typecheck script commit，不改已合併安全依賴、應用資料來源 guard 或任何實際 DB。停止測試、撤銷本機 copy reader 權限由 operator處理。
6. Production hold 與所有獨立 release gates不變；本工具準備完成不構成 production release 批准。

### 工具實測（synthetic fixture，非 release parity）

兩個獨立本機PostgreSQL17.10 DB，每個實際匯出10,000 tasks，3次實際performance.now wall runtime（ms），每pair輸出14,661,818 bytes：

| 觀察              | 雙庫唯讀讀取                   | 雙庫讀取＋脫敏＋對帳＋寫檔        | source fixture unchanged |
| ----------------- | ------------------------------ | --------------------------------- | ------------------------ |
| 初次run           | 401.6164 / 231.0538 / 320.0879 | 1119.2369 / 679.7032 / 1112.1032  | true                     |
| 最後guard來源重測 | 1392.403 / 872.6988 / 376.447  | 2822.6648 / 3283.9509 / 3279.2296 | true                     |

環境波動使最後量測較慢，兩次都保留。唯讀與完整pipeline工作量不同；不稱為before/after加速，不代替application runtime／production／實際legacy驗收。兩個run僅工具synthetic量測；sourceProvenanceVerified=false，releaseAccepted=false。CLI是新增功能，既有application performance before/after不適用；既有Approval Review量測沒有改寫。
