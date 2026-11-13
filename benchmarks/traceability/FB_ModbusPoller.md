# 规格追溯表：`FB_ModbusPoller` (A07)

- **源文件**：[FB_ModbusPoller.scl](file:///D:/TIA_MCP/benchmarks/golden_library/scl/FB_ModbusPoller.scl)
- **配套 UDT**：[UDT_HMI_ModbusPoller.xml](file:///D:/TIA_MCP/benchmarks/golden_library/udt/UDT_HMI_ModbusPoller.xml)
- **编译状态**：`0 Error, 0 Warning`（一次通过）

## 1. 接口与架构规范追溯

| 规格条目 | 代码行号 | 是否实现 | 核查说明 |
| :--- | :--- | :---: | :--- |
| 启用 `{ S7_Optimized_Access := 'TRUE' }` (`DA003`) | L2 | ✅ 已实现 | 块属性声明优化访问 |
| 多重背景定时器声明在 `VAR` 区 (`AL001`) | L32–L33 | ✅ 已实现 | `instTimeoutTimer`, `instGapTimer : TON_TIME` |
| `CASE` 语句包含 `ELSE` 分支 (`DA017`) | L116–L184 | ✅ 已实现 | L179 `ELSE` 分支安全复位至 `STATE_IDLE` |
| 禁止回读 `VAR_OUTPUT` 形参 (`DA008`) | L192–L196 | ✅ 已实现 | 末尾集中写入 Output |

## 2. 业务逻辑与安全联锁追溯

| 规格条目 | 代码行号 | 是否实现 | 核查说明 |
| :--- | :--- | :---: | :--- |
| 1. PLCopen 状态机设计：`STATE_SEND_REQ` 拉高 `mbReq`，`STATE_WAIT_RESP` 等待 `reqDone`/`reqError`/超时 | L125–L145 | ✅ 已实现 | 脉冲触发 `mbReq` 后转入等待响应 |
| 2. 收到 `reqDone` 累加 `diSuccessCount + 1`、清零重试计数并进 `STATE_GAP_WAIT` 帧间延时后切下一站 | L136–L140, L163–L177 | ✅ 已实现 | 帧间静默定时器 `instGapTimer` 完备 |
| 3. 收到 `reqError` 或超时进 `STATE_RETRY`，未超限则重试当前站，耗尽则报 `16#8401`、`diErrorCount + 1` 并自动跳下一站防总线死锁 | L146–L161 | ✅ 已实现 | 掉线跳站防死锁逻辑正确 |

## 3. 漏项与偏差记录
- **默认参数边界细节 1 处**：L71 `IF #ioHmi.iMaxRetryCount >= 0 AND #ioHmi.iMaxRetryCount <= 5` 中，由于 `Int` 默认初值为 `0`（满足 `>= 0`），当外部未显式给 `ioHmi.iMaxRetryCount` 赋值时，实际生效的重试次数为 `0` 次而非默认值 `3` 次。此外 L101 `IF NOT (#enable AND #ioHmi.bEnablePoll)` 要求外部引脚 `enable` 与 HMI 开关 `ioHmi.bEnablePoll` 同时为 `TRUE` 才启动轮询。
