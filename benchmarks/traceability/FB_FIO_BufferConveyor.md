# 规格追溯表：`FB_FIO_BufferConveyor` (B03)

- **源文件**：[FB_FIO_BufferConveyor.scl](file:///D:/TIA_MCP/benchmarks/golden_library/scl/FB_FIO_BufferConveyor.scl)
- **配套 UDT**：[UDT_HMI_FIO_BufferConveyor.xml](file:///D:/TIA_MCP/benchmarks/golden_library/udt/UDT_HMI_FIO_BufferConveyor.xml)
- **编译状态**：`0 Error, 0 Warning`（一次通过）

## 1. 接口与架构规范追溯

| 规格条目 | 代码行号 | 是否实现 | 核查说明 |
| :--- | :--- | :---: | :--- |
| 启用 `{ S7_Optimized_Access := 'TRUE' }` (`DA003`) | L2 | ✅ 已实现 | 块属性声明优化访问 |
| 多重背景定时器声明在 `VAR` 区 (`AL001`) | L36–L38 | ✅ 已实现 | `instJamTimer1..3 : TON_TIME` |
| 临时变量 `temp*` 先写后读初始化 (`SE002`) | L63–L72 | ✅ 已实现 | 10 个临时变量首段初始化 |
| 禁止回读 `VAR_OUTPUT` 形参 (`DA008`) | L184–L192 | ✅ 已实现 | 末尾单向写入 Output |

## 2. 业务逻辑与安全联锁追溯

| 规格条目 | 代码行号 | 是否实现 | 核查说明 |
| :--- | :--- | :---: | :--- |
| 1. 零压力积放防追尾逻辑（ZPA）：`tempZ3Hold := sensorZ3 AND NOT downstreamReady`；`tempZ2Hold := sensorZ2 AND tempZ3Hold`；`tempZ1Hold := sensorZ1 AND tempZ2Hold`；对应驱动 `conv1..3` 与 `stopBlade1..2` | L129–L137, L184–L188 | ✅ 已实现 | 级联驻留与阻挡刀片同步 |
| 2. 传送带运行且末端光电持续遮挡超 `tJamTimeout` 判卡料报 `16#8401` 并停机 | L149–L156 | ✅ 已实现 | 三段独立看门狗超时检测 |
| 3. `upstreamReady := statRunning AND NOT tempZ1Hold AND NOT statJamError AND eStopOk` | L189 | ✅ 已实现 | 上游允许进料联锁表达式完全一致 |

## 3. 漏项与偏差记录
- **手自动切换细节 1 处**：L118 进入手动模式（`ioHmi.bManualMode = TRUE`）时未将 `#statRunning` 清零；若在自动运行中直接切手动，`#upstreamReady`（L189）仍会因 `#statRunning = TRUE` 而输出为 `TRUE`。
