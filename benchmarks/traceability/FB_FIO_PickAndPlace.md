# 规格追溯表：`FB_FIO_PickAndPlace` (B02)

- **源文件**：[FB_FIO_PickAndPlace.scl](file:///D:/TIA_MCP/benchmarks/golden_library/scl/FB_FIO_PickAndPlace.scl)
- **配套 UDT**：[UDT_HMI_FIO_PickAndPlace.xml](file:///D:/TIA_MCP/benchmarks/golden_library/udt/UDT_HMI_FIO_PickAndPlace.xml)
- **编译状态**：`0 Error, 0 Warning`（一次通过）

## 1. 接口与架构规范追溯

| 规格条目 | 代码行号 | 是否实现 | 核查说明 |
| :--- | :--- | :---: | :--- |
| 启用 `{ S7_Optimized_Access := 'TRUE' }` (`DA003`) | L2 | ✅ 已实现 | 块属性声明优化访问 |
| 多重背景定时器声明在 `VAR` 区 (`AL001`) | L36–L37 | ✅ 已实现 | `instActionTimer`, `instWatchdog : TON_TIME` |
| `CASE` 语句包含 `ELSE` 分支 (`DA017`) | L138–L369 | ✅ 已实现 | L361 `ELSE` 分支安全复位 |
| 禁止回读 `VAR_OUTPUT` 形参 (`DA008`) | L398–L404 | ✅ 已实现 | 末尾集中写入 Output |

## 2. 业务逻辑与安全联锁追溯

| 规格条目 | 代码行号 | 是否实现 | 核查说明 |
| :--- | :--- | :---: | :--- |
| 1. 完整两轴搬运步序：`10送入 -> 20 Z下 -> 30吸气 -> 40 Z上 -> 50 X伸 -> 60 Z下 -> 70放气 -> 80 Z上 -> 90 X回并计数+1` | L154–L350 | ✅ 已实现 | 9 步顺控闭环 + 每步独立 `instWatchdog` 超时保护 |
| 2. 防碰撞硬规则：仅当 Z 轴处于高位 (`moveZ = FALSE AND NOT movingZ`) 才允许改变 X 轴；步 40..60 期间 `NOT itemDetected` 掉件立即进 `STEP_FAULT (99)` | L131–L135, L220, L244, L268 | ✅ 已实现 | 手动与自动均具备 Z/X 防撞及掉件检测 |
| 3. 急停触发时切断传送带、吸盘并将气缸复归安全态 | L118–L121, L373–L379, L398–L402 | ✅ 已实现 | 急停双重切断 |

## 3. 漏项与偏差记录
- **预留引脚未参与联锁 1 处**：输入形参 `itemAtExit`（L10，出口传送带放料位传感器）已按规格声明，但在 `STEP_Z_DOWN_PLACE (60)` 放料前未检查 `itemAtExit` 是否堵塞（因 `exitConveyor` 在步 10..90 期间始终保持运行排空）。
