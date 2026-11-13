# 规格追溯表：`FB_FIO_Turntable` (B04)

- **源文件**：[FB_FIO_Turntable.scl](file:///D:/TIA_MCP/benchmarks/golden_library/scl/FB_FIO_Turntable.scl)
- **配套 UDT**：[UDT_HMI_FIO_Turntable.xml](file:///D:/TIA_MCP/benchmarks/golden_library/udt/UDT_HMI_FIO_Turntable.xml)
- **编译状态**：`0 Error, 0 Warning`（一次通过）

## 1. 接口与架构规范追溯

| 规格条目 | 代码行号 | 是否实现 | 核查说明 |
| :--- | :--- | :---: | :--- |
| 启用 `{ S7_Optimized_Access := 'TRUE' }` (`DA003`) | L2 | ✅ 已实现 | 块属性声明优化访问 |
| 多重背景定时器声明在 `VAR` 区 (`AL001`) | L40 | ✅ 已实现 | `instStepWatchdog : TON_TIME` |
| `CASE` 语句包含 `ELSE` 分支 (`DA017`) | L139–L318 | ✅ 已实现 | L309 `ELSE` 分支安全复位 |
| 禁止回读 `VAR_OUTPUT` 形参 (`DA008`) | L353–L360 | ✅ 已实现 | 末尾集中写入 Output |

## 2. 业务逻辑与安全联锁追溯

| 规格条目 | 代码行号 | 是否实现 | 核查说明 |
| :--- | :--- | :---: | :--- |
| 1. 机械防撞联锁：转盘正在旋转（`NOT limit0 AND NOT limit90`）时严禁开启 `rollPlus/rollMinus`；托盘正在进出转盘时严禁切换 `turnTable` | L132–L136, L322–L325 | ✅ 已实现 | 块尾硬联锁 `IF (NOT #limit0) AND (NOT #limit90) THEN #tempRollP := FALSE` |
| 2. 步序：`10确认limit0 -> 20等待atEntry -> 30进盘至frontLimit -> 50直通出料或40转90度 -> 60侧向出料 -> 70回转limit0` | L155–L298 | ⚠️ 存在 1 处步序输出遗漏 | **Argon 终审发现**：在 `STEP_WAIT_ENTRY (20)`（L174）中，`#tempEntryConv` 被置为 `FALSE`！若入口传送带在等待步不运转，入口带上的托盘将无法向前移动触发 `#atEntry` 光电（除非由外部上游输送线推入） |
| 3. 任一动作步超过 `tActionTimeout`（默认 `T#5s`）立即转入 `STEP_FAULT (99)` 并报 `16#8401` | L164–L167, L200–L203, L222–L225, L240–L243, L265–L268, L284–L287 | ✅ 已实现 | 全动作步均受 `instStepWatchdog` 保护 |

## 3. 漏项与偏差记录
- **重要逻辑偏差 1 处（由 Argon 终审捕获）**：`STEP_WAIT_ENTRY (20)`（L174）中 `#tempEntryConv := FALSE;`，导致转盘在等待来料步未启动自身的 `entryConveyor`，现场联调时需在 `STEP_WAIT_ENTRY` 将 `#tempEntryConv` 置为 `TRUE`。已按规则原样记录至《通宵运行验收报告》（`MORNING_REPORT.md`）。
