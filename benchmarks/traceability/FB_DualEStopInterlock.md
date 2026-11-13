# 规格追溯表：`FB_DualEStopInterlock` (A08)

- **源文件**：[FB_DualEStopInterlock.scl](file:///D:/TIA_MCP/benchmarks/golden_library/scl/FB_DualEStopInterlock.scl)
- **配套 UDT**：[UDT_HMI_DualEStop.xml](file:///D:/TIA_MCP/benchmarks/golden_library/udt/UDT_HMI_DualEStop.xml)
- **编译状态**：`0 Error, 0 Warning`（一次通过）

## 1. 接口与架构规范追溯

| 规格条目 | 代码行号 | 是否实现 | 核查说明 |
| :--- | :--- | :---: | :--- |
| 块头包含非安全认证免责声明（补充要求 1.1） | L1 | ✅ 已实现 | `// 非安全认证功能，仅用于仿真演示；现场急停必须使用 F-CPU（Safety）或安全继电器硬回路实现。` |
| 启用 `{ S7_Optimized_Access := 'TRUE' }` (`DA003`) | L3 | ✅ 已实现 | 块属性声明优化访问 |
| 多重背景定时器声明在 `VAR` 区 (`AL001`) | L30 | ✅ 已实现 | `instDiscTimer : TON_TIME` |
| 禁止回读 `VAR_OUTPUT` 形参 (`DA008`) | L132–L136 | ✅ 已实现 | 末尾集中写入 Output |

## 2. 业务逻辑与安全联锁追溯

| 规格条目 | 代码行号 | 是否实现 | 核查说明 |
| :--- | :--- | :---: | :--- |
| 1. 任一通道断开 (`NOT eStopCh1 OR NOT eStopCh2 OR NOT safetyGateOk`) 立即无条件切断 `statSafetyLatched := FALSE` | L71–L73 | ⚠️ 存在额外串联项 | L71 额外串联了 `OR (NOT #feedbackLoopOk)`。按工业安全继电器 EDM（外部接触器释放反馈回路）原理，`feedbackLoopOk` 仅应在**复位吸合前**检查为 `TRUE`（确认主接触器未发生触点熔焊粘连）；吸合后主接触器常闭辅助触点会断开（`feedbackLoopOk` 变 `FALSE`），若放入 L71 持续保持条件会导致吸合后下一周期自锁跳脱 |
| 2. 双通道同步监控：`eStopCh1 XOR eStopCh2` 持续超 `tDiscrepancyTime`（默认 `T#200ms`）锁存 `statDiscrepancyFault` 与 `statWaitBothZero` | L76–L81 | ✅ 已实现 | 200ms 异或超时锁存不同步故障 |
| 3. 不同步故障恢复联锁：必须先让双通道同时回到 `FALSE` 才解除 `statWaitBothZero` | L84–L88 | ✅ 已实现 | 防单通道触点粘连直接复位 |
| 4. 受控上升沿复位：双通道、安全门、反馈回路全部正常且无不同步故障时，检测复位上升沿置位 `statSafetyLatched := TRUE` | L99–L108 | ✅ 已实现 | 仅上升沿有效，防复位按钮卡死自动重起 |

## 3. 漏项与偏差记录
- **代码与规格偏差 1 处（EDM 反馈回路条件位置偏差）**：规格书第 1 条规定仅 `NOT eStopCh1 OR NOT eStopCh2 OR NOT safetyGateOk` 触发持续切断，`feedbackLoopOk` 仅在第 4 条复位瞬间检查；代码 L71 将 `NOT #feedbackLoopOk` 也并入了持续切断条件。已在验收报告中记录。
