# 工控标准功能块库（适配 Factory I/O）与 `UDT_HMI` 引脚映射手册

> **生成时间**：2026-11-08  
> **目标平台**：Siemens TIA Portal V20 · SIMATIC S7-1200 / S7-1500（强制启用 `{ S7_Optimized_Access := 'TRUE' }`）  
> **配套资产目录**：
> - `D:\TIA_MCP\benchmarks\golden_library\scl\` —— 100% 博途真机编译通过（0 Error, 0 Warning）的原生 SCL 源码（UTF-8 with BOM）
> - `D:\TIA_MCP\benchmarks\golden_library\xml\` —— 博途 V20 Openness 导出的标准 SimaticML `.xml` 程序块文件
> - `D:\TIA_MCP\benchmarks\golden_library\udt\` —— 15 个配套 `UDT_HMI_xxx` 结构体定义 SimaticML `.xml` 文件

---

## 一、架构与安全设计规范（`@siemens-s7-1200-1500-programming`）

1. **零全局变量（`RU004`/`DA005`）**：所有 15 个 FB/FC 内部仅使用形参、静态变量（`stat*`）、多重背景实例（`inst*`）、临时变量（`temp*`）与局部常量（`UPPER_CASE`），可直接拖入任意 S7-1200/1500 工程实现 100% 库一致性。
2. **InOut 引用传递 `UDT_HMI_xxx`（`PE003`/`DA007`）**：每个功能块均在 `VAR_IN_OUT` 接口挂载专属 `ioHmi : "UDT_HMI_xxx"`，包含手动覆盖控制、工艺参数设定、实时状态反馈及 PLCopen 标准状态字（`wStatus`），消除 FB 结构化传参的深拷贝开销。
3. **工业电气安全硬联锁**：
   - 所有涉及运动/执行机构的块均遵循故障安全（Fail-Safe）原则：`eStopOk` 采用常闭健康极性（`TRUE` = 急停未按下/回路闭合，`FALSE` = 急停按下或断线）；
   - 当 `eStopOk = FALSE` 时，块末尾执行**无条件硬切断**，强制将全部外部执行器输出置为安全态（`FALSE` / `0.0`），并将状态字置为 `16#84xx`。
   - 顺序控制块严格区分**急停硬切断**与**停止按钮周期尾优雅停机（`statStopReq`）**，杜绝中途按停止按钮导致的“卡步”或“漏计”（遵循 `@siemens-v20-ops` §4.6）。

---

## 二、Part A：通用底层标准块（8 个）引脚速查

