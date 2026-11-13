# 西门子 S7-1200/1500 黄金标准功能块库（Golden Standard Blocks & UDTs）

> **生成与验证环境**：Siemens TIA Portal V20 + S7-1500 (`PLC_1`) + `TiaMcpServer v2.7.8.0` (Upstream B)  
> **实机验证成果**：15 个工业标准 FB/FC + 15 个配套 `UDT_HMI_xxx`，首轮真机编译 93.3% 一次通过，全量修复后 **100.0% (15/15) 达成 `0 Error, 0 Warning` 晋升第一梯队**。  
> **配套资产基准目录**：
> - SCL 源码目录：`D:\TIA_MCP\benchmarks\golden_library\scl\`
> - SimaticML XML 目录：`D:\TIA_MCP\benchmarks\golden_library\xml\`
> - 配套 UDT SimaticML 目录：`D:\TIA_MCP\benchmarks\golden_library\udt\`
> - 净室测试向量目录：`D:\TIA_MCP\benchmarks\test_vectors\`
> - 规格与追溯对照目录：`D:\TIA_MCP\benchmarks\traceability\`

---

## 1. 黄金库核心架构铁律与设计规约

所有 15 个功能块均 100% 遵守西门子官方编程规范及 TIA V20 实测避坑规约：
1. **强制优化访问（Rule DA003）**：全部块头强制包含 `{ S7_Optimized_Access := 'TRUE' }`，消除 Byte Gap 对齐开销与大端转换惩罚。
2. **块内零全局变量（Rule RU004 / DA005）**：严禁在块内部直接读写 Global DB、PLC 变量或 M 区，所有交互 100% 经形参传入，确保对象级库一致性。
3. **UDT_HMI 按引用传递（Rule PE003 / DA007）**：每个块均在 `VAR_IN_OUT` 挂载专属 `ioHmi : "UDT_HMI_xxx"`，包含参数设定、手动控制、状态字反馈，FB 传递零值拷贝开销。
4. **多重实例封装定时器（Rule AL001 / CP003）**：所有内部定时器均在 `VAR (Static)` 声明为 `TON_TIME`，严禁独立单实例 DB，且在 `IDLE/FAULT` 显式复位。
5. **临时变量首行全量赋初值（Rule SE002 / CP002）**：进入 `BEGIN` 首行必须将所有 `VAR_TEMP` 变量无条件初始化，杜绝 L 栈残留脏数据与编译警告。
6. **严禁回读 VAR_OUTPUT（Rule DA008 / CP001）**：输出变量只能在内部静态/临时变量中计算，在块末尾集中执行一次单向赋值，杜绝 `might not be initialized` 警告。
7. **Fail-Safe 电气安全硬切断**：急停引脚 `eStopOk` 统一采用常闭健康极性（`TRUE`=正常闭合，`FALSE`=急停按下/断线），急停触发时在块尾同周期硬切断所有外部执行器。
8. **四大工业逻辑反模式根除**：
   - 换向强制经过 `STATE_DEADBAND` 灭弧冷却死区（`LP001`）；
   - PLCopen Execute `STEP_DONE` 维持 `done=TRUE` 等待释放，与 `busy` 严格互斥（`LP002`）；
   - EDM 常闭辅助触点反馈回路 `feedbackLoopOk` 仅在复位上升沿作吸合前置校验（`LP003`）；
   - 顺控预备步保持入口驱动开启，动作步必须闭环核对所有声明的到位与限位传感器（`LP004`）。

---

## 2. 15 个黄金标准功能块速查总表

| 编号 | 块名称 | 类型 | 配套 UDT (`VAR_IN_OUT.ioHmi`) | 工艺核心功能 / Factory I/O 官方场景 | 首轮编译 | 最终状态 |
| :---: | :--- | :---: | :--- | :--- | :---: | :---: |
| **A01** | `FC_AnalogScaleAlarm` | FC | `UDT_HMI_AnalogScale` | 模拟量线性定标、四限(HH/H/L/LL)报警与断线检测 | `0E / 0W` | **第一梯队** |
| **A02** | `FB_LowPassFilter` | FB | `UDT_HMI_LowPassFilter` | 一阶低通惯性平滑滤波、冷启动无阶跃跟踪与旁路 | `0E / 0W` | **第一梯队** |
| **A03** | `FB_CylinderCtrl` | FB | `UDT_HMI_CylinderCtrl` | 单/双电控气缸驱动、双限位冲突闭锁与超时告警 | `0E / 0W` | **第一梯队** |
| **A04** | `FB_MotorRevCtrl` | FB | `UDT_HMI_MotorRevCtrl` | 电机正反转互锁、1.0s 灭弧死区冷却与接触器反馈 | `0E / 4W` (自愈) | **第一梯队** |
| **A05** | `FB_RingFifo` | FB | `UDT_HMI_RingFifo` | 32 深度先进先出环形队列、入队出队原子操作 | `0E / 0W` | **第一梯队** |
| **A06** | `FC_ButtonDebounceToggle` | FC | `UDT_HMI_ButtonDebounce` | 按钮防抖滤波、双边沿单周期脉冲与单键启停翻转 | `0E / 0W` | **第一梯队** |
| **A07** | `FB_ModbusPoller` | FB | `UDT_HMI_ModbusPoller` | Modbus 多从站轮询调度器、应答超时重试与故障隔离 | `0E / 0W` | **第一梯队** |
| **A08** | `FB_DualEStopInterlock` | FB | `UDT_HMI_DualEStop` | 双回路急停双通道同步监控(200ms)、EDM 粘连检查与复位 | `0E / 0W` | **第一梯队** |
| **B01** | `FB_FIO_SortingByHeight` | FB | `UDT_HMI_FIO_SortingByHeight` | Factory I/O *Sorting by Height* 高低件分拣与推杆顺控 | `0E / 0W` | **第一梯队** |
| **B02** | `FB_FIO_PickAndPlace` | FB | `UDT_HMI_FIO_PickAndPlace` | Factory I/O *Pick & Place (Basic)* 两轴气动机械手搬运 | `0E / 0W` | **第一梯队** |
| **B03** | `FB_FIO_BufferConveyor` | FB | `UDT_HMI_FIO_BufferConveyor` | Factory I/O *Buffer Station* 三段传送带零压积放顺控 | `0E / 0W` | **第一梯队** |
| **B04** | `FB_FIO_Turntable` | FB | `UDT_HMI_FIO_Turntable` | Factory I/O *Sorting Station with Turntable* 90°旋转转盘 | `0E / 0W` | **第一梯队** |
| **B05** | `FB_FIO_AutomatedWarehouse` | FB | `UDT_HMI_FIO_Warehouse` | Factory I/O *Automated Warehouse* 54 库位堆垛机存取 | `0E / 0W` | **第一梯队** |
| **B06** | `FB_FIO_TankLevelPID` | FB | `UDT_HMI_FIO_TankLevelPID` | Factory I/O *Level Control* 水箱进排水比例阀分程闭环 PID | `0E / 0W` | **第一梯队** |
| **B07** | `FB_FIO_Assembler` | FB | `UDT_HMI_FIO_Assembler` | Factory I/O *Assembler (Basic)* 双工位底座与盖板装配 | `0E / 0W` | **第一梯队** |

---

## 3. 黄金标准块外部源自动化导入与调用指南

### 3.1 严格导入依赖顺序（铁律）
TIA Portal V20 Openness 在编译含有自定义数据类型的块时，必须先在符号表中存在该 UDT 定义：
1. **第 1 步**：通过 `d_write_block` 或 Openness `PlcBuildAndImport(kind: "udt")` 先行导入并编译 `UDT_HMI_xxx.xml`。
2. **第 2 步**：通过 `d_write_block` 或 Openness `PlcBuildAndImport(kind: "scl")` 导入并编译引用该 UDT 的主功能块 `FB/FC`。
3. **第 3 步**：执行 `d_compile(scope: "software")` 全局静态编译确认达成 `0 Errors, 0 Warnings`。

---

## 4. Part A：通用工控底层标准块全量规格（8 个）

### A01 · `FC_AnalogScaleAlarm`（模拟量线性定标与四限（HH/H/L/LL）断线超限报警 FC）

#### 1. 物理资产与追溯路径
- **SCL 源码**：[`FC_AnalogScaleAlarm.scl`](D:/TIA_MCP/benchmarks/golden_library/scl/FC_AnalogScaleAlarm.scl)
- **SimaticML 程序块 XML**：[`FC_AnalogScaleAlarm.xml`](D:/TIA_MCP/benchmarks/golden_library/xml/FC_AnalogScaleAlarm.xml)
- **配套 HMI UDT XML**：[`UDT_HMI_AnalogScale.xml`](D:/TIA_MCP/benchmarks/golden_library/udt/UDT_HMI_AnalogScale.xml)
- **净室测试向量**：[`FC_AnalogScaleAlarm.json`](D:/TIA_MCP/benchmarks/test_vectors/FC_AnalogScaleAlarm.json)
- **规格追溯矩阵**：[`FC_AnalogScaleAlarm.md`](D:/TIA_MCP/benchmarks/traceability/FC_AnalogScaleAlarm.md)

#### 2. 块接口定义（Interface Table）

| 参数方向 | 形参名称 | 数据类型 | 极性 / 说明 |
| :---: | :--- | :---: | :--- |
| `VAR_INPUT` | `rawInput` | `Int` | 模拟量通道原始输入值（如 %IW64，0..27648） |
| `VAR_INPUT` | `bipolar` | `Bool` | TRUE: 双极性(-27648..27648), FALSE: 单极性(0..27648) |
| `VAR_INPUT` | `reset` | `Bool` | 外部复位输入 |
| `VAR_OUTPUT` | `scaledValue` | `Real` | 标定后的工程量输出 |
| `VAR_OUTPUT` | `alarmHH` | `Bool` | 高高限报警输出 |
| `VAR_OUTPUT` | `alarmH` | `Bool` | 高限警告输出 |
| `VAR_OUTPUT` | `alarmL` | `Bool` | 低限警告输出 |
| `VAR_OUTPUT` | `alarmLL` | `Bool` | 低低限报警输出 |
| `VAR_OUTPUT` | `error` | `Bool` | 综合错误标志（断线或参数错误） |
| `VAR_OUTPUT` | `status` | `Word` | PLCopen 标准状态码 |
| `VAR_IN_OUT` | `ioHmi` | `"UDT_HMI_AnalogScale"` | HMI交互与参数状态结构体 |

#### 3. 配套 `"UDT_HMI_AnalogScale"` 结构体成员定义

| 字段名 | 数据类型 | 默认初始值 | 功能与业务含义 |
| :--- | :---: | :---: | :--- |
| `bManualOverride` | `Bool` | `FALSE` | HMI手动仿真覆盖使能 |
| `bResetCmd` | `Bool` | `FALSE` | HMI故障与锁存报警复位触发 |
| `rManualValue` | `Real` | `0.0` | HMI手动强制工程值给定 |
| `rRawMin` | `Real` | `0.0` | 原始码值下限（默认 0.0 或 5530.0） |
| `rRawMax` | `Real` | `0.0` | 原始码值上限（默认 27648.0） |
| `rEngMin` | `Real` | `0.0` | 工程量下限（如 0.0） |
| `rEngMax` | `Real` | `0.0` | 工程量上限（如 100.0） |
| `rLimitHH` | `Real` | `0.0` | 高高限报警阈值 |
| `rLimitH` | `Real` | `0.0` | 高限警告阈值 |
| `rLimitL` | `Real` | `0.0` | 低限警告阈值 |
| `rLimitLL` | `Real` | `0.0` | 低低限报警阈值 |
| `rScaledValue` | `Real` | `0.0` | 状态反馈：当前标定工程值 |
| `bAlarmHH` | `Bool` | `FALSE` | 状态反馈：高高限报警 |
| `bAlarmH` | `Bool` | `FALSE` | 状态反馈：高限报警 |
| `bAlarmL` | `Bool` | `FALSE` | 状态反馈：低限报警 |
| `bAlarmLL` | `Bool` | `FALSE` | 状态反馈：低低限报警 |
| `bWireBreak` | `Bool` | `FALSE` | 状态反馈：断线或溢出故障 |
| `wStatus` | `Word` | `16#0000` | 故障码：16#0000正常, 16#8200量程除零, 16#8201阈值顺序错, 16#8401断线/溢出 |

#### 4. PLCopen 标准状态码 (`wStatus`) 与故障诊断

| 状态码 (Word) | 常量符号名称 | 分类 | 详细含义与恢复动作 |
| :---: | :--- | :---: | :--- |
| `16#0000` | `STATUS_OK` | 正常完成 | 触发时 `error := FALSE` |
| `16#8200` | `ERR_ZERO_SPAN` | 参数配置错 | 触发时 `error := TRUE` |
| `16#8201` | `ERR_LIMIT_CFG` | 参数配置错 | 触发时 `error := TRUE` |
| `16#8401` | `ERR_WIRE_BREAK` | 外部硬件/超时故障 | 触发时 `error := TRUE` |

