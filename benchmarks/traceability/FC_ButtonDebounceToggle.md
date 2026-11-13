# 规格追溯表：`FC_ButtonDebounceToggle` (A06)

- **源文件**：[FC_ButtonDebounceToggle.scl](file:///D:/TIA_MCP/benchmarks/golden_library/scl/FC_ButtonDebounceToggle.scl)
- **配套 UDT**：[UDT_HMI_ButtonDebounce.xml](file:///D:/TIA_MCP/benchmarks/golden_library/udt/UDT_HMI_ButtonDebounce.xml)
- **编译状态**：`0 Error, 0 Warning`（一次通过）

## 1. 接口与架构规范追溯

| 规格条目 | 代码行号 | 是否实现 | 核查说明 |
| :--- | :--- | :---: | :--- |
| 启用 `{ S7_Optimized_Access := 'TRUE' }` (`DA003`) | L2 | ✅ 已实现 | 块属性声明优化访问 |
| 纯 FC 架构（无 `VAR` 静态段，跨周期状态全存 `InOut`） | L4–L34 | ✅ 已实现 | 零全局变量，符合可重入 FC 标准 |
| 临时变量 `temp*` 先写后读初始化 (`SE002`) | L38–L41 | ✅ 已实现 | 4 个临时变量显式赋初值 |
| 禁止回读 `VAR_OUTPUT` 形参 (`DA008`) | L99–L103 | ✅ 已实现 | 末尾一次性写入 5 个输出引脚 |

## 2. 业务逻辑与安全联锁追溯

| 规格条目 | 代码行号 | 是否实现 | 核查说明 |
| :--- | :--- | :---: | :--- |
| 1. 跨周期防抖计时与边沿状态保存在 `ioHmi` 中 | L58–L72 | ✅ 已实现 | 使用 `ioHmi.tElapsedMs`、`bDebouncedState`、`bPrevDebounced` |
| 2. `rawButton <> ioHmi.bDebouncedState` 时累加毫秒，达到阈值翻转状态并清零；一致时清零计时 | L58–L66 | ✅ 已实现 | 滤除小于 `tDebounceTime`（默认 50ms）的机械抖动毛刺 |
| 3. 解算单周期上升沿 `tempRise` 与下降沿 `tempFall` | L69–L71 | ✅ 已实现 | 严格在防抖后信号上取沿 |
| 4. 双稳态翻转优先级：`NOT eStopOk OR reset OR bHmiForceOff` > `bHmiForceOn` > `tempRise OR bHmiToggleCmd` | L74–L91 | ✅ 已实现 | 急停与复位拥有最高切断优先级 |
| 5. 自动清零单次软触发位 `bHmiToggleCmd / bHmiForceOn / bHmiForceOff` | L94–L96 | ✅ 已实现 | 防 HMI 软按钮粘滞 |

## 3. 漏项与偏差记录
- **无漏项**（100% 符合 `standard_blocks_spec.json` 规格要求）。
