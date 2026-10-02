# T20 真實 Neon 唯讀備份及本機有限恢復 — 2026-10-02 HKT

Source main: `6eb9281bf7e512853e86055979fa5850ce9324d2`；既有 exporter implementation `1cd638d` / [merged PR157](https://github.com/YNWAforever/ui-delight-maker/pull/157)。本批只有證據文件，不改 application、schema migrations、Auth、source guard、部署或 integration 設定。

## 已實際完成

使用者明確批准「批准唯讀備份及本機恢復」，其後批准先核實 legacy 的安全重新啟用條件。Neon 真實來源為 `delicate-cake-75532180` / `br-young-rice-aoyk6gjz` / `neondb`，server PostgreSQL18.6。沒有新增 provider project／branch／snapshot／付費資源。

同一個 REPEATABLE READ READ ONLY transaction 的 exported snapshot `0000001E-00000002-1`，時間 **2026-10-02 23:24:59.012844 HKT**，供 pg_dump18.6 使用；來源最終 ROLLBACK。固定12張T20 allowlist中僅4張存在；沒有讀取其他業務表／Auth sessions或用synthetic rows填補。TLS保持verify-full；兩次缺根憑證的失敗日誌保留，最後使用既有runtime145個trusted public roots完成，沒有降低TLS gate。

| 表                   | 真實來源行數 | 本機恢復行數 | 同 snapshot／逐表 SHA-256 |
| -------------------- | -----------: | -----------: | ------------------------- |
| accounts             |            9 |            9 | MATCH                     |
| profiles             |            9 |            9 | MATCH                     |
| tasks                |            5 |            5 | MATCH                     |
| permission_overrides |            0 |            0 | MATCH                     |

備份 SHA-256：`49c3040abe0a4f92644e59aab76bd146249c78497802bd02fbcb3911524889f7`。[Allowlisted evidence／private report hashes](evidence/t20-neon-local-restore-2026-10-02.json)。原始備份與設定在ACL限制、Git ignored的私密目錄；未公開原始row、密碼、production DSN或cookie。

## 本機副本及驗證

- Docker PG：`clientops-t20-neon-20261002-24440e4b`；DB：`clientops_snapshot_neon_20261002_24440e4b`；獨立 volume及internal network記於evidence。
- 本機入口：`127.0.0.1:62470`。Docker internal network不分配published port的失敗觀察保留；獨立無憑證TCP helper只轉送到上述已恢復Docker PG。這是本機真實副本的port forwarder，沒有通向remote source的proxy／tunnel。
- Reader為獨立 `clientops_snapshot_reader`，僅CONNECT／schema USAGE／四表SELECT；NOSUPERUSER／NOCREATEROLE／NOCREATEDB／NOREPLICATION／NOBYPASSRLS。
- 在真實恢復DB上，READ ONLY拒寫SQLSTATE **25006**；即使BEGIN READ WRITE，也因無UPDATE權限拒寫 **42501**。兩次ROLLBACK後讀取成功，無業務row修改。
- 原有guarded exporter實際讀取恢復copy，四表counts與backup完全匹配。沒有將同一copy當作legacy及Neon pair；没有產生shared-key masked acceptance pair。

四表原始custom archive保留所有所選物件，但本機有限恢復明確排除**5項依賴其他表的外部FK及4個缺function definitions的triggers**；原定義完整保留於archive及privateDDL，具名清單在evidence。其餘check／PK／unique／indexes／內部FK實際恢復。沒有偽造FK target tables、放寬原有source constraints、移除drift或把局部copy當作完整schema／RLS／行為等價。

這個read-only snapshot copy不供application/UAT登入使用。既有七個genuine角色sessions仍保留；角色UI對此CLI操作N/A，不能代替legacy domain role acceptance。

## 已自行準備的實際路徑

Private export config：

`C:\tmp\ui-delight-maker-git\.worktrees\clientops-merge-record\.clientops-perf\snapshots\export-config.private.json`

Neon sourceRecord：

`C:\tmp\ui-delight-maker-git\.worktrees\clientops-merge-record\.clientops-perf\snapshots\neon.source-record.private.md`

Neon local connectionString與isolationConfirmed=true已由已核實copy填入；legacy欄仍空／false。原始備份及restore／reader receipts在 `.clientops-perf/snapshots/neon-restore-20261002-231842/`；不要把這些raw資料／credentials提交Git或貼聊天。sourceRecord狀態是NEON_PARTIAL_LOCAL_COPY_VERIFIED，並非完整paired provenance accepted。

## Legacy與未解除gate

Supabase `ClientOps / chwgijdmcyzmuuxzdkok`仍INACTIVE，org metadata為free，Edge Functions list為空；public catalog query與排程／outbound-function的READ ONLY query均connection timeout。Repo declared migrations沒有cron.schedule／pg_net/http外送宣告；repo retention workflow存在外部schedule，當前provider活動狀態尚未核實。這些資料不能證明實際legacy DB沒有cron／外送。Browser runtime因Windows sandbox deny-read ACL初始化錯誤，未取得dashboard備份內容。

使用者的安全resume批准附帶「先確認不會發送真實客戶訊息」條件；目前paused來源無法提供所需runtime inventory，**因此沒有resume／restore該cloud project**。仍可接受既有approved backup或來源負責人的完整排程／外送隔離紀錄，再完成安全恢復。原資料沒有寫入／覆寫，沒有reset credentials、寄信、工作流dispatch或production部署。

Neon真實缺失：`customer_success_profiles`、`success_touchpoints`、`projects`、`deals`、`engagement_events`、`channel_identities`、`automation_playbooks`、`automation_runs`。CO25維持blocked_external；T20 in_progress；30CO仍19 verified_fixed／11 blocked_external。Full schema／paired point-in-time／owner-ID-FK-override parity／write freeze與delta／per-domain migration-backfill-reversal／RLS及genuine role UI／operator PITR-cutover-release gates均未通過。Release NO-GO。

## 真runtime、重跑及rollback

| 這次實際工作             |    wall ms | 範圍                                   |
| ------------------------ | ---------: | -------------------------------------- |
| source pg_dump           | 10298.8110 | 4表／23 rows，同一snapshot             |
| local pg_restore         |  3713.0114 | 有限schema／data／selected constraints |
| 原有exporter讀local copy |   110.2239 | 4表／23 rows，READ ONLY／ROLLBACK      |

每項只有一次成功operator run，工作量不同；不是application測速或before/after改善。兩個TLS失敗、Docker internal-network port失敗及private helper import路徑修正均保留，沒有捨棄錯誤聲稱一次成功。Application code與既有實測未更改；不重跑與本批無關的本機全套，新增docs head仍須required CI。

收到真實legacy backup後，按來源版本／schema恢復到另一個新local copy並核實provenance；只在該copy通過隔離、counts及hash檢查後填legacy設定，再一次執行paired exporter。Missing/mismatch保持blocked；不能複製Neon到legacy、創建八張空表或混用不同HMAC run。

Source transaction已ROLLBACK，不需要source rollback。停止本次copy時，只可針對上方具名新建PG與TCP helper；保留raw backup、receipts及來源紀錄。清理volume/network前再次核實ownership及這份copy可丟棄，不能刪既有UAT／其他containers。沒有cutover，沒有production release。
