# 规格追溯表：`FB_LowPassFilter` (A02)

- **源文件**：[FB_LowPassFilter.scl](file:///D:/TIA_MCP/benchmarks/golden_library/scl/FB_LowPassFilter.scl)
- **配套 UDT**：[UDT_HMI_LowPassFilter.xml](file:///D:/TIA_MCP/benchmarks/golden_library/udt/UDT_HMI_LowPassFilter.xml)
- **编译状态**：`0 Error, 0 Warning`（一次通过）

## 1. 接口与架构规范追溯

| 规格条目 | 代码行号 | 是否实现 | 核查说明 |
| :--- | :--- | :---: | :--- |
| 启用 `{ S7_Optimized_Access := 'TRUE' }` (`DA003`) | L2 | ✅ 已实现 | 块属性声明优化访问 |
| 块内零全局变量 (`RU004`/`DA005`) | L4–L39 | ✅ 已实现 | 全部通过形参交换 |
| `InOut` 挂载 `"UDT_HMI_LowPassFilter"` (`PE003`) | L18–L20 | ✅ 已实现 | `ioHmi` 引用传递 |
| 临时变量 `temp*` 先写后读初始化 (`SE002`) | L43–L47 | ✅ 已实现 | 全部 `temp*` 变量显式初始化 |
| 末尾单次写入 `VAR_OUTPUT` 且无回读 (`DA008`) | L62–L65, L116–L119 | ✅ 已实现 | 无输出形参回读 |

## 2. 业务逻辑与安全联锁追溯

| 规格条目 | 代码行号 | 是否实现 | 核查说明 |
| :--- | :--- | :---: | :--- |
| 1. `enable = FALSE` 时 `statInitialized := FALSE`，`filteredValue := rawValue`，`status := 16#7000` | L50–L67 | ✅ 已实现 | 未使能态安全直通并置 `16#7000` |
| 2. 有效滤波系数选取 (`ioHmi.rAlpha > 0.0` 优先) 及 `(0.0, 1.0]` 范围校验，越界报 `16#8200` 并钳位 `1.0` | L70–L83 | ✅ 已实现 | 参数范围校验与安全降级 |
| 3. 冷启动或复位 (`reset OR ioHmi.bResetCmd OR NOT statInitialized`) 无阶跃同步 `statPrevOut := rawValue` | L86–L88 | ✅ 已实现 | 消除首次上电从 0 爬升的阶跃误差 |
| 4. `ioHmi.bBypassFilter` 旁路直通、`rMaxDeltaPerScan` 尖峰限幅与一阶离散差分方程计算 | L90–L102 | ✅ 已实现 | `statPrevOut + tempEffAlpha * tempDiff` |
| 5. `ioHmi.bResetCmd` 自复位清除与状态写回 | L105–L113 | ✅ 已实现 | 自复位按钮信号清理与反馈 |

## 3. 漏项与偏差记录
- **轻微冗余项**：`VAR_TEMP` 中声明的 `tempInClamped`（L29, L44）已初始化为 `0.0`，但限幅计算直接使用了 `tempDiff`（L93–L100），未影响功能与编译。