#### 5. 核心控制逻辑与安全防坑要点
- 1. 校验 ioHmi.rRawMax - ioHmi.rRawMin 的绝对值是否 < 1.0E-5，或者 ioHmi.rEngMin >= ioHmi.rEngMax，若是则报 ERR_ZERO_SPAN (16#8200) 并安全输出 0.0。
- 2. 校验报警阈值单调性 (rLimitLL <= rLimitL <= rLimitH <= rLimitHH)，若违背则报 ERR_LIMIT_CFG (16#8201)。
- 3. 检测原始通道断线/上溢：rawInput > RAW_OVERFLOW 或 (NOT bipolar AND rawInput < RAW_UNDERFLOW_UNI) 或 (bipolar AND rawInput < RAW_UNDERFLOW_BIP) 时置位 tempWireFault 与 ERR_WIRE_BREAK (16#8401)。
- 4. 若 ioHmi.bManualOverride 为 TRUE，则直接采用 ioHmi.rManualValue 作为工程值，否则执行线性换算并在 [rEngMin, rEngMax] 内限幅。
- 5. 比较工程值与 HH/H/L/LL 阈值，并将所有状态与故障码同步写回 ioHmi 及 Output。


### A02 · `FB_LowPassFilter`（一阶低通惯性滤波 FB（带冷启动无阶跃同步与尖峰剔除））

#### 1. 物理资产与追溯路径
- **SCL 源码**：[`FB_LowPassFilter.scl`](D:/TIA_MCP/benchmarks/golden_library/scl/FB_LowPassFilter.scl)
- **SimaticML 程序块 XML**：[`FB_LowPassFilter.xml`](D:/TIA_MCP/benchmarks/golden_library/xml/FB_LowPassFilter.xml)
- **配套 HMI UDT XML**：[`UDT_HMI_LowPassFilter.xml`](D:/TIA_MCP/benchmarks/golden_library/udt/UDT_HMI_LowPassFilter.xml)
- **净室测试向量**：[`FB_LowPassFilter.json`](D:/TIA_MCP/benchmarks/test_vectors/FB_LowPassFilter.json)
- **规格追溯矩阵**：[`FB_LowPassFilter.md`](D:/TIA_MCP/benchmarks/traceability/FB_LowPassFilter.md)

#### 2. 块接口定义（Interface Table）

| 参数方向 | 形参名称 | 数据类型 | 极性 / 说明 |
| :---: | :--- | :---: | :--- |
| `VAR_INPUT` | `enable` | `Bool` | 滤波功能使能 |
| `VAR_INPUT` | `rawValue` | `Real` | 当前周期原始采样值 |
| `VAR_INPUT` | `alpha` | `Real` | 默认滤波系数 (0.01..1.0)，当 ioHmi.rAlpha <= 0 时生效 |
| `VAR_INPUT` | `reset` | `Bool` | 复位并立即将输出同步到当前输入 |
| `VAR_OUTPUT` | `filteredValue` | `Real` | 一阶低通滤波输出值 |
| `VAR_OUTPUT` | `valid` | `Bool` | 输出数据有效 |
| `VAR_OUTPUT` | `error` | `Bool` | 参数错误标志 |
| `VAR_OUTPUT` | `status` | `Word` | 状态码 |
| `VAR_IN_OUT` | `ioHmi` | `"UDT_HMI_LowPassFilter"` | HMI交互与参数状态结构体 |

#### 3. 配套 `"UDT_HMI_LowPassFilter"` 结构体成员定义

| 字段名 | 数据类型 | 默认初始值 | 功能与业务含义 |
| :--- | :---: | :---: | :--- |
| `bBypassFilter` | `Bool` | `FALSE` | HMI手动旁路滤波（直通模式） |
| `bResetCmd` | `Bool` | `FALSE` | HMI手动复位同步触发 |
| `rAlpha` | `Real` | `0.0` | 滤波系数 Alpha (0.01..1.0，越小越平滑) |
| `rMaxDeltaPerScan` | `Real` | `0.0` | 单周期最大允许突变幅值（<=0.0 表示不限制） |
| `rRawInput` | `Real` | `0.0` | 状态反馈：原始输入值 |
| `rFilteredOutput` | `Real` | `0.0` | 状态反馈：滤波后输出值 |
| `bInitialized` | `Bool` | `FALSE` | 状态反馈：已完成冷启动同步 |
| `bError` | `Bool` | `FALSE` | 状态反馈：参数故障标志 |
| `wStatus` | `Word` | `16#0000` | 故障码：16#0000正常, 16#7000未使能, 16#8200系数超范围 |

#### 4. PLCopen 标准状态码 (`wStatus`) 与故障诊断

| 状态码 (Word) | 常量符号名称 | 分类 | 详细含义与恢复动作 |
| :---: | :--- | :---: | :--- |
| `16#0000` | `STATUS_OK` | 正常完成 | 触发时 `error := FALSE` |
| `16#7000` | `STATUS_NO_CALL` | 空闲/执行中 | 触发时 `error := FALSE` |
| `16#8200` | `ERR_ALPHA_RANGE` | 参数配置错 | 触发时 `error := TRUE` |

#### 5. 核心控制逻辑与安全防坑要点
- 1. 当 enable = FALSE 时，statInitialized := FALSE，filteredValue := rawValue，status := 16#7000。
- 2. 选取有效滤波系数：若 ioHmi.rAlpha > 0.0 则用 ioHmi.rAlpha，否则用输入形参 alpha。校验范围是否在 (0.0, 1.0] 内，越界则报 ERR_ALPHA_RANGE (16#8200) 并将有效系数钳位至 1.0。
- 3. 冷启动或复位 (reset OR ioHmi.bResetCmd OR NOT statInitialized) 时：statPrevOut := rawValue，statInitialized := TRUE，消除从 0 爬升的阶跃滞后。
- 4. 若 ioHmi.bBypassFilter 为 TRUE，则 statPrevOut := rawValue；否则按 y(k) = y(k-1) + alpha * (x(k) - y(k-1)) 更新（若 rMaxDeltaPerScan > 0.0 则先对 x(k)-y(k-1) 限幅）。
- 5. 清除 ioHmi.bResetCmd 自复位命令并更新 ioHmi 状态反馈与 Output。


### A03 · `FB_CylinderCtrl`（气缸双向到位监控与超时保护标准块 FB（支持单控/双控电磁阀））

#### 1. 物理资产与追溯路径
- **SCL 源码**：[`FB_CylinderCtrl.scl`](D:/TIA_MCP/benchmarks/golden_library/scl/FB_CylinderCtrl.scl)
- **SimaticML 程序块 XML**：[`FB_CylinderCtrl.xml`](D:/TIA_MCP/benchmarks/golden_library/xml/FB_CylinderCtrl.xml)
- **配套 HMI UDT XML**：[`UDT_HMI_CylinderCtrl.xml`](D:/TIA_MCP/benchmarks/golden_library/udt/UDT_HMI_CylinderCtrl.xml)
- **净室测试向量**：[`FB_CylinderCtrl.json`](D:/TIA_MCP/benchmarks/test_vectors/FB_CylinderCtrl.json)
- **规格追溯矩阵**：[`FB_CylinderCtrl.md`](D:/TIA_MCP/benchmarks/traceability/FB_CylinderCtrl.md)

#### 2. 块接口定义（Interface Table）

| 参数方向 | 形参名称 | 数据类型 | 极性 / 说明 |
| :---: | :--- | :---: | :--- |
| `VAR_INPUT` | `eStopOk` | `Bool` | 急停正常信号（常闭健康为 TRUE，FALSE 立即失电缩回/切断） |
| `VAR_INPUT` | `autoMode` | `Bool` | 外部自动模式选择 |
| `VAR_INPUT` | `autoExtendCmd` | `Bool` | 自动模式伸出请求 |
| `VAR_INPUT` | `autoRetractCmd` | `Bool` | 自动模式缩回请求 |
| `VAR_INPUT` | `interlockOk` | `Bool` | 机械防碰撞安全联锁允许（TRUE 允许动作） |
| `VAR_INPUT` | `sensorExtended` | `Bool` | 气缸伸出到位磁性开关反馈 |
| `VAR_INPUT` | `sensorRetracted` | `Bool` | 气缸缩回到位磁性开关反馈 |
| `VAR_INPUT` | `doubleSolenoid` | `Bool` | TRUE: 双电控保持阀, FALSE: 单电控弹簧复位阀 |
| `VAR_INPUT` | `timeout` | `Time` | 默认超时时间（如 T#3s） |
| `VAR_INPUT` | `reset` | `Bool` | 外部故障复位 |
| `VAR_OUTPUT` | `coilExtend` | `Bool` | 气缸伸出电磁阀输出 |
| `VAR_OUTPUT` | `coilRetract` | `Bool` | 气缸缩回电磁阀输出 |
| `VAR_OUTPUT` | `inExtendedPos` | `Bool` | 已稳定伸出到位 |
| `VAR_OUTPUT` | `inRetractedPos` | `Bool` | 已稳定缩回到位 |
| `VAR_OUTPUT` | `error` | `Bool` | 气缸故障报警 |
| `VAR_OUTPUT` | `status` | `Word` | 状态/故障代码 |
| `VAR_IN_OUT` | `ioHmi` | `"UDT_HMI_CylinderCtrl"` | HMI交互与参数状态结构体 |

#### 3. 配套 `"UDT_HMI_CylinderCtrl"` 结构体成员定义

| 字段名 | 数据类型 | 默认初始值 | 功能与业务含义 |
| :--- | :---: | :---: | :--- |
| `bManualMode` | `Bool` | `FALSE` | TRUE: 手动模式, FALSE: 自动模式 |
| `bManualExtendCmd` | `Bool` | `FALSE` | HMI手动伸出触发 |
| `bManualRetractCmd` | `Bool` | `FALSE` | HMI手动缩回触发 |
| `bResetCmd` | `Bool` | `FALSE` | HMI故障复位按钮 |
| `tTimeoutSV` | `Time` | `0` | 动作超时设定值（默认 T#3s） |
| `bIsExtended` | `Bool` | `FALSE` | 状态反馈：伸出到位 |
| `bIsRetracted` | `Bool` | `FALSE` | 状态反馈：缩回到位 |
| `bValveExtendOut` | `Bool` | `FALSE` | 状态反馈：伸出阀输出状态 |
| `bValveRetractOut` | `Bool` | `FALSE` | 状态反馈：缩回阀输出状态 |
| `bFault` | `Bool` | `FALSE` | 状态反馈：综合故障标志 |
| `wStatus` | `Word` | `16#0000` | 状态码：16#0000正常, 16#8401伸出超时, 16#8402缩回超时, 16#8403前后磁性开关同时亮, 16#8404急停切断 |

#### 4. PLCopen 标准状态码 (`wStatus`) 与故障诊断

| 状态码 (Word) | 常量符号名称 | 分类 | 详细含义与恢复动作 |
| :---: | :--- | :---: | :--- |
| `16#0000` | `STATUS_OK` | 正常完成 | 触发时 `error := FALSE` |
| `16#8401` | `ERR_EXTEND_TIMEOUT` | 外部硬件/超时故障 | 触发时 `error := TRUE` |
| `16#8402` | `ERR_RETRACT_TIMEOUT` | 外部硬件/超时故障 | 触发时 `error := TRUE` |
| `16#8403` | `ERR_SENSOR_CONFLICT` | 外部硬件/超时故障 | 触发时 `error := TRUE` |
| `16#8404` | `ERR_ESTOP` | 外部硬件/超时故障 | 触发时 `error := TRUE` |

#### 5. 核心控制逻辑与安全防坑要点
- 1. 急停最高优：当 NOT eStopOk 时，立即将 statTargetExtend := FALSE，输出线圈 tempCoilExt := FALSE, tempCoilRet := FALSE，报 ERR_ESTOP (16#8404)。
- 2. 磁性开关冲突诊断：sensorExtended AND sensorRetracted 持续超过 T#200ms 时锁存 ERR_SENSOR_CONFLICT (16#8403)。
- 3. 手自动命令源选择：autoMode AND NOT ioHmi.bManualMode 时响应 autoExtendCmd/autoRetractCmd；否则响应 ioHmi.bManualExtendCmd/bManualRetractCmd（缩回优先于伸出，且伸出受 interlockOk 联锁限制）。
- 4. 超时保护：目标为伸出且 NOT sensorExtended 时启动 instExtendTimeout；目标为缩回且 NOT sensorRetracted 时启动 instRetractTimeout。超时置位 statError 并切断输出。
- 5. 单/双电控输出：单电控时 coilExtend := statTargetExtend AND NOT statError AND eStopOk，coilRetract := FALSE；双电控时伸出到位或缩回到位可根据状态驱动双线圈并嚴格互锁 NOT (coilExtend AND coilRetract)。


### A04 · `FB_MotorRevCtrl`（电机正反转软硬件互锁、换向死区延时与热过载/反馈故障标准块 FB）

#### 1. 物理资产与追溯路径
- **SCL 源码**：[`FB_MotorRevCtrl.scl`](D:/TIA_MCP/benchmarks/golden_library/scl/FB_MotorRevCtrl.scl)
- **SimaticML 程序块 XML**：[`FB_MotorRevCtrl.xml`](D:/TIA_MCP/benchmarks/golden_library/xml/FB_MotorRevCtrl.xml)
- **配套 HMI UDT XML**：[`UDT_HMI_MotorRevCtrl.xml`](D:/TIA_MCP/benchmarks/golden_library/udt/UDT_HMI_MotorRevCtrl.xml)
- **净室测试向量**：[`FB_MotorRevCtrl.json`](D:/TIA_MCP/benchmarks/test_vectors/FB_MotorRevCtrl.json)
- **规格追溯矩阵**：[`FB_MotorRevCtrl.md`](D:/TIA_MCP/benchmarks/traceability/FB_MotorRevCtrl.md)

#### 2. 块接口定义（Interface Table）

| 参数方向 | 形参名称 | 数据类型 | 极性 / 说明 |
| :---: | :--- | :---: | :--- |
| `VAR_INPUT` | `eStopOk` | `Bool` | 急停回路正常（常闭健康为 TRUE） |
| `VAR_INPUT` | `thermalOk` | `Bool` | 热继电器/断路器正常（常闭健康为 TRUE） |
| `VAR_INPUT` | `interlockOk` | `Bool` | 外部工艺运行允许联锁 |
| `VAR_INPUT` | `autoMode` | `Bool` | 外部自动模式使能 |
| `VAR_INPUT` | `autoFwdCmd` | `Bool` | 自动正转命令 |
| `VAR_INPUT` | `autoRevCmd` | `Bool` | 自动反转命令 |
| `VAR_INPUT` | `fbkFwd` | `Bool` | 正转接触器辅助常开触点反馈 |
| `VAR_INPUT` | `fbkRev` | `Bool` | 反转接触器辅助常开触点反馈 |
| `VAR_INPUT` | `useFeedback` | `Bool` | TRUE: 启用接触器反馈超时校验；FALSE: 无反馈仿真模式 |
| `VAR_INPUT` | `reset` | `Bool` | 外部故障复位 |
| `VAR_OUTPUT` | `contactorFwd` | `Bool` | 正转接触器 KM1 输出 |
| `VAR_OUTPUT` | `contactorRev` | `Bool` | 反转接触器 KM2 输出 |
| `VAR_OUTPUT` | `running` | `Bool` | 电机运行中指示 |
| `VAR_OUTPUT` | `error` | `Bool` | 电机故障报警输出 |
| `VAR_OUTPUT` | `status` | `Word` | 状态/故障代码 |
| `VAR_IN_OUT` | `ioHmi` | `"UDT_HMI_MotorRevCtrl"` | HMI交互与参数状态结构体 |

#### 3. 配套 `"UDT_HMI_MotorRevCtrl"` 结构体成员定义

| 字段名 | 数据类型 | 默认初始值 | 功能与业务含义 |
| :--- | :---: | :---: | :--- |
| `bManualMode` | `Bool` | `FALSE` | HMI手自动切换（TRUE手动） |
| `bManualFwdCmd` | `Bool` | `FALSE` | HMI手动正转点动/启动 |
| `bManualRevCmd` | `Bool` | `FALSE` | HMI手动反转点动/启动 |
| `bManualStopCmd` | `Bool` | `FALSE` | HMI手动停止 |
| `bResetCmd` | `Bool` | `FALSE` | HMI故障复位命令 |
| `tFeedbackTimeout` | `Time` | `0` | 接触器吸合反馈超时时间（默认 T#2s） |
| `tReverseDeadband` | `Time` | `0` | 正反转切换停机死区时间（默认 T#1s） |
| `bRunningFwd` | `Bool` | `FALSE` | 状态反馈：正在正转 |
| `bRunningRev` | `Bool` | `FALSE` | 状态反馈：正在反转 |
| `bFault` | `Bool` | `FALSE` | 状态反馈：综合故障 |
| `wStatus` | `Word` | `16#0000` | 状态码：16#0000正常, 16#8401热过载, 16#8402接触器反馈超时, 16#8403急停激活 |

#### 4. PLCopen 标准状态码 (`wStatus`) 与故障诊断

| 状态码 (Word) | 常量符号名称 | 分类 | 详细含义与恢复动作 |
| :---: | :--- | :---: | :--- |
| `16#0000` | `STATUS_OK` | 正常完成 | 触发时 `error := FALSE` |
| `16#8401` | `ERR_THERMAL` | 外部硬件/超时故障 | 触发时 `error := TRUE` |
| `16#8402` | `ERR_FBK_TIMEOUT` | 外部硬件/超时故障 | 触发时 `error := TRUE` |
| `16#8403` | `ERR_ESTOP` | 外部硬件/超时故障 | 触发时 `error := TRUE` |

#### 5. 核心控制逻辑与安全防坑要点
- 1. 安全保护优先：若 NOT eStopOk 则立即进 STATE_FAULT (16#8403)；若 NOT thermalOk 则立即进 STATE_FAULT (16#8401)。
- 2. 正反转命令同时为 TRUE 时视为停机请求（防误操作冲突）。
- 3. 从正转切反转或从反转切正转时，必须先切断输出并进入 STATE_DEADBAND 计时（默认 T#1s），死区时间到且反方向触点已断开后才允许吸合目标方向接触器。
- 4. 当 useFeedback = TRUE 时，监控输出与 fbkFwd/fbkRev 不一致时间，超时报 ERR_FBK_TIMEOUT (16#8402)。
- 5. 块尾硬互锁：contactorFwd := tempOutFwd AND NOT tempOutRev AND eStopOk AND thermalOk；contactorRev := tempOutRev AND NOT tempOutFwd AND eStopOk AND thermalOk。


### A05 · `FB_RingFifo`（环形 FIFO 物料/任务队列管理标准块 FB（O(1) 指针寻址））

#### 1. 物理资产与追溯路径
- **SCL 源码**：[`FB_RingFifo.scl`](D:/TIA_MCP/benchmarks/golden_library/scl/FB_RingFifo.scl)
- **SimaticML 程序块 XML**：[`FB_RingFifo.xml`](D:/TIA_MCP/benchmarks/golden_library/xml/FB_RingFifo.xml)
- **配套 HMI UDT XML**：[`UDT_HMI_RingFifo.xml`](D:/TIA_MCP/benchmarks/golden_library/udt/UDT_HMI_RingFifo.xml)
- **净室测试向量**：[`FB_RingFifo.json`](D:/TIA_MCP/benchmarks/test_vectors/FB_RingFifo.json)
- **规格追溯矩阵**：[`FB_RingFifo.md`](D:/TIA_MCP/benchmarks/traceability/FB_RingFifo.md)

#### 2. 块接口定义（Interface Table）

| 参数方向 | 形参名称 | 数据类型 | 极性 / 说明 |
| :---: | :--- | :---: | :--- |
| `VAR_INPUT` | `enqueue` | `Bool` | 入队上升沿触发 |
| `VAR_INPUT` | `dequeue` | `Bool` | 出队上升沿触发 |
| `VAR_INPUT` | `itemIn` | `DInt` | 外部入队数据（物料ID/高度编码/库位号） |
| `VAR_INPUT` | `clear` | `Bool` | 外部清空队列复位 |
| `VAR_OUTPUT` | `itemOut` | `DInt` | 出队数据输出 |
| `VAR_OUTPUT` | `count` | `Int` | 当前有效元素个数 (0..32) |
| `VAR_OUTPUT` | `isEmpty` | `Bool` | 队列为空标志 |
| `VAR_OUTPUT` | `isFull` | `Bool` | 队列已满标志 |
| `VAR_OUTPUT` | `error` | `Bool` | 操作错误标志 |
| `VAR_OUTPUT` | `status` | `Word` | 状态码 |
| `VAR_IN_OUT` | `ioHmi` | `"UDT_HMI_RingFifo"` | HMI交互与参数状态结构体 |

#### 3. 配套 `"UDT_HMI_RingFifo"` 结构体成员定义

| 字段名 | 数据类型 | 默认初始值 | 功能与业务含义 |
| :--- | :---: | :---: | :--- |
| `bManualEnqueue` | `Bool` | `FALSE` | HMI手动入队触发 |
| `bManualDequeue` | `Bool` | `FALSE` | HMI手动出队触发 |
| `bClearCmd` | `Bool` | `FALSE` | HMI清空队列命令 |
| `diManualItemIn` | `DInt` | `0` | HMI手动入队数值 |
| `diLastItemOut` | `DInt` | `0` | 状态反馈：最近出队数值 |
| `diHeadPreview` | `DInt` | `0` | 状态反馈：队首待出队元素预览 |
| `iCount` | `Int` | `0` | 状态反馈：当前队列元素数量 |
| `bIsEmpty` | `Bool` | `FALSE` | 状态反馈：队列空 |
| `bIsFull` | `Bool` | `FALSE` | 状态反馈：队列满 |
| `bError` | `Bool` | `FALSE` | 状态反馈：溢出或下溢错误 |
| `wStatus` | `Word` | `16#0000` | 状态码：16#0000正常, 16#8001满入溢出, 16#8002空出下溢 |

#### 4. PLCopen 标准状态码 (`wStatus`) 与故障诊断

| 状态码 (Word) | 常量符号名称 | 分类 | 详细含义与恢复动作 |
| :---: | :--- | :---: | :--- |
| `16#0000` | `STATUS_OK` | 正常完成 | 触发时 `error := FALSE` |
| `16#8001` | `ERR_QUEUE_FULL` | 操作时序错 | 触发时 `error := TRUE` |
| `16#8002` | `ERR_QUEUE_EMPTY` | 操作时序错 | 触发时 `error := TRUE` |

#### 5. 核心控制逻辑与安全防坑要点
- 1. 清空优先：当 clear OR ioHmi.bClearCmd 为 TRUE 时，重置 statHead := 0, statTail := 0, statCount := 0, statLastOut := 0，并清零 ioHmi.bClearCmd。
- 2. 合并外部与 HMI 入队/出队请求，检测上升沿 tempEnqRise 与 tempDeqRise。
- 3. 入队上升沿：若 statCount >= CAPACITY 则置 ERR_QUEUE_FULL (16#8001)；否则写入 statBuffer[statHead]，statHead := (statHead + 1) MOD CAPACITY_DINT，statCount + 1。
- 4. 出队上升沿：若 statCount <= 0 则置 ERR_QUEUE_EMPTY (16#8002)；否则取出 statBuffer[statTail] 存入 statLastOut，statTail := (statTail + 1) MOD CAPACITY_DINT，statCount - 1。
- 5. 更新队首预览 ioHmi.diHeadPreview（非空时为 statBuffer[statTail]，空时为 0）及所有 Output。


### A06 · `FC_ButtonDebounceToggle`（按钮防抖滤波与单键启停双稳态翻转标准块 FC）

#### 1. 物理资产与追溯路径
- **SCL 源码**：[`FC_ButtonDebounceToggle.scl`](D:/TIA_MCP/benchmarks/golden_library/scl/FC_ButtonDebounceToggle.scl)
- **SimaticML 程序块 XML**：[`FC_ButtonDebounceToggle.xml`](D:/TIA_MCP/benchmarks/golden_library/xml/FC_ButtonDebounceToggle.xml)
- **配套 HMI UDT XML**：[`UDT_HMI_ButtonDebounce.xml`](D:/TIA_MCP/benchmarks/golden_library/udt/UDT_HMI_ButtonDebounce.xml)
- **净室测试向量**：[`FC_ButtonDebounceToggle.json`](D:/TIA_MCP/benchmarks/test_vectors/FC_ButtonDebounceToggle.json)
- **规格追溯矩阵**：[`FC_ButtonDebounceToggle.md`](D:/TIA_MCP/benchmarks/traceability/FC_ButtonDebounceToggle.md)

#### 2. 块接口定义（Interface Table）

| 参数方向 | 形参名称 | 数据类型 | 极性 / 说明 |
| :---: | :--- | :---: | :--- |
| `VAR_INPUT` | `rawButton` | `Bool` | 现场物理按钮原始输入 |
| `VAR_INPUT` | `eStopOk` | `Bool` | 急停正常信号（FALSE 时强制复位翻转输出） |
| `VAR_INPUT` | `reset` | `Bool` | 外部强制复位 |
| `VAR_INPUT` | `scanCycleMs` | `Int` | 当前调用周期毫秒数（如 10ms，<=0 时默认按 10ms 计） |
| `VAR_OUTPUT` | `debouncedOut` | `Bool` | 防抖后的稳定按钮电平 |
| `VAR_OUTPUT` | `risingPulse` | `Bool` | 防抖后单周期上升沿脉冲 |
| `VAR_OUTPUT` | `fallingPulse` | `Bool` | 防抖后单周期下降沿脉冲 |
| `VAR_OUTPUT` | `toggleState` | `Bool` | 单键启停双稳态输出 |
| `VAR_OUTPUT` | `status` | `Word` | 状态码 |
| `VAR_IN_OUT` | `ioHmi` | `"UDT_HMI_ButtonDebounce"` | HMI交互与跨周期状态保持结构体 |

#### 3. 配套 `"UDT_HMI_ButtonDebounce"` 结构体成员定义

| 字段名 | 数据类型 | 默认初始值 | 功能与业务含义 |
| :--- | :---: | :---: | :--- |
| `bHmiToggleCmd` | `Bool` | `FALSE` | HMI软按钮翻转触发 |
| `bHmiForceOn` | `Bool` | `FALSE` | HMI强制置位开机 |
| `bHmiForceOff` | `Bool` | `FALSE` | HMI强制复位关机 |
| `tDebounceTime` | `Time` | `0` | 防抖延时时间设定（默认 T#50ms） |
| `tElapsedMs` | `DInt` | `0` | 内部保持：当前防抖累计毫秒数 |
| `bDebouncedState` | `Bool` | `FALSE` | 状态反馈：防抖后的稳定按钮状态 |
| `bPrevDebounced` | `Bool` | `FALSE` | 内部保持：上一周期防抖状态（用于取沿） |
| `bToggleOut` | `Bool` | `FALSE` | 状态反馈：当前单键启停翻转锁存输出 |
| `wStatus` | `Word` | `16#0000` | 状态码：16#0000正常, 16#8401急停强制释放 |

#### 4. PLCopen 标准状态码 (`wStatus`) 与故障诊断

| 状态码 (Word) | 常量符号名称 | 分类 | 详细含义与恢复动作 |
| :---: | :--- | :---: | :--- |
| `16#0000` | `STATUS_OK` | 正常完成 | 触发时 `error := FALSE` |
| `16#8401` | `ERR_ESTOP` | 外部硬件/超时故障 | 触发时 `error := TRUE` |

#### 5. 核心控制逻辑与安全防坑要点
- 1. 作为纯 FC，跨周期防抖计时与边沿状态全部保存在 InOut 的 ioHmi 结构体中，严禁访问全局 DB 或 M 区。
- 2. 当 rawButton 与 ioHmi.bDebouncedState 不一致时累加 ioHmi.tElapsedMs；达到防抖阈值 tempTargetMs 后更新 ioHmi.bDebouncedState 并清零计时；一致时清零计时。
- 3. 根据 ioHmi.bDebouncedState 与 ioHmi.bPrevDebounced 解算单周期上升沿 tempRise 和下降沿 tempFall，随后更新 bPrevDebounced。
- 4. 双稳态翻转优先级：NOT eStopOk OR reset OR ioHmi.bHmiForceOff (最高优置 FALSE) > ioHmi.bHmiForceOn (置 TRUE) > (tempRise OR ioHmi.bHmiToggleCmd) 翻转 ioHmi.bToggleOut。
- 5. 自动清零单次软触发位 ioHmi.bHmiToggleCmd / bHmiForceOn / bHmiForceOff 并输出所有引脚。


### A07 · `FB_ModbusPoller`（Modbus RTU/TCP 多从站轮询状态调度器标准块 FB）

#### 1. 物理资产与追溯路径
- **SCL 源码**：[`FB_ModbusPoller.scl`](D:/TIA_MCP/benchmarks/golden_library/scl/FB_ModbusPoller.scl)
- **SimaticML 程序块 XML**：[`FB_ModbusPoller.xml`](D:/TIA_MCP/benchmarks/golden_library/xml/FB_ModbusPoller.xml)
- **配套 HMI UDT XML**：[`UDT_HMI_ModbusPoller.xml`](D:/TIA_MCP/benchmarks/golden_library/udt/UDT_HMI_ModbusPoller.xml)
- **净室测试向量**：[`FB_ModbusPoller.json`](D:/TIA_MCP/benchmarks/test_vectors/FB_ModbusPoller.json)
- **规格追溯矩阵**：[`FB_ModbusPoller.md`](D:/TIA_MCP/benchmarks/traceability/FB_ModbusPoller.md)

#### 2. 块接口定义（Interface Table）

| 参数方向 | 形参名称 | 数据类型 | 极性 / 说明 |
| :---: | :--- | :---: | :--- |
| `VAR_INPUT` | `enable` | `Bool` | 轮询调度器使能 |
| `VAR_INPUT` | `reqDone` | `Bool` | 底层 MB_MASTER / MB_CLIENT 完成标志 |
| `VAR_INPUT` | `reqBusy` | `Bool` | 底层通信指令忙标志 |
| `VAR_INPUT` | `reqError` | `Bool` | 底层通信指令错误标志 |
| `VAR_INPUT` | `reqStatus` | `Word` | 底层通信指令错误代码 |
| `VAR_INPUT` | `reset` | `Bool` | 外部故障与统计复位 |
| `VAR_OUTPUT` | `mbReq` | `Bool` | 输出给 MB_MASTER/MB_CLIENT 的 REQ 触发信号 |
| `VAR_OUTPUT` | `currentStation` | `Int` | 当前激活从站号 (1..8) |
| `VAR_OUTPUT` | `busy` | `Bool` | 调度器运行忙 |
| `VAR_OUTPUT` | `error` | `Bool` | 通信超时或从站掉线错误 |
| `VAR_OUTPUT` | `status` | `Word` | PLCopen 状态码 |
| `VAR_IN_OUT` | `ioHmi` | `"UDT_HMI_ModbusPoller"` | HMI交互与参数状态结构体 |

#### 3. 配套 `"UDT_HMI_ModbusPoller"` 结构体成员定义

| 字段名 | 数据类型 | 默认初始值 | 功能与业务含义 |
| :--- | :---: | :---: | :--- |
| `bEnablePoll` | `Bool` | `FALSE` | HMI轮询总使能开关 |
| `bResetStats` | `Bool` | `FALSE` | HMI清零通信统计与故障计数 |
| `iMaxStationCount` | `Int` | `0` | 参与轮询的从站总数 (1..8，默认 4) |
| `iMaxRetryCount` | `Int` | `0` | 单站超时最大重试次数 (0..5，默认 3) |
| `tReplyTimeout` | `Time` | `0` | 单次请求响应超时时间（默认 T#1s） |
| `tInterFrameDelay` | `Time` | `0` | 帧间静默轮询间隔时间（默认 T#50ms） |
| `iActiveStationIdx` | `Int` | `0` | 状态反馈：当前正在轮询的站索引 (1..8) |
| `diSuccessCount` | `DInt` | `0` | 状态反馈：累计成功通信次数 |
| `diErrorCount` | `DInt` | `0` | 状态反馈：累计失败通信次数 |
| `bAnyStationFault` | `Bool` | `FALSE` | 状态反馈：存在从站掉线报警 |
| `wStatus` | `Word` | `16#0000` | 状态码：16#0000一轮完成, 16#7000未激活, 16#7002轮询中, 16#8401从站超时掉线 |

#### 4. PLCopen 标准状态码 (`wStatus`) 与故障诊断

| 状态码 (Word) | 常量符号名称 | 分类 | 详细含义与恢复动作 |
| :---: | :--- | :---: | :--- |
| `16#0000` | `STATUS_FINISHED` | 正常完成 | 触发时 `error := FALSE` |
| `16#7000` | `STATUS_NO_CALL` | 空闲/执行中 | 触发时 `error := FALSE` |
| `16#7002` | `STATUS_BUSY` | 空闲/执行中 | 触发时 `error := FALSE` |
| `16#8401` | `ERR_STATION_TIMEOUT` | 外部硬件/超时故障 | 触发时 `error := TRUE` |

#### 5. 核心控制逻辑与安全防坑要点
- 1. 遵循 PLCopen 状态机设计：在 STATE_SEND_REQ 拉高 mbReq，进入 STATE_WAIT_RESP 等待 reqDone、reqError 或 instTimeoutTimer.Q。
- 2. 若收到 reqDone：累计 diSuccessCount + 1，清零 statRetryCnt，进入 STATE_GAP_WAIT 等待帧间静默后切下一从站。
- 3. 若收到 reqError 或超时：进入 STATE_RETRY，若 statRetryCnt < tempMaxRetries 则重试当前站；否则记录掉线故障 (16#8401)、diErrorCount + 1，并自动跳到下一从站防止单站死锁整条总线！


### A08 · `FB_DualEStopInterlock`（双回路急停双通道同步校验、安全门联锁与受控复位标准块 FB）

#### 1. 物理资产与追溯路径
- **SCL 源码**：[`FB_DualEStopInterlock.scl`](D:/TIA_MCP/benchmarks/golden_library/scl/FB_DualEStopInterlock.scl)
- **SimaticML 程序块 XML**：[`FB_DualEStopInterlock.xml`](D:/TIA_MCP/benchmarks/golden_library/xml/FB_DualEStopInterlock.xml)
- **配套 HMI UDT XML**：[`UDT_HMI_DualEStop.xml`](D:/TIA_MCP/benchmarks/golden_library/udt/UDT_HMI_DualEStop.xml)
- **净室测试向量**：[`FB_DualEStopInterlock.json`](D:/TIA_MCP/benchmarks/test_vectors/FB_DualEStopInterlock.json)
- **规格追溯矩阵**：[`FB_DualEStopInterlock.md`](D:/TIA_MCP/benchmarks/traceability/FB_DualEStopInterlock.md)

#### 2. 块接口定义（Interface Table）

| 参数方向 | 形参名称 | 数据类型 | 极性 / 说明 |
| :---: | :--- | :---: | :--- |
| `VAR_INPUT` | `eStopCh1` | `Bool` | 急停回路通道 1（常闭触点，TRUE=正常） |
| `VAR_INPUT` | `eStopCh2` | `Bool` | 急停回路通道 2（常闭触点，TRUE=正常） |
| `VAR_INPUT` | `safetyGateOk` | `Bool` | 安全防护门联锁开关（常闭触点，TRUE=门已关好） |
| `VAR_INPUT` | `feedbackLoopOk` | `Bool` | 安全继电器/主接触器释放反馈回路（复位前必须为 TRUE） |
| `VAR_INPUT` | `resetButton` | `Bool` | 现场安全复位按钮（仅上升沿有效，防卡死） |
| `VAR_OUTPUT` | `safetyEnableOut` | `Bool` | 主安全使能输出（切断或允许全站执行器） |
| `VAR_OUTPUT` | `resetRequired` | `Bool` | 等待复位指示灯输出 |
| `VAR_OUTPUT` | `discrepancyError` | `Bool` | 双通道不一致（触点粘连/断线）故障 |
| `VAR_OUTPUT` | `error` | `Bool` | 安全未就绪或故障标志 |
| `VAR_OUTPUT` | `status` | `Word` | 状态码 |
| `VAR_IN_OUT` | `ioHmi` | `"UDT_HMI_DualEStop"` | HMI交互与参数状态结构体 |

#### 3. 配套 `"UDT_HMI_DualEStop"` 结构体成员定义

| 字段名 | 数据类型 | 默认初始值 | 功能与业务含义 |
| :--- | :---: | :---: | :--- |
| `bHmiResetCmd` | `Bool` | `FALSE` | HMI安全复位请求（须配合现场双通道正常） |
| `tDiscrepancyTime` | `Time` | `0` | 双通道不同步最大允许差异时间（默认 T#200ms） |
| `bSafeToRun` | `Bool` | `FALSE` | 状态反馈：安全回路已闭合允许运行 |
| `bCh1State` | `Bool` | `FALSE` | 状态反馈：急停通道1状态 |
| `bCh2State` | `Bool` | `FALSE` | 状态反馈：急停通道2状态 |
| `bDiscrepancyFault` | `Bool` | `FALSE` | 状态反馈：双通道不一致触点粘连故障 |
| `bWaitReset` | `Bool` | `FALSE` | 状态反馈：等待人工复位脉冲 |
| `wStatus` | `Word` | `16#0000` | 状态码：16#0000安全闭合, 16#7001等待复位, 16#8401急停按下, 16#8402安全门打开, 16#8403双通道不同步故障 |

#### 4. PLCopen 标准状态码 (`wStatus`) 与故障诊断

| 状态码 (Word) | 常量符号名称 | 分类 | 详细含义与恢复动作 |
| :---: | :--- | :---: | :--- |
| `16#0000` | `STATUS_SAFE_ACTIVE` | 正常完成 | 触发时 `error := FALSE` |
| `16#7001` | `STATUS_WAIT_RESET` | 空闲/执行中 | 触发时 `error := FALSE` |
| `16#8401` | `ERR_ESTOP_PRESSED` | 外部硬件/超时故障 | 触发时 `error := TRUE` |
| `16#8402` | `ERR_GATE_OPEN` | 外部硬件/超时故障 | 触发时 `error := TRUE` |
| `16#8403` | `ERR_DISCREPANCY` | 外部硬件/超时故障 | 触发时 `error := TRUE` |

#### 5. 核心控制逻辑与安全防坑要点
- 1. 任一通道断开 (NOT eStopCh1 OR NOT eStopCh2 OR NOT safetyGateOk) 时，立即无条件切断 statSafetyLatched := FALSE（硬切断）。
- 2. 双通道同步监控：当 eStopCh1 XOR eStopCh2 持续超过 tDiscrepancyTime（默认 T#200ms）时，锁存 statDiscrepancyFault := TRUE 与 statWaitBothZero := TRUE。
- 3. 不同步故障恢复联锁：必须先让 eStopCh1 与 eStopCh2 同时回到 FALSE（完成机械旋出复原），才解除 statWaitBothZero。
- 4. 受控上升沿复位：仅当 eStopCh1 AND eStopCh2 AND safetyGateOk AND feedbackLoopOk AND NOT statDiscrepancyFault，且检测到复位信号上升沿 (tempResetEdge) 时，才置位 statSafetyLatched := TRUE。


---

## 5. Part B：Factory I/O 经典场景专用顺控块全量规格（7 个）

### B01 · `FB_FIO_SortingByHeight`（Factory I/O 高低件识别分拣与双推杆顺控状态机 FB）

#### 1. 物理资产与追溯路径
- **SCL 源码**：[`FB_FIO_SortingByHeight.scl`](D:/TIA_MCP/benchmarks/golden_library/scl/FB_FIO_SortingByHeight.scl)
- **SimaticML 程序块 XML**：[`FB_FIO_SortingByHeight.xml`](D:/TIA_MCP/benchmarks/golden_library/xml/FB_FIO_SortingByHeight.xml)
- **配套 HMI UDT XML**：[`UDT_HMI_FIO_SortingByHeight.xml`](D:/TIA_MCP/benchmarks/golden_library/udt/UDT_HMI_FIO_SortingByHeight.xml)
- **净室测试向量**：[`FB_FIO_SortingByHeight.json`](D:/TIA_MCP/benchmarks/test_vectors/FB_FIO_SortingByHeight.json)
- **规格追溯矩阵**：[`FB_FIO_SortingByHeight.md`](D:/TIA_MCP/benchmarks/traceability/FB_FIO_SortingByHeight.md)

#### 2. 块接口定义（Interface Table）

| 参数方向 | 形参名称 | 数据类型 | 极性 / 说明 |
| :---: | :--- | :---: | :--- |
| `VAR_INPUT` | `eStopOk` | `Bool` | Factory I/O Emergency Stop（常闭，TRUE=正常） |
| `VAR_INPUT` | `startBtn` | `Bool` | Factory I/O Start 按钮（常开，上升沿启动） |
| `VAR_INPUT` | `stopBtn` | `Bool` | Factory I/O Stop 按钮（常闭，FALSE=请求停止） |
| `VAR_INPUT` | `resetBtn` | `Bool` | Factory I/O Reset 按钮（常开，上升沿复位） |
| `VAR_INPUT` | `palletSensor` | `Bool` | 高低探头处托盘到位光电传感器 |
| `VAR_INPUT` | `lowSensor` | `Bool` | 低位光电传感器（高件和低件均遮挡） |
| `VAR_INPUT` | `highSensor` | `Bool` | 高位光电传感器（仅高件遮挡） |
| `VAR_INPUT` | `loadedSensor` | `Bool` | 转接段到位光电传感器 |
| `VAR_INPUT` | `atHighExit` | `Bool` | 高件推杆前光电传感器 |
| `VAR_INPUT` | `atLowExit` | `Bool` | 低件推杆前光电传感器 |
| `VAR_OUTPUT` | `conveyorEntry` | `Bool` | 入口测量段传送带电机 |
| `VAR_OUTPUT` | `conveyorExit` | `Bool` | 分拣主传送带电机 |
| `VAR_OUTPUT` | `loadRoller` | `Bool` | 中间过渡滚筒电机 |
| `VAR_OUTPUT` | `pusherHigh` | `Bool` | 高件分拣推杆执行器 |
| `VAR_OUTPUT` | `pusherLow` | `Bool` | 低件分拣推杆执行器 |
| `VAR_OUTPUT` | `startLight` | `Bool` | 运行指示灯 |
| `VAR_OUTPUT` | `faultLight` | `Bool` | 故障指示灯 |
| `VAR_OUTPUT` | `error` | `Bool` | 故障标志 |
| `VAR_OUTPUT` | `status` | `Word` | 状态码 |
| `VAR_IN_OUT` | `ioHmi` | `"UDT_HMI_FIO_SortingByHeight"` | HMI交互与参数状态结构体 |

#### 3. 配套 `"UDT_HMI_FIO_SortingByHeight"` 结构体成员定义

| 字段名 | 数据类型 | 默认初始值 | 功能与业务含义 |
| :--- | :---: | :---: | :--- |
| `bManualMode` | `Bool` | `FALSE` | TRUE: 手动模式, FALSE: 自动模式 |
| `bStartCmd` | `Bool` | `FALSE` | HMI启动按钮触发 |
| `bStopCmd` | `Bool` | `FALSE` | HMI停止按钮触发 |
| `bResetCmd` | `Bool` | `FALSE` | HMI故障复位触发 |
| `bManualEntryConv` | `Bool` | `FALSE` | 手动驱动入口传送带 |
| `bManualExitConv` | `Bool` | `FALSE` | 手动驱动出口传送带 |
| `bManualPusherHigh` | `Bool` | `FALSE` | 手动伸出高件推杆 |
| `bManualPusherLow` | `Bool` | `FALSE` | 手动伸出低件推杆 |
| `tTransferTimeout` | `Time` | `0` | 分拣滑道传送超时时间（默认 T#8s） |
| `tPusherHoldTime` | `Time` | `0` | 推杆推出保持时间（默认 T#800ms） |
| `iCurrentStep` | `Int` | `0` | 状态反馈：当前顺控步号 |
| `diHighSortedCount` | `DInt` | `0` | 状态反馈：已分拣高件计数 |
| `diLowSortedCount` | `DInt` | `0` | 状态反馈：已分拣低件计数 |
| `bRunning` | `Bool` | `FALSE` | 状态反馈：系统运行中 |
| `bFault` | `Bool` | `FALSE` | 状态反馈：分拣超时或急停故障 |
| `wStatus` | `Word` | `16#0000` | 状态码：16#0000运行正常, 16#7000待机, 16#8401分拣传送超时, 16#8402急停触发 |

#### 4. PLCopen 标准状态码 (`wStatus`) 与故障诊断

| 状态码 (Word) | 常量符号名称 | 分类 | 详细含义与恢复动作 |
| :---: | :--- | :---: | :--- |
| `16#0000` | `STATUS_OK` | 正常完成 | 触发时 `error := FALSE` |
| `16#7000` | `STATUS_IDLE` | 空闲/执行中 | 触发时 `error := FALSE` |
| `16#8401` | `ERR_TIMEOUT` | 外部硬件/超时故障 | 触发时 `error := TRUE` |
| `16#8402` | `ERR_ESTOP` | 外部硬件/超时故障 | 触发时 `error := TRUE` |

#### 5. Factory I/O 官方场景与推荐点位映射表

- **适配官方标准场景**：*Sorting by Height (Basic / Advanced)*

- **配套 UDT**：`UDT_HMI_FIO_SortingByHeight`

| FB 形参名 | 方向 | 类型 | Factory I/O 官方传感器 / 执行器名称 | 极性与说明 |
| :--- | :---: | :---: | :--- | :--- |
| `eStopOk` | Input | `Bool` | `Emergency stop` | **NC（常闭）**：未按下为 `TRUE` |
| `startBtn` | Input | `Bool` | `Start` | **NO（常开）**：按下上升沿启动 |
| `stopBtn` | Input | `Bool` | `Stop` | **NC（常闭）**：未按下为 `TRUE`，按下为 `FALSE` |
| `resetBtn` | Input | `Bool` | `Reset` | **NO（常开）**：按下上升沿复位 |
| `palletSensor` | Input | `Bool` | `Pallet sensor` | 光电：托盘进入高度检测区 |
| `lowSensor` | Input | `Bool` | `Low sensor` | 光电：低件与高件均触发 |
| `highSensor` | Input | `Bool` | `High sensor` | 光电：仅高件触发 |
| `loadedSensor` | Input | `Bool` | `Loaded` | 光电：过渡滚筒到位 |
| `atHighExit` | Input | `Bool` | `At left entry` / `At right entry` | 光电：高件分拣推杆前到位 |
| `atLowExit` | Input | `Bool` | `At right entry` / `At left entry` | 光电：低件分拣推杆前到位 |
| `conveyorEntry` | Output | `Bool` | `Conveyor entry` | 入口测量传送带 |
| `conveyorExit` | Output | `Bool` | `Conveyor exit` | 主分拣传送带 |
| `loadRoller` | Output | `Bool` | `Load` | 过渡上料滚筒 |
| `pusherHigh` | Output | `Bool` | `Transfer left` / `Pusher 1` | 高件分拣推杆/移载机 |
| `pusherLow` | Output | `Bool` | `Transfer right` / `Pusher 2` | 低件分拣推杆/移载机 |
| `startLight` | Output | `Bool` | `Start light` | 运行指示灯 |
| `faultLight` | Output | `Bool` | `Reset light` / `Alarm siren` | 故障指示灯 |

#### 6. 核心控制逻辑与安全防坑要点
- 1. 急停最高优：NOT eStopOk 时立即转入 STEP_FAULT (99)，并在块尾强制切断全部 5 个执行器输出。
- 2. 停止请求不卡步（遵循 siemens-v20-ops §4.6 铁律）：按下停止按钮 (NOT stopBtn OR ioHmi.bStopCmd) 时仅锁存 statStopReq := TRUE，等当前件分拣完成回到 STEP_FEED_DETECT 时优雅停机回 STEP_IDLE。
- 3. STEP_FEED_DETECT (10)：启动入口与出口传送带，当 palletSensor 触发时锁存高度分类（highSensor AND lowSensor 为高件=2；仅 lowSensor 为低件=1），转入 STEP_WAIT_EXIT (20)。
- 4. STEP_WAIT_EXIT (20)：驱动 loadRoller 与 conveyorExit，等待到达对应推杆传感器（高件等 atHighExit，低件等 atLowExit）；超时报 ERR_TIMEOUT (16#8401)。
- 5. STEP_PUSH_HIGH (30) / STEP_PUSH_LOW (40)：触发对应推杆保持 tPusherHoldTime 后缩回，对应计数器 +1，判断 statStopReq 决定回 STEP_IDLE 还是 STEP_FEED_DETECT。


### B02 · `FB_FIO_PickAndPlace`（Factory I/O 气动两轴 X/Z 真空抓手搬运步序控制标准块 FB）

#### 1. 物理资产与追溯路径
- **SCL 源码**：[`FB_FIO_PickAndPlace.scl`](D:/TIA_MCP/benchmarks/golden_library/scl/FB_FIO_PickAndPlace.scl)
- **SimaticML 程序块 XML**：[`FB_FIO_PickAndPlace.xml`](D:/TIA_MCP/benchmarks/golden_library/xml/FB_FIO_PickAndPlace.xml)
- **配套 HMI UDT XML**：[`UDT_HMI_FIO_PickAndPlace.xml`](D:/TIA_MCP/benchmarks/golden_library/udt/UDT_HMI_FIO_PickAndPlace.xml)
- **净室测试向量**：[`FB_FIO_PickAndPlace.json`](D:/TIA_MCP/benchmarks/test_vectors/FB_FIO_PickAndPlace.json)
- **规格追溯矩阵**：[`FB_FIO_PickAndPlace.md`](D:/TIA_MCP/benchmarks/traceability/FB_FIO_PickAndPlace.md)

#### 2. 块接口定义（Interface Table）

| 参数方向 | 形参名称 | 数据类型 | 极性 / 说明 |
| :---: | :--- | :---: | :--- |
| `VAR_INPUT` | `eStopOk` | `Bool` | 急停正常（常闭健康为 TRUE） |
| `VAR_INPUT` | `startBtn` | `Bool` | 启动按钮（上升沿有效） |
| `VAR_INPUT` | `stopBtn` | `Bool` | 停止按钮（常闭健康为 TRUE） |
| `VAR_INPUT` | `resetBtn` | `Bool` | 复位按钮 |
| `VAR_INPUT` | `itemAtEntry` | `Bool` | 入口传送带抓料位到位传感器 |
| `VAR_INPUT` | `itemAtExit` | `Bool` | 出口传送带放料位空闲/通过传感器 |
| `VAR_INPUT` | `itemDetected` | `Bool` | 真空吸盘工件吸附检测传感器 |
| `VAR_INPUT` | `movingX` | `Bool` | X轴正在移动传感器（FALSE表示已到位静止） |
| `VAR_INPUT` | `movingZ` | `Bool` | Z轴正在移动传感器（FALSE表示已到位静止） |
| `VAR_OUTPUT` | `entryConveyor` | `Bool` | 入口上料传送带 |
| `VAR_OUTPUT` | `exitConveyor` | `Bool` | 出口下料传送带 |
| `VAR_OUTPUT` | `moveX` | `Bool` | X轴气缸伸出至放料位（FALSE为缩回抓料位） |
| `VAR_OUTPUT` | `moveZ` | `Bool` | Z轴气缸下降（FALSE为上升安全位） |
| `VAR_OUTPUT` | `grab` | `Bool` | 真空吸盘吸气电磁阀 |
| `VAR_OUTPUT` | `error` | `Bool` | 故障标志 |
| `VAR_OUTPUT` | `status` | `Word` | 状态码 |
| `VAR_IN_OUT` | `ioHmi` | `"UDT_HMI_FIO_PickAndPlace"` | HMI交互与参数状态结构体 |

#### 3. 配套 `"UDT_HMI_FIO_PickAndPlace"` 结构体成员定义

| 字段名 | 数据类型 | 默认初始值 | 功能与业务含义 |
| :--- | :---: | :---: | :--- |
| `bManualMode` | `Bool` | `FALSE` | TRUE: 手动模式, FALSE: 自动模式 |
| `bStartCmd` | `Bool` | `FALSE` | HMI启动触发 |
| `bStopCmd` | `Bool` | `FALSE` | HMI停止触发 |
| `bResetCmd` | `Bool` | `FALSE` | HMI故障复位触发 |
| `bManualMoveX` | `Bool` | `FALSE` | 手动驱动X轴伸出 |
| `bManualMoveZ` | `Bool` | `FALSE` | 手动驱动Z轴下降 |
| `bManualGrab` | `Bool` | `FALSE` | 手动吸盘吸气 |
| `tAxisMoveTime` | `Time` | `0` | 单步气缸动作到位稳定延时（默认 T#600ms） |
| `tStepTimeout` | `Time` | `0` | 单步动作超时报警时间（默认 T#4s） |
| `iCurrentStep` | `Int` | `0` | 状态反馈：当前步序 |
| `diPickedCount` | `DInt` | `0` | 状态反馈：累计搬运完成件数 |
| `bRunning` | `Bool` | `FALSE` | 状态反馈：运行中 |
| `bFault` | `Bool` | `FALSE` | 状态反馈：故障标志 |
| `wStatus` | `Word` | `16#0000` | 状态码：16#0000正常, 16#7000待机, 16#8401动作或抓取超时, 16#8402急停切断 |

#### 4. PLCopen 标准状态码 (`wStatus`) 与故障诊断

| 状态码 (Word) | 常量符号名称 | 分类 | 详细含义与恢复动作 |
| :---: | :--- | :---: | :--- |
| `16#0000` | `STATUS_OK` | 正常完成 | 触发时 `error := FALSE` |
| `16#7000` | `STATUS_IDLE` | 空闲/执行中 | 触发时 `error := FALSE` |
| `16#8401` | `ERR_STEP_TIMEOUT` | 外部硬件/超时故障 | 触发时 `error := TRUE` |
| `16#8402` | `ERR_ESTOP` | 外部硬件/超时故障 | 触发时 `error := TRUE` |

#### 5. Factory I/O 官方场景与推荐点位映射表

- **适配官方标准场景**：*Pick & Place (Basic)*

- **配套 UDT**：`UDT_HMI_FIO_PickAndPlace`

| FB 形参名 | 方向 | 类型 | Factory I/O 官方传感器 / 执行器名称 | 极性与说明 |
| :--- | :---: | :---: | :--- | :--- |
| `eStopOk` | Input | `Bool` | `Emergency stop` | **NC（常闭）** |
| `startBtn` | Input | `Bool` | `Start` | **NO（常开）** |
| `stopBtn` | Input | `Bool` | `Stop` | **NC（常闭）** |
| `resetBtn` | Input | `Bool` | `Reset` | **NO（常开）** |
| `itemAtEntry` | Input | `Bool` | `Item at entry` | 入口抓料位到位光电 |
| `itemAtExit` | Input | `Bool` | `Item at exit` | 出口放料位光电 |
| `itemDetected` | Input | `Bool` | `Item detected` | 吸盘真空吸附到位反馈 |
| `movingX` | Input | `Bool` | `Moving X` | Two-Axis Pick & Place X 轴移动中信号 |
| `movingZ` | Input | `Bool` | `Moving Z` | Two-Axis Pick & Place Z 轴移动中信号 |
| `entryConveyor` | Output | `Bool` | `Entry conveyor` | 入口传送带 |
| `exitConveyor` | Output | `Bool` | `Exit conveyor` | 出口传送带 |
| `moveX` | Output | `Bool` | `Move X` | X 轴伸出驱动 |
| `moveZ` | Output | `Bool` | `Move Z` | Z 轴下降驱动 |
| `grab` | Output | `Bool` | `Grab` | 真空吸盘电磁阀 |

#### 6. 核心控制逻辑与安全防坑要点
- 1. 严格执行两轴防碰撞步序：10送入工件到 itemAtEntry -> 20 Z轴下降 -> 30 开启吸盘并确认 itemDetected -> 40 Z轴上升到位 (NOT movingZ) -> 50 X轴伸出至放料位 (NOT movingX) -> 60 Z轴下降放料 -> 70 关闭吸盘 -> 80 Z轴上升到位 -> 90 X轴缩回原位并计数 +1。
- 2. 防碰撞硬规则：只有当 Z 轴处于高位（moveZ = FALSE 且 NOT movingZ）时才允许改变 X 轴状态；在搬运步 40..60 期间若 itemDetected 意外丢失（掉件），立即转入 STEP_FAULT (99)。
- 3. 急停触发时切断传送带、吸盘并将气缸复归安全态。


### B03 · `FB_FIO_BufferConveyor`（Factory I/O 三段式缓冲传送带防追尾与满料零压积放控制 FB）

#### 1. 物理资产与追溯路径
- **SCL 源码**：[`FB_FIO_BufferConveyor.scl`](D:/TIA_MCP/benchmarks/golden_library/scl/FB_FIO_BufferConveyor.scl)
- **SimaticML 程序块 XML**：[`FB_FIO_BufferConveyor.xml`](D:/TIA_MCP/benchmarks/golden_library/xml/FB_FIO_BufferConveyor.xml)
- **配套 HMI UDT XML**：[`UDT_HMI_FIO_BufferConveyor.xml`](D:/TIA_MCP/benchmarks/golden_library/udt/UDT_HMI_FIO_BufferConveyor.xml)
- **净室测试向量**：[`FB_FIO_BufferConveyor.json`](D:/TIA_MCP/benchmarks/test_vectors/FB_FIO_BufferConveyor.json)
- **规格追溯矩阵**：[`FB_FIO_BufferConveyor.md`](D:/TIA_MCP/benchmarks/traceability/FB_FIO_BufferConveyor.md)

#### 2. 块接口定义（Interface Table）

| 参数方向 | 形参名称 | 数据类型 | 极性 / 说明 |
| :---: | :--- | :---: | :--- |
| `VAR_INPUT` | `eStopOk` | `Bool` | 急停正常（常闭健康为 TRUE） |
| `VAR_INPUT` | `startBtn` | `Bool` | 启动按钮 |
| `VAR_INPUT` | `stopBtn` | `Bool` | 停止按钮（常闭健康为 TRUE） |
| `VAR_INPUT` | `resetBtn` | `Bool` | 复位按钮 |
| `VAR_INPUT` | `sensorZ1` | `Bool` | 第1段缓冲带末端光电传感器（TRUE=有工件） |
| `VAR_INPUT` | `sensorZ2` | `Bool` | 第2段缓冲带末端光电传感器（TRUE=有工件） |
| `VAR_INPUT` | `sensorZ3` | `Bool` | 第3段缓冲带末端光电传感器（TRUE=有工件） |
| `VAR_INPUT` | `downstreamReady` | `Bool` | 下游工位允许接收信号 |
| `VAR_OUTPUT` | `conv1` | `Bool` | 1号缓冲传送带电机 |
| `VAR_OUTPUT` | `conv2` | `Bool` | 2号缓冲传送带电机 |
| `VAR_OUTPUT` | `conv3` | `Bool` | 3号缓冲传送带电机 |
| `VAR_OUTPUT` | `stopBlade1` | `Bool` | 1号阻挡气缸刀片（TRUE=升起阻挡） |
| `VAR_OUTPUT` | `stopBlade2` | `Bool` | 2号阻挡气缸刀片（TRUE=升起阻挡） |
| `VAR_OUTPUT` | `upstreamReady` | `Bool` | 向上游发送允许进料信号 |
| `VAR_OUTPUT` | `bufferFull` | `Bool` | 三段缓冲全满指示 |
| `VAR_OUTPUT` | `error` | `Bool` | 卡料或急停故障 |
| `VAR_OUTPUT` | `status` | `Word` | 状态码 |
| `VAR_IN_OUT` | `ioHmi` | `"UDT_HMI_FIO_BufferConveyor"` | HMI交互与参数状态结构体 |

#### 3. 配套 `"UDT_HMI_FIO_BufferConveyor"` 结构体成员定义

| 字段名 | 数据类型 | 默认初始值 | 功能与业务含义 |
| :--- | :---: | :---: | :--- |
| `bManualMode` | `Bool` | `FALSE` | TRUE手动, FALSE自动 |
| `bStartCmd` | `Bool` | `FALSE` | HMI启动命令 |
| `bStopCmd` | `Bool` | `FALSE` | HMI停止命令 |
| `bResetCmd` | `Bool` | `FALSE` | HMI复位命令 |
| `bManualConv1` | `Bool` | `FALSE` | 手动驱动1号缓冲带 |
| `bManualConv2` | `Bool` | `FALSE` | 手动驱动2号缓冲带 |
| `bManualConv3` | `Bool` | `FALSE` | 手动驱动3号缓冲带 |
| `tJamTimeout` | `Time` | `0` | 光电长遮挡卡料超时阈值（默认 T#6s） |
| `iOccupiedZones` | `Int` | `0` | 状态反馈：当前被占用的缓冲区段数 (0..3) |
| `bBufferFull` | `Bool` | `FALSE` | 状态反馈：三级缓冲全满标志 |
| `bJamFault` | `Bool` | `FALSE` | 状态反馈：传送带卡料报警 |
| `wStatus` | `Word` | `16#0000` | 状态码：16#0000正常, 16#7000停机, 16#8401卡料超时, 16#8402急停触发 |

#### 4. PLCopen 标准状态码 (`wStatus`) 与故障诊断

| 状态码 (Word) | 常量符号名称 | 分类 | 详细含义与恢复动作 |
| :---: | :--- | :---: | :--- |
| `16#0000` | `STATUS_OK` | 正常完成 | 触发时 `error := FALSE` |
| `16#7000` | `STATUS_IDLE` | 空闲/执行中 | 触发时 `error := FALSE` |
| `16#8401` | `ERR_JAM` | 外部硬件/超时故障 | 触发时 `error := TRUE` |
| `16#8402` | `ERR_ESTOP` | 外部硬件/超时故障 | 触发时 `error := TRUE` |

#### 5. Factory I/O 官方场景与推荐点位映射表

- **适配官方标准场景**：*Buffer Station*

- **配套 UDT**：`UDT_HMI_FIO_BufferConveyor`

| FB 形参名 | 方向 | 类型 | Factory I/O 官方传感器 / 执行器名称 | 极性与说明 |
| :--- | :---: | :---: | :--- | :--- |
| `eStopOk` | Input | `Bool` | `Emergency stop` | **NC（常闭）** |
| `startBtn` | Input | `Bool` | `Start` | **NO（常开）** |
| `stopBtn` | Input | `Bool` | `Stop` | **NC（常闭）** |
| `resetBtn` | Input | `Bool` | `Reset` | **NO（常开）** |
| `sensorZ1` | Input | `Bool` | `At entry` / `Zone 1 sensor` | 第 1 段缓冲带末端光电 |
| `sensorZ2` | Input | `Bool` | `Middle sensor` / `Zone 2 sensor` | 第 2 段缓冲带末端光电 |
| `sensorZ3` | Input | `Bool` | `At exit` / `Zone 3 sensor` | 第 3 段缓冲带末端光电 |
| `downstreamReady` | Input | `Bool` | 下游工位允许进料联锁 | `TRUE` = 允许第 3 段放行出料 |
| `conv1`..`conv3` | Output | `Bool` | `Buffer conveyor 1..3` | 1~3 号缓冲传送带电机 |
| `stopBlade1`..`2` | Output | `Bool` | `Stop blade 1..2` | 阻挡刀片气缸（`TRUE` 升起阻挡） |
| `upstreamReady` | Output | `Bool` | 上游允许进料信号 | 缓冲未满且运行正常时为 `TRUE` |

#### 6. 核心控制逻辑与安全防坑要点
- 1. 零压力积放防追尾逻辑（Zero-Pressure Accumulation）：
-    - Z3 驻留条件 tempZ3Hold := sensorZ3 AND NOT downstreamReady；否则 conv3 运行放行。
-    - Z2 驻留条件 tempZ2Hold := sensorZ2 AND tempZ3Hold（前段驻留时本段到位即停并升起 stopBlade2）；否则 conv2 运行。
-    - Z1 驻留条件 tempZ1Hold := sensorZ1 AND tempZ2Hold（Z2 与 Z3 均驻留时 Z1 到位即停并升起 stopBlade1）；否则 conv1 运行。
- 2. 当某段传送带正在运行且其末端光电持续被遮挡超过 tJamTimeout 时，判定为传送卡死报 ERR_JAM (16#8401) 并停机。
- 3. upstreamReady := statRunning AND NOT tempZ1Hold AND NOT statJamError AND eStopOk。


### B04 · `FB_FIO_Turntable`（Factory I/O 90度旋转分流转盘双工位对接顺控标准块 FB）

#### 1. 物理资产与追溯路径
- **SCL 源码**：[`FB_FIO_Turntable.scl`](D:/TIA_MCP/benchmarks/golden_library/scl/FB_FIO_Turntable.scl)
- **SimaticML 程序块 XML**：[`FB_FIO_Turntable.xml`](D:/TIA_MCP/benchmarks/golden_library/xml/FB_FIO_Turntable.xml)
- **配套 HMI UDT XML**：[`UDT_HMI_FIO_Turntable.xml`](D:/TIA_MCP/benchmarks/golden_library/udt/UDT_HMI_FIO_Turntable.xml)
- **净室测试向量**：[`FB_FIO_Turntable.json`](D:/TIA_MCP/benchmarks/test_vectors/FB_FIO_Turntable.json)
- **规格追溯矩阵**：[`FB_FIO_Turntable.md`](D:/TIA_MCP/benchmarks/traceability/FB_FIO_Turntable.md)

#### 2. 块接口定义（Interface Table）

| 参数方向 | 形参名称 | 数据类型 | 极性 / 说明 |
| :---: | :--- | :---: | :--- |
| `VAR_INPUT` | `eStopOk` | `Bool` | 急停正常（常闭健康为 TRUE） |
| `VAR_INPUT` | `startBtn` | `Bool` | 启动按钮 |
| `VAR_INPUT` | `stopBtn` | `Bool` | 停止按钮（常闭健康为 TRUE） |
| `VAR_INPUT` | `resetBtn` | `Bool` | 复位按钮 |
| `VAR_INPUT` | `routeSelect90` | `Bool` | 外部路由请求：TRUE分流至90度支线，FALSE直通 |
| `VAR_INPUT` | `atEntry` | `Bool` | 入口传送带末端待进盘光电 |
| `VAR_INPUT` | `limit0` | `Bool` | 转盘 0 度原位限位开关 |
| `VAR_INPUT` | `limit90` | `Bool` | 转盘 90 度旋转到位限位开关 |
| `VAR_INPUT` | `frontLimit` | `Bool` | 转盘内托盘前端到位光电 |
| `VAR_INPUT` | `backLimit` | `Bool` | 转盘内托盘后端到位光电 |
| `VAR_INPUT` | `atExit0` | `Bool` | 0度直通出口离开光电 |
| `VAR_INPUT` | `atExit90` | `Bool` | 90度分流出口离开光电 |
| `VAR_OUTPUT` | `entryConveyor` | `Bool` | 入口传送带电机 |
| `VAR_OUTPUT` | `exitConveyor0` | `Bool` | 0度直通出口传送带电机 |
| `VAR_OUTPUT` | `exitConveyor90` | `Bool` | 90度分流出口传送带电机 |
| `VAR_OUTPUT` | `turnTable` | `Bool` | 转盘90度旋转驱动（FALSE回0度，TRUE转90度） |
| `VAR_OUTPUT` | `rollPlus` | `Bool` | 转盘台面滚筒正向驱动 |
| `VAR_OUTPUT` | `rollMinus` | `Bool` | 转盘台面滚筒反向驱动 |
| `VAR_OUTPUT` | `error` | `Bool` | 故障标志 |
| `VAR_OUTPUT` | `status` | `Word` | 状态码 |
| `VAR_IN_OUT` | `ioHmi` | `"UDT_HMI_FIO_Turntable"` | HMI交互与参数状态结构体 |

#### 3. 配套 `"UDT_HMI_FIO_Turntable"` 结构体成员定义

| 字段名 | 数据类型 | 默认初始值 | 功能与业务含义 |
| :--- | :---: | :---: | :--- |
| `bManualMode` | `Bool` | `FALSE` | TRUE手动, FALSE自动 |
| `bStartCmd` | `Bool` | `FALSE` | HMI启动命令 |
| `bStopCmd` | `Bool` | `FALSE` | HMI停止命令 |
| `bResetCmd` | `Bool` | `FALSE` | HMI故障复位 |
| `bRouteTo90Deg` | `Bool` | `FALSE` | 分流路由选择：TRUE=旋转90度侧向出料, FALSE=0度直通出料 |
| `bManualTurn` | `Bool` | `FALSE` | 手动驱动转盘旋转至90度 |
| `bManualRollPlus` | `Bool` | `FALSE` | 手动驱动转盘滚筒正转 |
| `tActionTimeout` | `Time` | `0` | 转盘旋转/进出料超时时间（默认 T#5s） |
| `iCurrentStep` | `Int` | `0` | 状态反馈：当前步序 |
| `diRoutedCount` | `DInt` | `0` | 状态反馈：累计通过托盘数 |
| `bFault` | `Bool` | `FALSE` | 状态反馈：故障标志 |
| `wStatus` | `Word` | `16#0000` | 状态码：16#0000正常, 16#7000待机, 16#8401转盘动作超时, 16#8402急停触发 |

#### 4. PLCopen 标准状态码 (`wStatus`) 与故障诊断

| 状态码 (Word) | 常量符号名称 | 分类 | 详细含义与恢复动作 |
| :---: | :--- | :---: | :--- |
| `16#0000` | `STATUS_OK` | 正常完成 | 触发时 `error := FALSE` |
| `16#7000` | `STATUS_IDLE` | 空闲/执行中 | 触发时 `error := FALSE` |
| `16#8401` | `ERR_TIMEOUT` | 外部硬件/超时故障 | 触发时 `error := TRUE` |
| `16#8402` | `ERR_ESTOP` | 外部硬件/超时故障 | 触发时 `error := TRUE` |

#### 5. Factory I/O 官方场景与推荐点位映射表

- **适配官方标准场景**：*Sorting Station with Turntable*

- **配套 UDT**：`UDT_HMI_FIO_Turntable`

| FB 形参名 | 方向 | 类型 | Factory I/O 官方传感器 / 执行器名称 | 极性与说明 |
| :--- | :---: | :---: | :--- | :--- |
| `eStopOk` | Input | `Bool` | `Emergency stop` | **NC（常闭）** |
| `startBtn` / `stopBtn` / `resetBtn` | Input | `Bool` | `Start` / `Stop` (NC) / `Reset` | 标准操作盒按钮 |
| `routeSelect90` | Input | `Bool` | 分流方向选择信号 | `FALSE`: 0°直通, `TRUE`: 90°旋转分流 |
| `atEntry` | Input | `Bool` | `Entry sensor` | 转盘前待进盘光电 |
| `limit0` | Input | `Bool` | `Limit 0` | 转盘 0° 原位反馈 |
| `limit90` | Input | `Bool` | `Limit 90` | 转盘 90° 到位反馈 |
| `frontLimit` / `backLimit` | Input | `Bool` | `Front limit` / `Back limit` | 转盘台面前端/后端到位光电 |
| `atExit0` / `atExit90` | Input | `Bool` | `Exit 0 sensor` / `Exit 90 sensor` | 0° 与 90° 出口完成光电 |
| `entryConveyor` | Output | `Bool` | `Entry conveyor` | 入口传送带 |
| `exitConveyor0` / `exitConveyor90` | Output | `Bool` | `Exit conveyor 0` / `Exit conveyor 90` | 两个方向出口传送带 |
| `turnTable` | Output | `Bool` | `Turn` | 转盘 90° 旋转驱动 |
| `rollPlus` / `rollMinus` | Output | `Bool` | `Roll (+)` / `Roll (-)` | 转盘台面滚筒正反转 |

#### 6. 核心控制逻辑与安全防坑要点
- 1. 机械防撞联锁：转盘正在旋转（NOT limit0 AND NOT limit90）时严禁开启 rollPlus/rollMinus 台面滚筒；托盘正在进出转盘时严禁切换 turnTable 旋转状态。
- 2. 步序：10确认 limit0 原位 -> 20等待 atEntry -> 30同时开启 entryConveyor 与 rollPlus 将托盘送入转盘直到 frontLimit 触发 -> 根据路由选择转入 50(直通出料至 atExit0) 或 40(旋转至 limit90) -> 60(开启 rollPlus 与 exitConveyor90 出料至 atExit90) -> 70(回转至 limit0)。
- 3. 任一动作步超过 tActionTimeout（默认 T#5s）立即转入 STEP_FAULT (99) 并报 16#8401。


### B05 · `FB_FIO_AutomatedWarehouse`（Factory I/O 立体仓库堆垛机（Stacker Crane）取放料状态机标准块 FB）

#### 1. 物理资产与追溯路径
- **SCL 源码**：[`FB_FIO_AutomatedWarehouse.scl`](D:/TIA_MCP/benchmarks/golden_library/scl/FB_FIO_AutomatedWarehouse.scl)
- **SimaticML 程序块 XML**：[`FB_FIO_AutomatedWarehouse.xml`](D:/TIA_MCP/benchmarks/golden_library/xml/FB_FIO_AutomatedWarehouse.xml)
- **配套 HMI UDT XML**：[`UDT_HMI_FIO_Warehouse.xml`](D:/TIA_MCP/benchmarks/golden_library/udt/UDT_HMI_FIO_Warehouse.xml)
- **净室测试向量**：[`FB_FIO_AutomatedWarehouse.json`](D:/TIA_MCP/benchmarks/test_vectors/FB_FIO_AutomatedWarehouse.json)
- **规格追溯矩阵**：[`FB_FIO_AutomatedWarehouse.md`](D:/TIA_MCP/benchmarks/traceability/FB_FIO_AutomatedWarehouse.md)

#### 2. 块接口定义（Interface Table）

| 参数方向 | 形参名称 | 数据类型 | 极性 / 说明 |
| :---: | :--- | :---: | :--- |
| `VAR_INPUT` | `eStopOk` | `Bool` | 急停正常（常闭健康为 TRUE） |
| `VAR_INPUT` | `execute` | `Bool` | 触发单次入库/出库作业（上升沿） |
| `VAR_INPUT` | `modeRetrieve` | `Bool` | FALSE: 入库(从I/O台到库位), TRUE: 出库(从库位到I/O台) |
| `VAR_INPUT` | `targetCell` | `Int` | 目标库位编号 (1..54) |
| `VAR_INPUT` | `atEntry` | `Bool` | 入库上料台托盘到位光电 |
| `VAR_INPUT` | `atExit` | `Bool` | 出库下料台空闲光电（FALSE表示空闲可放料） |
| `VAR_INPUT` | `movingX` | `Bool` | 堆垛机X轴移动中反馈 |
| `VAR_INPUT` | `movingZ` | `Bool` | 堆垛机Z轴移动中反馈 |
| `VAR_INPUT` | `atLeft` | `Bool` | 货叉左伸（上料侧）到位限位 |
| `VAR_INPUT` | `atMiddle` | `Bool` | 货叉中位（安全居中）限位 |
| `VAR_INPUT` | `atRight` | `Bool` | 货叉右伸（货架侧/下料侧）到位限位 |
| `VAR_INPUT` | `reset` | `Bool` | 故障复位 |
| `VAR_OUTPUT` | `targetPosition` | `Int` | 堆垛机目标位置给定（0=上/下料位, 1..54=货架库位, 55=归位） |
| `VAR_OUTPUT` | `forksLeft` | `Bool` | 货叉向左伸出（取上料台托盘） |
| `VAR_OUTPUT` | `forksRight` | `Bool` | 货叉向右伸出（存/取货架或放料台） |
| `VAR_OUTPUT` | `lift` | `Bool` | 货叉微升（TRUE=抬起托盘，FALSE=落下托盘） |
| `VAR_OUTPUT` | `done` | `Bool` | 单次存取作业完成 |
| `VAR_OUTPUT` | `busy` | `Bool` | 作业执行中 |
| `VAR_OUTPUT` | `error` | `Bool` | 故障标志 |
| `VAR_OUTPUT` | `status` | `Word` | PLCopen 状态码 |
| `VAR_IN_OUT` | `ioHmi` | `"UDT_HMI_FIO_Warehouse"` | HMI交互与参数状态结构体 |

#### 3. 配套 `"UDT_HMI_FIO_Warehouse"` 结构体成员定义

| 字段名 | 数据类型 | 默认初始值 | 功能与业务含义 |
| :--- | :---: | :---: | :--- |
| `bExecuteCmd` | `Bool` | `FALSE` | HMI触发单次存取库作业（上升沿有效） |
| `bModeRetrieve` | `Bool` | `FALSE` | 作业模式：FALSE=入库(Store), TRUE=出库(Retrieve) |
| `bResetCmd` | `Bool` | `FALSE` | HMI故障复位命令 |
| `iTargetCell` | `Int` | `0` | HMI设定目标库位号 (1..54) |
| `tAxisSettleTime` | `Time` | `0` | 升降/伸缩到位稳定延时（默认 T#800ms） |
| `tMoveTimeout` | `Time` | `0` | 堆垛机寻址移动超时阈值（默认 T#10s） |
| `iCurrentStep` | `Int` | `0` | 状态反馈：当前状态机步号 |
| `iActiveTargetPos` | `Int` | `0` | 状态反馈：当前输出给堆垛机的目标位置 |
| `diStoredCount` | `DInt` | `0` | 状态反馈：累计入库完成数 |
| `diRetrievedCount` | `DInt` | `0` | 状态反馈：累计出库完成数 |
| `bBusy` | `Bool` | `FALSE` | 状态反馈：堆垛机作业忙 |
| `bDone` | `Bool` | `FALSE` | 状态反馈：作业完成 |
| `bFault` | `Bool` | `FALSE` | 状态反馈：故障标志 |
| `wStatus` | `Word` | `16#0000` | 状态码：16#0000完成, 16#7000空闲, 16#7002执行中, 16#8200库位号越界, 16#8401动作超时, 16#8402急停触发 |

#### 4. PLCopen 标准状态码 (`wStatus`) 与故障诊断

| 状态码 (Word) | 常量符号名称 | 分类 | 详细含义与恢复动作 |
| :---: | :--- | :---: | :--- |
| `16#0000` | `STATUS_FINISHED` | 正常完成 | 触发时 `error := FALSE` |
| `16#7000` | `STATUS_NO_CALL` | 空闲/执行中 | 触发时 `error := FALSE` |
| `16#7002` | `STATUS_BUSY` | 空闲/执行中 | 触发时 `error := FALSE` |
| `16#8200` | `ERR_CELL_RANGE` | 参数配置错 | 触发时 `error := TRUE` |
| `16#8401` | `ERR_TIMEOUT` | 外部硬件/超时故障 | 触发时 `error := TRUE` |
| `16#8402` | `ERR_ESTOP` | 外部硬件/超时故障 | 触发时 `error := TRUE` |

#### 5. Factory I/O 官方场景与推荐点位映射表

- **适配官方标准场景**：*Automated Warehouse*

- **配套 UDT**：`UDT_HMI_FIO_Warehouse`

| FB 形参名 | 方向 | 类型 | Factory I/O 官方传感器 / 执行器名称 | 极性与说明 |
| :--- | :---: | :---: | :--- | :--- |
| `eStopOk` | Input | `Bool` | `Emergency stop` | **NC（常闭）** |
| `execute` | Input | `Bool` | 作业触发脉冲 | 上升沿启动一次入库或出库 |
| `modeRetrieve` | Input | `Bool` | 存取模式 | `FALSE`=入库(Store), `TRUE`=出库(Retrieve) |
| `targetCell` | Input | `Int` | 目标库位号 | `1..54`（对应 9列×6层 货架） |
| `atEntry` / `atExit` | Input | `Bool` | `At load` / `At unload` | 进出料台光电 |
| `movingX` / `movingZ` | Input | `Bool` | `Moving X` / `Moving Z` | 堆垛机 X/Z 轴移动中状态 |
| `atLeft` / `atMiddle` / `atRight` | Input | `Bool` | `At left` / `At middle` / `At right` | 堆垛机双向货叉左/中/右限位 |
| `targetPosition` | Output | `Int` | `Target position` | 堆垛机目标位置（`1..54` 库位，`55` 进出料台） |
| `forksLeft` / `forksRight` | Output | `Bool` | `Forks left` / `Forks right` | 货叉左伸 / 右伸驱动 |
| `lift` | Output | `Bool` | `Lift` | 货叉抬升驱动 |

#### 6. 核心控制逻辑与安全防坑要点
- 1. 参数合法性前置校验 (SE001)：上升沿触发时检查 targetCell 是否在 1..54 之间，越界直接报 ERR_CELL_RANGE (16#8200)。
- 2. 堆垛机防撞核心铁律：只有当货叉完全居中 (atMiddle = TRUE 且 forksLeft = FALSE 且 forksRight = FALSE) 时才允许改变 targetPosition！
- 3. 入库模式 (statIsRetrieve = FALSE)：10移至上料位(55)且 lift:=FALSE -> 20伸左叉(forksLeft)至 atLeft -> 30微升(lift:=TRUE)稳定 -> 40缩叉回中位(atMiddle) -> 50移至目标库位(statCell) -> 60伸右叉(forksRight)至 atRight -> 70微降(lift:=FALSE)放下托盘 -> 80缩叉回中位(atMiddle) -> 90完成。
- 4. 出库模式 (statIsRetrieve = TRUE)：10移至目标库位(statCell)且 lift:=FALSE -> 20伸右叉至 atRight -> 30微升(lift:=TRUE)托起 -> 40缩叉回中位 -> 50移至下料位(55) -> 60伸右叉至 atRight -> 70微降放下 -> 80缩叉回中位 -> 90完成。


### B06 · `FB_FIO_TankLevelPID`（Factory I/O 水箱液位进出水比例调节阀抗积分饱和 PID 闭环控制块 FB）

#### 1. 物理资产与追溯路径
- **SCL 源码**：[`FB_FIO_TankLevelPID.scl`](D:/TIA_MCP/benchmarks/golden_library/scl/FB_FIO_TankLevelPID.scl)
- **SimaticML 程序块 XML**：[`FB_FIO_TankLevelPID.xml`](D:/TIA_MCP/benchmarks/golden_library/xml/FB_FIO_TankLevelPID.xml)
- **配套 HMI UDT XML**：[`UDT_HMI_FIO_TankLevelPID.xml`](D:/TIA_MCP/benchmarks/golden_library/udt/UDT_HMI_FIO_TankLevelPID.xml)
- **净室测试向量**：[`FB_FIO_TankLevelPID.json`](D:/TIA_MCP/benchmarks/test_vectors/FB_FIO_TankLevelPID.json)
- **规格追溯矩阵**：[`FB_FIO_TankLevelPID.md`](D:/TIA_MCP/benchmarks/traceability/FB_FIO_TankLevelPID.md)

#### 2. 块接口定义（Interface Table）

| 参数方向 | 形参名称 | 数据类型 | 极性 / 说明 |
| :---: | :--- | :---: | :--- |
| `VAR_INPUT` | `eStopOk` | `Bool` | 急停正常（FALSE时立即关闭进水阀） |
| `VAR_INPUT` | `enable` | `Bool` | 控制器运行使能 |
| `VAR_INPUT` | `levelMeterV` | `Real` | Factory I/O 液位计电压输入 (0.0..10.0V 对应 0..300cm) |
| `VAR_INPUT` | `flowMeterV` | `Real` | 出水流量计电压输入 (0.0..10.0V) |
| `VAR_INPUT` | `setpointCm` | `Real` | 外部液位设定值 (0.0..300.0 cm) |
| `VAR_INPUT` | `dtSec` | `Real` | 控制周期时间（秒，如 0.1s） |
| `VAR_INPUT` | `reset` | `Bool` | 复位积分累计与报警 |
| `VAR_OUTPUT` | `fillValveV` | `Real` | 进水比例阀模拟量电压输出 (0.0..10.0V) |
| `VAR_OUTPUT` | `dischargeValveV` | `Real` | 出水比例阀模拟量电压输出 (0.0..10.0V) |
| `VAR_OUTPUT` | `levelCm` | `Real` | 换算后的当前液位高度 (cm) |
| `VAR_OUTPUT` | `highLevelAlarm` | `Bool` | 高液位超限报警 (>= 285.0cm) |
| `VAR_OUTPUT` | `lowLevelAlarm` | `Bool` | 低液位报警 (<= 10.0cm) |
| `VAR_OUTPUT` | `error` | `Bool` | 故障标志 |
| `VAR_OUTPUT` | `status` | `Word` | 状态码 |
| `VAR_IN_OUT` | `ioHmi` | `"UDT_HMI_FIO_TankLevelPID"` | HMI交互与参数状态结构体 |

#### 3. 配套 `"UDT_HMI_FIO_TankLevelPID"` 结构体成员定义

| 字段名 | 数据类型 | 默认初始值 | 功能与业务含义 |
| :--- | :---: | :---: | :--- |
| `bManualMode` | `Bool` | `FALSE` | TRUE: 手动开度给定模式, FALSE: 自动PID闭环模式 |
| `bResetCmd` | `Bool` | `FALSE` | HMI复位积分项与报警 |
| `rSetpoint` | `Real` | `0.0` | 液位设定值 SP (0.0..300.0 cm，默认 150.0) |
| `rKp` | `Real` | `0.0` | 比例增益 Kp (默认 2.0) |
| `rKi` | `Real` | `0.0` | 积分增益 Ki (1/s，默认 0.2) |
| `rKd` | `Real` | `0.0` | 微分增益 Kd (s，默认 0.05) |
| `rDeadband` | `Real` | `0.0` | 稳态误差死区 (cm，默认 0.5) |
| `rManualFillValve` | `Real` | `0.0` | 手动进水阀开度给定 (0.0..10.0V) |
| `rManualDischargeValve` | `Real` | `0.0` | 手动排水阀开度给定 (0.0..10.0V) |
| `rCurrentLevel` | `Real` | `0.0` | 状态反馈：当前实际液位 PV (0.0..300.0 cm) |
| `rControlError` | `Real` | `0.0` | 状态反馈：当前偏差 e = SP - PV |
| `rFillValveOut` | `Real` | `0.0` | 状态反馈：进水比例阀输出电压 (0.0..10.0V) |
| `rDischargeValveOut` | `Real` | `0.0` | 状态反馈：排水比例阀输出电压 (0.0..10.0V) |
| `bHighLevelAlarm` | `Bool` | `FALSE` | 状态反馈：高液位溢流联锁报警 |
| `bLowLevelAlarm` | `Bool` | `FALSE` | 状态反馈：低液位干烧报警 |
| `wStatus` | `Word` | `16#0000` | 状态码：16#0000正常, 16#7000停机, 16#8200采样周期非法, 16#8401高液位溢流保护, 16#8402急停切断 |

#### 4. PLCopen 标准状态码 (`wStatus`) 与故障诊断

| 状态码 (Word) | 常量符号名称 | 分类 | 详细含义与恢复动作 |
| :---: | :--- | :---: | :--- |
| `16#0000` | `STATUS_OK` | 正常完成 | 触发时 `error := FALSE` |
| `16#7000` | `STATUS_IDLE` | 空闲/执行中 | 触发时 `error := FALSE` |
| `16#8200` | `ERR_DT_INVALID` | 参数配置错 | 触发时 `error := TRUE` |
| `16#8401` | `ERR_OVERFLOW_PROT` | 外部硬件/超时故障 | 触发时 `error := TRUE` |
| `16#8402` | `ERR_ESTOP` | 外部硬件/超时故障 | 触发时 `error := TRUE` |

#### 5. Factory I/O 官方场景与推荐点位映射表

- **适配官方标准场景**：*Level Control*

- **配套 UDT**：`UDT_HMI_FIO_TankLevelPID`

| FB 形参名 | 方向 | 类型 | Factory I/O 官方传感器 / 执行器名称 | 极性与说明 |
| :--- | :---: | :---: | :--- | :--- |
| `eStopOk` | Input | `Bool` | `Emergency stop` | **NC（常闭）** |
| `enable` | Input | `Bool` | 控制器使能 | `TRUE` 开启闭环或手动输出 |
| `levelMeterV` | Input | `Real` | `Level meter` (0.0–10.0V) | 对应 0.0–300.0 cm 液位 |
| `flowMeterV` | Input | `Real` | `Flow meter` (0.0–10.0V) | 出水流量计反馈 |
| `setpointCm` | Input | `Real` | `Setpoint` (0.0–300.0 cm) | 目标液位高度设定 |
| `dtSec` | Input | `Real` | 采样周期（秒） | 如 `0.1` 秒 |
| `fillValveV` | Output | `Real` | `Fill valve` (0.0–10.0V) | 进水比例调节阀电压输出 |
| `dischargeValveV` | Output | `Real` | `Discharge valve` (0.0–10.0V) | 排水比例调节阀电压输出 |
| `levelCm` | Output | `Real` | 标定后实际液位 (cm) | 供监控与趋势图使用 |

#### 6. 核心控制逻辑与安全防坑要点
- 1. 换算液位：tempLevelCm := LIMIT(MN := 0.0, IN := levelMeterV * 30.0, MX := 300.0)。
- 2. 急停或未使能时：fillValveV := 0.0, dischargeValveV := 0.0，statIntegral := 0.0。
- 3. 参数校验：dtSec <= 0.0 时报 ERR_DT_INVALID (16#8200) 并安全关闭阀门。
- 4. 手动切自动无扰切换（Bumpless Transfer）：当 ioHmi.bManualMode 从 TRUE 变为 FALSE 时，将 statIntegral 初始化为当前手动阀门开度差 (rManualFillValve - rManualDischargeValve)。
- 5. 双极性分程控制（Split-Range PID）与抗积分饱和：PID 输出在 [-10.0, +10.0] 限幅，>0 时驱动进水阀 fillValveV (0..10V) 且排水阀为 0V；<0 时驱动排水阀 dischargeValveV (0..10V) 且进水阀为 0V。高液位 (>=285cm) 硬联锁强制关死进水阀 (fillValveV := 0.0) 防溢流！


### B07 · `FB_FIO_Assembler`（Factory I/O 双工位底座（Base）与盖板（Lid）抓取装配顺控标准块 FB）

#### 1. 物理资产与追溯路径
- **SCL 源码**：[`FB_FIO_Assembler.scl`](D:/TIA_MCP/benchmarks/golden_library/scl/FB_FIO_Assembler.scl)
- **SimaticML 程序块 XML**：[`FB_FIO_Assembler.xml`](D:/TIA_MCP/benchmarks/golden_library/xml/FB_FIO_Assembler.xml)
- **配套 HMI UDT XML**：[`UDT_HMI_FIO_Assembler.xml`](D:/TIA_MCP/benchmarks/golden_library/udt/UDT_HMI_FIO_Assembler.xml)
- **净室测试向量**：[`FB_FIO_Assembler.json`](D:/TIA_MCP/benchmarks/test_vectors/FB_FIO_Assembler.json)
- **规格追溯矩阵**：[`FB_FIO_Assembler.md`](D:/TIA_MCP/benchmarks/traceability/FB_FIO_Assembler.md)

#### 2. 块接口定义（Interface Table）

| 参数方向 | 形参名称 | 数据类型 | 极性 / 说明 |
| :---: | :--- | :---: | :--- |
| `VAR_INPUT` | `eStopOk` | `Bool` | 急停正常（常闭健康为 TRUE） |
| `VAR_INPUT` | `startBtn` | `Bool` | 启动按钮 |
| `VAR_INPUT` | `stopBtn` | `Bool` | 停止按钮（常闭健康为 TRUE） |
| `VAR_INPUT` | `resetBtn` | `Bool` | 复位按钮 |
| `VAR_INPUT` | `lidAtPlace` | `Bool` | 盖板工位到位光电传感器 |
| `VAR_INPUT` | `baseAtPlace` | `Bool` | 底座工位到位光电传感器 |
| `VAR_INPUT` | `partLeaving` | `Bool` | 装配成品离开工位光电传感器 |
| `VAR_INPUT` | `lidClamped` | `Bool` | 盖板定位夹紧到位反馈 |
| `VAR_INPUT` | `baseClamped` | `Bool` | 底座定位夹紧到位反馈 |
| `VAR_INPUT` | `posAtLimit` | `Bool` | 底座挡料升降气缸到位反馈 |
| `VAR_INPUT` | `movingX` | `Bool` | 机械手X轴移动中反馈 |
| `VAR_INPUT` | `movingZ` | `Bool` | 机械手Z轴移动中反馈 |
| `VAR_INPUT` | `itemDetected` | `Bool` | 吸盘抓取到盖板检测反馈 |
| `VAR_OUTPUT` | `convLids` | `Bool` | 盖板传送带电机 |
| `VAR_OUTPUT` | `convBases` | `Bool` | 底座传送带电机 |
| `VAR_OUTPUT` | `clampLid` | `Bool` | 盖板定位夹紧气缸 |
| `VAR_OUTPUT` | `clampBase` | `Bool` | 底座定位夹紧气缸 |
| `VAR_OUTPUT` | `posRaise` | `Bool` | 底座放行挡板抬起气缸 |
| `VAR_OUTPUT` | `moveX` | `Bool` | 机械手X轴移向底座装配工位 |
| `VAR_OUTPUT` | `moveZ` | `Bool` | 机械手Z轴下降 |
| `VAR_OUTPUT` | `grab` | `Bool` | 机械手真空吸盘 |
| `VAR_OUTPUT` | `error` | `Bool` | 故障标志 |
| `VAR_OUTPUT` | `status` | `Word` | 状态码 |
| `VAR_IN_OUT` | `ioHmi` | `"UDT_HMI_FIO_Assembler"` | HMI交互与参数状态结构体 |

#### 3. 配套 `"UDT_HMI_FIO_Assembler"` 结构体成员定义

| 字段名 | 数据类型 | 默认初始值 | 功能与业务含义 |
| :--- | :---: | :---: | :--- |
| `bManualMode` | `Bool` | `FALSE` | TRUE手动, FALSE自动 |
| `bStartCmd` | `Bool` | `FALSE` | HMI启动命令 |
| `bStopCmd` | `Bool` | `FALSE` | HMI停止命令 |
| `bResetCmd` | `Bool` | `FALSE` | HMI故障复位命令 |
| `tActionDelay` | `Time` | `0` | 气缸定位/夹紧保持延时（默认 T#500ms） |
| `tStepTimeout` | `Time` | `0` | 单步动作超时时间（默认 T#6s） |
| `iCurrentStep` | `Int` | `0` | 状态反馈：当前装配顺控步号 |
| `diAssembledCount` | `DInt` | `0` | 状态反馈：累计完成装配成品数 |
| `bRunning` | `Bool` | `FALSE` | 状态反馈：运行中 |
| `bFault` | `Bool` | `FALSE` | 状态反馈：超时或急停故障 |
| `wStatus` | `Word` | `16#0000` | 状态码：16#0000正常, 16#7000待机, 16#8401工位超时, 16#8402急停触发 |

#### 4. PLCopen 标准状态码 (`wStatus`) 与故障诊断

| 状态码 (Word) | 常量符号名称 | 分类 | 详细含义与恢复动作 |
| :---: | :--- | :---: | :--- |
| `16#0000` | `STATUS_OK` | 正常完成 | 触发时 `error := FALSE` |
| `16#7000` | `STATUS_IDLE` | 空闲/执行中 | 触发时 `error := FALSE` |
| `16#8401` | `ERR_TIMEOUT` | 外部硬件/超时故障 | 触发时 `error := TRUE` |
| `16#8402` | `ERR_ESTOP` | 外部硬件/超时故障 | 触发时 `error := TRUE` |

#### 5. Factory I/O 官方场景与推荐点位映射表

- **适配官方标准场景**：*Assembler (Basic)*

- **配套 UDT**：`UDT_HMI_FIO_Assembler`

| FB 形参名 | 方向 | 类型 | Factory I/O 官方传感器 / 执行器名称 | 极性与说明 |
| :--- | :---: | :---: | :--- | :--- |
| `eStopOk` | Input | `Bool` | `Emergency stop` | **NC（常闭）** |
| `startBtn` / `stopBtn` / `resetBtn` | Input | `Bool` | `Start` / `Stop` (NC) / `Reset` | 标准操作盒按钮 |
| `lidAtPlace` / `baseAtPlace` | Input | `Bool` | `Lid at place` / `Base at place` | 盖板/底座到位光电 |
| `partLeaving` | Input | `Bool` | `Part leaving` | 装配成品离开工位光电 |
| `lidClamped` / `baseClamped` | Input | `Bool` | `Lid clamped` / `Base clamped` | 定位夹具夹紧到位传感器 |
| `posAtLimit` | Input | `Bool` | `Positioner at limit` | 挡料板升降气缸到位传感器 |
| `movingX` / `movingZ` | Input | `Bool` | `Moving X` / `Moving Z` | 机械手 X/Z 轴移动中传感器 |
| `itemDetected` | Input | `Bool` | `Item detected` | 吸盘真空检测传感器 |
| `convLids` / `convBases` | Output | `Bool` | `Lids conveyor` / `Bases conveyor` | 盖板/底座传送带 |
| `clampLid` / `clampBase` | Output | `Bool` | `Clamp lid` / `Clamp base` | 盖板/底座定位夹紧器 |
| `posRaise` | Output | `Bool` | `Raise` (Positioner) | 底座放行挡板抬升 |
| `moveX` / `moveZ` / `grab` | Output | `Bool` | `Move X` / `Move Z` / `Grab` | 机械手 X/Z/吸盘驱动 |

#### 6. 核心控制逻辑与安全防坑要点
- 1. STEP_FEED_BOTH (10)：分别驱动 convLids（直到 lidAtPlace）与 convBases（直到 baseAtPlace），两者均到位后转入 STEP_CLAMP_BOTH (20)。
- 2. STEP_CLAMP_BOTH (20)：驱动 clampLid 与 clampBase 夹紧定位，确认 lidClamped AND baseClamped 后转入 STEP_Z_DOWN_LID (30)。
- 3. STEP_Z_DOWN_LID (30) -> STEP_GRAB_LID (40)：Z轴下降吸取盖板，确认 itemDetected 后松开 clampLid 并转入 STEP_Z_UP_LID (50)。
- 4. STEP_Z_UP_LID (50) -> STEP_X_TO_BASE (60) -> STEP_Z_DOWN_ASSY (70) -> STEP_RELEASE_ASSY (80)：Z轴上升到位后 X 轴移至底座上方，Z轴下降将盖板压装到底座上并释放真空。
- 5. STEP_EJECT (90)：Z轴上升并X轴回原位，同时松开 clampBase、抬起挡料板 posRaise 并开启 convBases 将成品送出，检测到 partLeaving 后计数 +1，进入下一循环或响应 statStopReq 停机。

