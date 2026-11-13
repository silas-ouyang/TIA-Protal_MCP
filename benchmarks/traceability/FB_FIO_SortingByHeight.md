# 规格追溯表：`FB_FIO_SortingByHeight` (B01)

- **源文件**：[FB_FIO_SortingByHeight.scl](file:///D:/TIA_MCP/benchmarks/golden_library/scl/FB_FIO_SortingByHeight.scl)
- **配套 UDT**：[UDT_HMI_FIO_SortingByHeight.xml](file:///D:/TIA_MCP/benchmarks/golden_library/udt/UDT_HMI_FIO_SortingByHeight.xml)
- **编译状态**：`0 Error, 0 Warning`（一次通过）

## 1. 接口与架构规范追溯

| 规格条目 | 代码行号 | 是否实现 | 核查说明 |
| :--- | :--- | :---: | :--- |
| 启用 `{ S7_Optimized_Access := 'TRUE' }` (`DA003`) | L2 | ✅ 已实现 | 块属性声明优化访问 |
| 多重背景定时器声明在 `VAR` 区 (`AL001`) | L40–L41 | ✅ 已实现 | `instStepTimer`, `instPushTimer : TON_TIME` |
| `CASE` 语句包含 `ELSE` 分支 (`DA017`) | L136–L258 | ✅ 已实现 | L250 `ELSE` 分支安全回 `STEP_IDLE` |
| 禁止回读 `VAR_OUTPUT` 形参 (`DA008`) | L287–L295 | ✅ 已实现 | 末尾单向写入 9 个 Output 引脚 |

## 2. 业务逻辑与安全联锁追溯

| 规格条目 | 代码行号 | 是否实现 | 核查说明 |
| :--- | :--- | :---: | :--- |
| 1. 急停最高优：`NOT eStopOk` 转入 `STEP_FAULT (99)`，并在块尾强制切断全部 5 个执行器输出 | L121–L124, L262–L268, L287–L291 | ✅ 已实现 | 状态机与块尾双重硬切断 |
| 2. 停止请求不卡步（`@siemens-v20-ops` §4.6）：按下停止仅锁存 `statStopReq := TRUE`，分拣完当前件回 `STEP_FEED_DETECT` 时优雅停机 | L106–L111, L161–L164, L210–L214, L231–L235 | ✅ 已实现 | 循环尾非阻塞停机 |
| 3. `STEP_FEED_DETECT (10)`：启动传送带，当 `palletSensor` 触发时锁存高度分类（高件=2，低件=1），转入 `STEP_WAIT_EXIT (20)` | L152–L174 | ✅ 已实现 | 托盘与高低光电组合判定 |
| 4. `STEP_WAIT_EXIT (20)`：驱动 `loadRoller` 与 `conveyorExit`，等待对应出口光电；超时报 `16#8401` | L176–L196 | ✅ 已实现 | `instStepTimer` 监控分拣滑道超时 |
| 5. `STEP_PUSH_HIGH (30)` / `STEP_PUSH_LOW (40)`：触发对应推杆保持 `tPusherHoldTime` 后缩回，对应计数器 +1 | L198–L238 | ✅ 已实现 | `diHighSortedCount` / `diLowSortedCount` 独立累计 |

## 3. 漏项与偏差记录
- **场景适配细节观察 1 处**：在 `STEP_PUSH_HIGH` / `STEP_PUSH_LOW`（L200, L221）中推杆推出期间将 `tempConvExit` 置为 `FALSE`（停带直推模式，适配气动直线推杆 Pusher）；若连接 Factory I/O 的斜摆轮分拣器（Pivoted Arm Sorter），推料期间需保持 `conveyorExit = TRUE` 辅助滑出。
- **手动模式恢复细节 1 处**：L129 手动模式下强制 `#statStep := #STEP_IDLE`，当在故障态切入手动再切回自动时，`statStep` 会从 `STEP_FAULT` 变为 `STEP_IDLE`。
