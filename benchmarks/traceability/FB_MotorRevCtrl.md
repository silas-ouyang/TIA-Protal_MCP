# 规格追溯表：`FB_MotorRevCtrl` (A04)

- **源文件**：[FB_MotorRevCtrl.scl](file:///D:/TIA_MCP/benchmarks/golden_library/scl/FB_MotorRevCtrl.scl)
- **配套 UDT**：[UDT_HMI_MotorRevCtrl.xml](file:///D:/TIA_MCP/benchmarks/golden_library/udt/UDT_HMI_MotorRevCtrl.xml)
- **编译状态**：`0 Error, 0 Warning`（第 2 次编译自愈通过）

## 1. 接口与架构规范追溯

| 规格条目 | 代码行号 | 是否实现 | 核查说明 |
| :--- | :--- | :---: | :--- |
| 启用 `{ S7_Optimized_Access := 'TRUE' }` (`DA003`) | L2 | ✅ 已实现 | 块属性声明优化访问 |
| 多重背景定时器声明在 `VAR` 区 (`AL001`) | L34–L35 | ✅ 已实现 | `instDeadbandTimer`, `instFbkTimer : TON_TIME` |
| `CASE` 语句包含 `ELSE` 分支 (`DA017`) | L126–L195 | ✅ 已实现 | `ELSE` 分支安全复位至 `STATE_IDLE` |
| 禁止回读 `VAR_OUTPUT` 形参 (`DA008`) | L229–L239 | ✅ 已实现 | 第 1 次编译触发未初始化警告后已自愈修正 |

## 2. 业务逻辑与安全联锁追溯

| 规格条目 | 代码行号 | 是否实现 | 核查说明 |
| :--- | :--- | :---: | :--- |
| 1. 安全保护优先：`NOT eStopOk` 进 `STATE_FAULT (16#8403)`；`NOT thermalOk` 进 `STATE_FAULT (16#8401)` | L94–L102 | ✅ 已实现 | 急停与热过载最高优先级 |
| 2. 正反转命令同时为 `TRUE` 时视为停机请求（防误操作冲突） | L120–L123 | ✅ 已实现 | 同时为 `TRUE` 时清零 `#tempReqFwd` 与 `#tempReqRev` |
| 3. 正反转切换必须先切断输出并进入 `STATE_DEADBAND` 死区计时（默认 `T#1s`） | L139–L183 | ⚠️ 存在逻辑漏洞 | **高价值审查发现**：在 `#STATE_FWD`（L140）中先判断了 `IF (NOT #interlockOk) OR (NOT #tempReqFwd) THEN #statState := #STATE_IDLE;`，而 L120 又将同时为 `TRUE` 的请求清零，导致 `#ELSIF #tempReqRev`（L143）成为不可达分支！当命令从正转直接切反转时，会退回 `STATE_IDLE` 并在下一扫描周期直接进 `STATE_REV`，旁路了 1s 换向死区 |
| 4. `useFeedback = TRUE` 时监控输出与 `fbkFwd/fbkRev` 不一致超时报 `16#8402` | L198–L210 | ✅ 已实现 | `instFbkTimer` 超时锁存故障 |
| 5. 块尾正反转硬互锁与急停/热继硬切断 | L218–L226, L235–L236 | ✅ 已实现 | 确保 `contactorFwd` 与 `contactorRev` 绝不同时为 `TRUE` |

## 3. 漏项与偏差记录
- **重要逻辑偏差（死区旁路漏洞，编译器无法检出，由 Argon 终审捕获）**：
  - L120–L123 清零双请求 + L140/L154 先判 `NOT #tempReqFwd` / `NOT #tempReqRev` 跳 `STATE_IDLE`，导致 `STATE_DEADBAND`（L143, L157）在单周期正反切换或急停点动换向时被绕过。将在《通宵运行验收报告》（`MORNING_REPORT.md`）中重点登记此条“编译器 0 错但状态机条件顺序导致死区旁路”的工业典型案例。