| 编号 | 块名称 | 类型 | 配套 HMI UDT | 核心输入引脚 (`VAR_INPUT`) | 核心输出引脚 (`VAR_OUTPUT`) | 典型应用场景 |
| :--- | :--- | :---: | :--- | :--- | :--- | :--- |
| **A01** | `FC_AnalogScaleAlarm` | FC | `UDT_HMI_AnalogScale` | `rawInput (Int)`, `bipolar (Bool)`, `reset (Bool)` | `scaledValue (Real)`, `alarmHH/H/L/LL (Bool)`, `error`, `status` | 4–20mA / 0–10V 模拟量传感器标定、断线溢流检测与四限报警 |
| **A02** | `FB_LowPassFilter` | FB | `UDT_HMI_LowPassFilter` | `enable (Bool)`, `rawValue (Real)`, `alpha (Real)`, `reset (Bool)` | `filteredValue (Real)`, `valid`, `error`, `status` | 液位/温度/称重连续模拟量信号一阶惯性平滑（带冷启动无阶跃同步） |
| **A03** | `FB_CylinderCtrl` | FB | `UDT_HMI_CylinderCtrl` | `eStopOk`, `autoMode`, `autoExtendCmd`, `autoRetractCmd`, `interlockOk`, `sensorExtended`, `sensorRetracted`, `doubleSolenoid`, `timeout`, `reset` | `coilExtend`, `coilRetract`, `inExtendedPos`, `inRetractedPos`, `error`, `status` | 单控/双控气动电磁阀驱动、磁性开关双亮冲突检测与动作超时保护 |
| **A04** | `FB_MotorRevCtrl` | FB | `UDT_HMI_MotorRevCtrl` | `eStopOk`, `thermalOk`, `interlockOk`, `autoMode`, `autoFwdCmd`, `autoRevCmd`, `fbkFwd`, `fbkRev`, `useFeedback`, `reset` | `contactorFwd`, `contactorRev`, `running`, `error`, `status` | 三相异步电机正反转接触器软硬件互锁、换向死区延时与热过载/吸合反馈监控 |
| **A05** | `FB_RingFifo` | FB | `UDT_HMI_RingFifo` | `enqueue (Bool)`, `dequeue (Bool)`, `itemIn (DInt)`, `clear (Bool)` | `itemOut (DInt)`, `count (Int)`, `isEmpty`, `isFull`, `error`, `status` | 产线工位物料 ID / 高度分类 / 托盘条码 32 深度 $O(1)$ 环形队列缓存 |
| **A06** | `FC_ButtonDebounceToggle` | FC | `UDT_HMI_ButtonDebounce` | `rawButton (Bool)`, `eStopOk (Bool)`, `reset (Bool)`, `scanCycleMs (Int)` | `debouncedOut`, `risingPulse`, `fallingPulse`, `toggleState`, `status` | 机械按钮/光电防抖滤波、上升/下降沿提取及单键启停双稳态翻转 |
| **A07** | `FB_ModbusPoller` | FB | `UDT_HMI_ModbusPoller` | `enable`, `reqDone`, `reqBusy`, `reqError`, `reqStatus (Word)`, `reset` | `mbReq`, `currentStation (Int)`, `busy`, `error`, `status` | 多从站 Modbus RTU/TCP 轮询状态机、帧间延时、超时重试与掉线跳站防死锁 |
| **A08** | `FB_DualEStopInterlock` | FB | `UDT_HMI_DualEStop` | `eStopCh1`, `eStopCh2`, `safetyGateOk`, `feedbackLoopOk`, `resetButton` | `safetyEnableOut`, `resetRequired`, `discrepancyError`, `error`, `status` | 双回路急停双通道同步性（200ms 触点粘连）检测、安全门联锁与上升沿受控复位 |

---

## 三、Part B：Factory I/O 经典场景专用顺控块（7 个）与官方场景 I/O 映射表

### B01 · `FB_FIO_SortingByHeight`（高低件识别分拣与推杆顺控）
- **对应 Factory I/O 官方场景**：*Sorting by Height (Basic / Advanced)*
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

---

### B02 · `FB_FIO_PickAndPlace`（气动两轴 X/Z 真空抓手搬运步序控制）
- **对应 Factory I/O 官方场景**：*Pick & Place (Basic)*
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

---

### B03 · `FB_FIO_BufferConveyor`（三段缓冲传送带防追尾与满料零压积放控制）
- **对应 Factory I/O 官方场景**：*Buffer Station*
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

---

### B04 · `FB_FIO_Turntable`（90 度旋转分流转盘双工位对接顺控）
- **对应 Factory I/O 官方场景**：*Sorting Station with Turntable*
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

---

### B05 · `FB_FIO_AutomatedWarehouse`（立体仓库堆垛机取放料状态机）
- **对应 Factory I/O 官方场景**：*Automated Warehouse*
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

---

### B06 · `FB_FIO_TankLevelPID`（液位进出水比例阀门闭环控制块）
- **对应 Factory I/O 官方场景**：*Level Control*
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

---

### B07 · `FB_FIO_Assembler`（双工位底座与盖板抓取装配顺控）
- **对应 Factory I/O 官方场景**：*Assembler (Basic)*
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
