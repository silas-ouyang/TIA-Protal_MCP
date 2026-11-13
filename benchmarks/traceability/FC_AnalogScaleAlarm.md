# 规格追溯表：`FC_AnalogScaleAlarm` (A01)

- **源文件**：[FC_AnalogScaleAlarm.scl](file:///D:/TIA_MCP/benchmarks/golden_library/scl/FC_AnalogScaleAlarm.scl)
- **配套 UDT**：[UDT_HMI_AnalogScale.xml](file:///D:/TIA_MCP/benchmarks/golden_library/udt/UDT_HMI_AnalogScale.xml)
- **编译状态**：`0 Error, 0 Warning`（一次通过）

## 1. 接口与架构规范追溯

| 规格条目 | 代码行号 | 是否实现 | 核查说明 |
| :--- | :--- | :---: | :--- |
| 启用 `{ S7_Optimized_Access := 'TRUE' }` (`DA003`) | L2 | ✅ 已实现 | 块属性声明优化访问 |
| 块内零全局变量，仅通过形参交互 (`RU004`/`DA005`) | L4–L45 | ✅ 已实现 | 100% 局部变量与形参 |
| `InOut` 挂载 `"UDT_HMI_AnalogScale"` (`PE003`) | L20–L22 | ✅ 已实现 | `ioHmi` 引用传递 |
| 临时变量 `temp*` 先写后读初始化 (`SE002`) | L48–L58 | ✅ 已实现 | 10 个 `temp*` 变量在首段全量初始化 |
| 末尾单次写入 `VAR_OUTPUT` 且无回读 (`DA008`) | L131–L137 | ✅ 已实现 | 运算全用 `#temp*`，末尾一次性写入输出 |

## 2. 业务逻辑与安全联锁追溯

| 规格条目 | 代码行号 | 是否实现 | 核查说明 |
| :--- | :--- | :---: | :--- |
| 1. 校验 `ABS(rRawMax - rRawMin) < 1.0E-5` 或 `rEngMin >= rEngMax`，报 `16#8200` 并安全输出 `0.0` | L66–L70 | ✅ 已实现 | 除零与非法量程前置拦截 |
| 2. 校验报警阈值单调性 (`rLimitLL <= rLimitL <= rLimitH <= rLimitHH`)，违背报 `16#8201` | L72–L75 | ✅ 已实现 | 四限阈值顺序校验 |
| 3. 原始通道断线/上溢检测 (`rawInput > 32511` 或下溢)，报 `16#8401` | L78–L85 | ✅ 已实现 | 区分单极性 (`-4864`) 与双极性 (`-32512`) 断线阈值 |
| 4. `ioHmi.bManualOverride` 手动强制覆盖与 `[rEngMin, rEngMax]` 饱和限幅 | L88–L99 | ✅ 已实现 | 支持手动仿真工程值及自动换算限幅 |
| 5. 四限 (`HH/H/L/LL`) 比较及 `ioHmi` 状态与故障码同步 | L101–L129 | ✅ 已实现 | 状态完整写回 `ioHmi` 与 `Output` |

## 3. 漏项与偏差记录
- **无漏项**（100% 符合 `standard_blocks_spec.json` 规格要求）。
