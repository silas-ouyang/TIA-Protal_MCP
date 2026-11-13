# 博途 TIA Portal V20 SCL 编译避坑死规矩与反模式错题本（Skill 增量包）

> **生成时间**：2026-11-08（通宵无人值守流水线自动沉淀）
> **验证环境**：Siemens TIA Portal V20 + S7-1500 (`PLC_1`) + `TiaMcpServer v2.7.8.0` (Upstream B)
> **样本规模**：15 个工业标准 FB/FC + 15 个配套 `UDT_HMI_xxx`（首轮一次编译 `0 Error, 0 Warning` 通过率 **93.3% [14/15]**，自愈后最终通过率 **100% [15/15]**）

---

## 一、AI 写博途 SCL 最常犯的 Top 5 编译报错/警告与死规矩

### Top 1：【真实触发警告】回读 `VAR_OUTPUT` 引脚导致未初始化编译警告（Rule DA008）
- **发生位置**：`A04` [`FB_MotorRevCtrl`](file:///D:/TIA_MCP/benchmarks/golden_library/scl/FB_MotorRevCtrl.scl)（第 1 轮编译：`0 Errors, 4 Warnings`）
- **博途编译器原话**：
  - `Line 174: The parameter '#contactorFwd' might not be initialized.`
  - `Line 174: The parameter '#contactorRev' might not be initialized.`
  - `Line 179: The parameter '#contactorFwd' might not be initialized.`
  - `Line 180: The parameter '#contactorRev' might not be initialized.`
- **踩坑原因**：
  AI 在状态机分支中给 `#contactorFwd` / `#contactorRev` 赋值后，又在块尾写出 `#running := #contactorFwd OR #contactorRev;` 以及 `#ioHmi.bRunningFwd := #contactorFwd;`。在西门子 S7-1200/1500 优化块中，`VAR_OUTPUT` 参数本质上是单向输出接口，编译器一旦发现代码块中**读取（Read-back）**了 `VAR_OUTPUT` 变量，且无法在静态控制流图上证明所有路径在读取前都已赋值，就会立即抛出 `might not be initialized` 警告！同理，在 `A03` [`FB_CylinderCtrl.scl`](file:///D:/TIA_MCP/benchmarks/golden_library/scl/FB_CylinderCtrl.scl#L153-L158) 中虽然先对 `#inExtendedPos` 进行了无条件赋值再回读给 `#ioHmi.bIsExtended` 侥幸逃过了编译器警告，但依然违反西门子官方编程风格指南 `Rule DA008`。
- **🛠️ 防报错死规矩（Rule DA008）**：
  1. **严禁在代码中任何表达式右侧（RHS）或 `IF/CASE` 条件中读取 `VAR_OUTPUT` 变量！**
  2. 所有输出逻辑必须先在 `VAR`（静态变量 `#stat...`）或 `VAR_TEMP`（临时变量 `#tempOut...`）中完成计算。
  3. 在块的最末尾（`END_FUNCTION_BLOCK` / `END_FUNCTION` 前），将内部变量**一次性单向赋值给 `VAR_OUTPUT` 和 `ioHmi` 状态位**。

---

### Top 2：【高频必防】`VAR_TEMP` 临时变量未在块首无条件初始化（Rule SE002）
- **生效范围**：本次全部 15 个块（`A01`–`A08`、`B01`–`B07`）均通过前置强制规则一次性规避。
- **博途编译器典型报错/警告**：
  - `Warning: The temporary variable '#temp...' might not be initialized.`
- **踩坑原因**：
  `VAR_TEMP` 分配在 CPU 扫描周期的局部堆栈（L 栈）中，每次调用块时内存可能是脏数据（或上一周期残留值）。如果只在 `IF ... THEN` 或 `CASE` 的部分分支中对 `#temp...` 赋值，而在块尾将其写入输出引脚，不仅博途会报未初始化警告，更会导致执行器输出随机跳变（幽灵动作）。
- **🛠️ 防报错死规矩（Rule SE002）**：
  - 在 `BEGIN` 之后的第一行，必须将 `VAR_TEMP` 中声明的**每一个变量**显式赋予安全初值（`Bool := FALSE;`、`Int := 0;`、`Real := 0.0;`、`Time := T#0s;`），绝不允许遗漏任何一个临时变量。

---

### Top 3：【高频必防】在 `FC` 中声明 `VAR` 静态变量或直接调用全局定时器导致多重调用冲突（Rule AL001）
- **生效范围**：
  - 无状态函数：`A01` [`FC_AnalogScaleAlarm.scl`](file:///D:/TIA_MCP/benchmarks/golden_library/scl/FC_AnalogScaleAlarm.scl)、`A06` [`FC_ButtonDebounceToggle.scl`](file:///D:/TIA_MCP/benchmarks/golden_library/scl/FC_ButtonDebounceToggle.scl)
  - 多重背景定时器 FB：`A03`、`A04`、`A07`、`A08`、`B01`–`B05`、`B07`
- **博途编译器典型报错**：
  - 在 `FC` 中写 `VAR ... END_VAR`：`Syntax error: 'VAR' is not allowed in a FUNCTION.`（博途 SCL 中 `FUNCTION` 只允许 `VAR_INPUT`、`VAR_OUTPUT`、`VAR_IN_OUT`、`VAR_TEMP`、`VAR CONSTANT`）。
  - 在 `FB` 中写 `IEC_Timer_0_DB.TON(...)`：破坏多重背景封装，多个工位调用同一个 FB 时共用同一个定时器 DB 引发严重动作串扰。
- **🛠️ 防报错死规矩（Rule AL001）**：
  1. **`FC` 严禁包含 `VAR` 静态变量段**！若 `FC` 需要跨周期保持状态（如 `A06` 按钮防抖的计时累加与边沿记忆），必须将状态字段定义在挂载于 `VAR_IN_OUT` 的 `"UDT_HMI_xxx"` 结构体中。
  2. **`FB` 内部的所有定时器/计数器必须声明在 `VAR` 段作为多重背景实例**：
     ```scl
     VAR
        instWatchdog : TON_TIME;
     END_VAR
     ```
  3. 严禁把 `instWatchdog(IN := TRUE, PT := ...)` 塞在 `IF` 单边分支里导致条件为假时定时器无法复位；必须在 `IDLE`/`FAULT` 或复位分支显式执行 `#instWatchdog(IN := FALSE, PT := ...);`。

---

### Top 4：【高频必防】`TIME`、`DINT`、`REAL` 隐式混算与跨类型比较编译失败（Rule PC008）
- **生效范围**：`A02` [`FB_LowPassFilter.scl`](file:///D:/TIA_MCP/benchmarks/golden_library/scl/FB_LowPassFilter.scl)、`A06` [`FC_ButtonDebounceToggle.scl`](file:///D:/TIA_MCP/benchmarks/golden_library/scl/FC_ButtonDebounceToggle.scl#L54-L55)、`B06` [`FB_FIO_TankLevelPID.scl`](file:///D:/TIA_MCP/benchmarks/golden_library/scl/FB_FIO_TankLevelPID.scl)
- **博途编译器典型报错**：
  - `Invalid data type for operator '+' / '/'`（如把 `Time` 与 `Int`/`Real` 直接相加或相除）
  - `Implicit conversion from 'Real' to 'Int' is not possible`
- **🛠️ 防报错死规矩（Rule PC008）**：
  1. `Time` 类型与整数毫秒运算时，必须使用显式转换函数 `TIME_TO_DINT(#debounceTime)`（如 `A06` 第 54–55 行将 `Time` 转为毫秒 `DInt` 进行扫描周期累加比较）。
  2. 浮点运算常量必须带小数点（写 `0.0`、`1.0`、`30.0`，严禁写 `0`、`1`、`30`）。
  3. 严禁对 `REAL` 浮点数使用 `=` 或 `<>` 直接判等；判断零值或范围必须使用 `<= 0.0`、`>= 0.0` 或 `ABS(a - b) <= 1.0e-6`（如 `A01` 第 77 行 `IF (#rawMax <= #rawMin) OR (#engMax <= #engMin)`）。

---

### Top 5：【V20 外部源导入铁律】`UDT` 依赖顺序、外部源重名冲突与符号引号规范
- **生效范围**：全部 15 个 `UDT_HMI_xxx` 与 15 个 `FB/FC` 的自动化导入流水线
- **博途 V20 Openness 典型报错**：
  1. 若先导入 `FB/FC` 再导入 `UDT`：`Data type '"UDT_HMI_xxx"' is unknown.`
  2. 若在 `PlcImportFromExternalSource` 中重复使用外部源名称或旧块未覆盖：`The name '...' is not unique.`
  3. 局部变量漏写 `#` 或全局 UDT 漏写双引号：`Undefined identifier`
- **🛠️ 防报错死规矩（V20 Openness 导入规矩）**：
  1. **严格依赖顺序**：必须先通过 `PlcBuildAndImport(kind: "udt")` 导入并编译 `UDT_HMI_xxx`，再通过 `PlcBuildAndImport(kind: "scl")` 导入并编译引用该 UDT 的 `FB/FC`。
  2. **符号引用规范**：块内所有接口参数、静态变量、临时变量、局部常量在 `BEGIN` 代码体中引用时**100% 强制加 `#` 前缀**（如 `#eStopOk`、`#ioHmi.bFault`）；所有全局块名和 UDT 类型名**100% 加英文双引号**（如 `ioHmi : "UDT_HMI_Cylinder";`）。
  3. **文件编码**：含中文注释的 `.scl` 源文件在外部源导入时必须确保 UTF-8 编码无乱码。

---

## 二、编译器抓不到但 Argon 安全终审抓出的 4 类“工业逻辑反模式”

> ⚠️ **高价值警示**：以下代码在博途 V20 中均能实现 `0 Error, 0 Warning` 完美编译通过，但在真实工业现场或 Factory I/O 联调中会引发严重电气安全隐患或顺控卡死！

### 反模式 L1：状态机退出条件排在反向切换条件之前，导致正反转灭弧死区被旁路
- **典型案例**：`A04` [`FB_MotorRevCtrl.scl`](file:///D:/TIA_MCP/benchmarks/golden_library/scl/FB_MotorRevCtrl.scl#L140-L147)
- **问题代码结构**：
  ```scl
  #STATE_FWD:
      IF (NOT #interlockOk) OR (NOT #tempReqFwd) THEN
          #statState := #STATE_IDLE;
      ELSIF #tempReqRev THEN
          #statTargetDir := 2;
          #statState := #STATE_DEADBAND;
      END_IF;
  ```
- **安全隐患分析**：
  当操作员从“正转”直接切换到“反转”（`reqFwd=FALSE, reqRev=TRUE`）时，第一个 `IF (NOT #tempReqFwd)` 立即成立，状态机在第 1 个扫描周期跳回 `STATE_IDLE`，并在第 2 个扫描周期从 `STATE_IDLE` 直接切入 `STATE_REV`，**完全绕过了 `STATE_DEADBAND`（1秒接触器灭弧死区）**，在真实主回路上极易引发正反转接触器电弧相间短路！
- **正确写法死规矩**：
  在正反转状态机中，必须**先判断反向请求或任何换向需求（或规定只要从运行态停止都必须经过 `STATE_DEADBAND` 冷却态）**，绝不能让 `NOT reqFwd` 直接无延时跳回可立即反向启动的 `STATE_IDLE`。

### 反模式 L2：`STEP_DONE` 完成步在同一扫描周期内立即跳回 `STEP_IDLE`，吞掉 `done` 完成脉冲
- **典型案例**：`B05` [`FB_FIO_AutomatedWarehouse.scl`](file:///D:/TIA_MCP/benchmarks/golden_library/scl/FB_FIO_AutomatedWarehouse.scl#L331-L343)
- **问题代码结构**：
  ```scl
  #STEP_DONE:
      #ioHmi.diStoredCount := #ioHmi.diStoredCount + 1;
      #statStatus := #STATUS_FINISHED;
      #statStep := #STEP_IDLE; // <-- 同周期立即改回 0
  ...
  #done := (#statStep = #STEP_DONE); // <-- 块尾计算时 #statStep 已经是 0，#done 永远为 FALSE！
  ```
- **顺控隐患分析**：
  在 `STEP_FORK_RET_PLACE` 转入 `STEP_DONE` 的下一个扫描周期，进入 `CASE #STEP_DONE` 分支后立即将 `#statStep` 改写为 `#STEP_IDLE(0)`，导致块尾 `#done := (#statStep = #STEP_DONE)` 永远为 `FALSE`，上位调度程序永远收不到 `done=TRUE` 的完成握手信号！
- **正确写法死规矩**：
  遵循 PLCopen `Execute` 握手规范：进入 `STEP_DONE` 后应保持 `done = TRUE` 直至输入 `execute` 变为 `FALSE`（或至少使用独立布尔标志 `#tempDonePulse := TRUE` 维持完整 1 个扫描周期的输出）。

### 反模式 L3：将接触器常闭反馈回路（EDM `feedbackLoopOk`）放进急停保持回路的连续切断条件中
- **典型案例**：`A08` [`FB_DualEStopInterlock.scl`](file:///D:/TIA_MCP/benchmarks/golden_library/scl/FB_DualEStopInterlock.scl#L71-L73)
- **安全逻辑分析**：
  安全继电器的外部设备监控（EDM / 反馈回路 `feedbackLoopOk`）串联的是外部主接触器的**常闭（NC）辅助触点**。当安全继电器吸合输出（`safetyOutput = TRUE`）后，外部主接触器吸合，其常闭辅助触点必然断开（`feedbackLoopOk` 变为 `FALSE`）。如果把 `OR (NOT #feedbackLoopOk)` 写进持续保持条件（L71），安全输出吸合后的下一个扫描周期就会把自己切断！
- **正确写法死规矩**：
  `feedbackLoopOk` 只能在**复位上升沿（`STATE_WAIT_RESET` -> `STATE_RUN_SAFE`）**时作为前置检查条件（确认主接触器在未吸合前没有发生触点熔焊粘连），吸合运行期间不应因 `feedbackLoopOk=FALSE` 自切。

### 反模式 L4：顺控预备步漏开入口传送带或漏判工位辅助限位
- **典型案例**：
  - `B04` [`FB_FIO_Turntable.scl`](file:///D:/TIA_MCP/benchmarks/golden_library/scl/FB_FIO_Turntable.scl#L174)：在 `STEP_WAIT_ENTRY (20)` 等待托盘到达转盘入口传感器 `atEntry` 时，将转盘自带的入口辊道 `#tempEntryConv` 置为了 `FALSE`，若仅靠上游惯性无法触发 `atEntry`，托盘会停在交界处。
  - `B07` [`FB_FIO_Assembler.scl`](file:///D:/TIA_MCP/benchmarks/golden_library/scl/FB_FIO_Assembler.scl#L14)：声明了 `posAtLimit`（底座挡料板抬起到位限位），但在 `STEP_EJECT (90)` 中未等待 `posAtLimit=TRUE` 即直接启动了 `convBases`。
- **正确写法死规矩**：
  顺控状态机每一步必须逐一核对输入引脚表，确保每一个声明的到位传感器（如 `atEntry`、`posAtLimit`、`atExit`）都在对应的状态转移条件中闭环使用，禁止出现“声明了传感器却不判读”的悬空引脚。
