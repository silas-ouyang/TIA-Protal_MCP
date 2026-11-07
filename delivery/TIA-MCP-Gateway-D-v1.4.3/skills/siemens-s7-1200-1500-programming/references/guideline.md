# 西门子 S7-1200/1500 核心编程与架构工程指南（AI Agent 蒸馏版）

> **目标受众**：面向工业自动化 AI 编程 Agent、系统架构师及高级 PLC 软件工程师。  
> **核心原则**：剥离所有 GUI 鼠标与菜单操作，聚焦底层运行机制、数据结构设计、接口协议契约、SCL 工业级编码规范与安全防护。

---

## 1. S7-1200/1500 架构创新与优化块（Optimized Block Access）

### 1.1 S7-300/400 标准块 vs S7-1200/1500 优化块的底层内存排布

#### 【结论/规则】
- 针对 S7-1200/1500 的所有新建程序块（OB、FB、FC、Global DB），**必须默认且强制启用“优化块访问”（Optimized Block Access）**。
- 严禁在无外部硬性通信约束的情况下回退到 S7-300/400 的“标准块访问”（非优化块）。

#### 【底层原理（Why）】
- **内存对齐与填充间隙（Byte Gap）**：
  - **S7-300/400 标准块**：严格按照程序员声明变量的顺序分配绝对物理偏移地址（Offset）。当交替声明 `Bool`、`Int`、`DInt` 时，由于字/双字对齐要求，系统会在变量之间自动插入填充字节（Byte Gap）。例如，声明一个 `Bool` 紧接着声明一个 `Int`，系统会跳过当前字节的剩余 7 位以及相邻奇数字节，强制将 `Int` 对齐到偶数字节起始处（如偏移量 2.0），造成严重内存浪费。
  - **S7-1200/1500 优化块**：变量不再与物理偏移硬绑定。TIA 编译器在编译期根据数据类型位宽自动执行**重排优化**：大位宽变量（64 位 LReal/LInt、32 位 DInt/Real）排布在块前端，16 位变量（Int/Word）居中，8 位变量（Byte/SInt）及 Bool 变量集中排布在末端。彻底消除了填充字节间隙。
- **端序（Endianness）与总线读取效率**：
  - S7-300/400 硬件架构基于大端序（Big-Endian，高位字节在低地址）。
  - S7-1500 采用现代嵌入式处理器内核，原生运行**小端序（Little-Endian，低位字节在低地址）**，总线按 32 位（4 字节）对齐高速读取。
  - 若在 S7-1500 中读取标准块中的数据，当发生非对齐不利偏移时（例如跨越 4 字节边界的 Real 变量），CPU 需要执行 2 次 16 位总线读取，并在微控制器内部执行硬件字节翻转（Byte Swapping）重组数据，造成明显的指令执行开销。
  - 访问优化块时，变量在内存中已经天然按小端序和处理器总线宽度最佳排布，S7-1500 单条指令即可直接命中读取，无需字节翻转。
- **布尔变量寻址机制**：
  - 标准块中每个 Bool 仅占 1 位，读写时 CPU 必须先将所在整字节装载进累加器，执行掩码位运算（AND/OR 过滤），再写回内存。
  - 优化块内部，每个 Bool 独立占用 1 个完整的物理字节（Byte-addressable），CPU 无需位掩码即可直接按字节快速存取。
- **块容量上限飞跃**：
  - 标准 DB 最大容量被 16 位偏移寻址硬性限制在 64 KB。
  - 优化 DB 容量在 S7-1500 上最高可达 16 MB（以 CPU 1518 为例），突破了经典 PLC 物理寻址的壁垒。

#### 【结构对比表与示例（How）】

| 关键特性 | S7-300/400 经典标准块 (Standard) | S7-1200/1500 优化块 (Optimized) |
| :--- | :--- | :--- |
| **物理排列机制** | 严格按照用户声明顺序排列 | 编译器按数据类型位宽大小自动重排 |
| **内存填充间隙** | 存在大量填充字节 (Byte Gap) | 彻底消除间隙，内存利用率达 100% |
| **CPU 端序匹配** | 大端序 (Big-Endian)，S7-1500 访问需翻转字节 | 小端序 (Little-Endian)，单周期指令直达 |
| **Bool 寻址实现** | 1 位/变量（读写依赖字节掩码） | 1 字节/变量（独立寻址，免掩码高速处理） |
| **寻址模式** | 支持绝对地址（DBx.DBX0.0）与符号寻址 | **仅支持完全符号化寻址**（无偏移地址） |
| **最大容量限制** | 64 KB | 64 KB (1200) / 最高达 16 MB (1500) |
| **在线加载无需复位** | 不支持（改动接口必触发重载复位） | 支持（提供 Memory Reserve 内存预留区） |

``scl
// 优化数据块定义示例：在 TIA 源码中声明 Optimized Block
DATA_BLOCK "DB_MachineConfig"
{ S7_Optimized_Access := 'TRUE' } // 启用优化块访问
VERSION : 0.1
NON_RETAIN
   VAR 
      speedSetpoint : Real;       // 32 位变量，编译器排在前端
      targetPosition : DInt;      // 32 位变量，排在前端
      cycleTime : Time;           // 32 位变量，排在前端
      operatingMode : Int;        // 16 位变量，排在中端
      systemReady : Bool;         // 布尔变量，独立字节存储于末端
      emergencyStop : Bool;       // 布尔变量，独立字节存储于末端
   END_VAR
BEGIN
END_DATA_BLOCK
``

---

### 1.2 保持性（Retentive Memory）设置差异

#### 【结论/规则】
- 优化块必须支持**按变量粒度独立配置保持性（Retain）**。
- 严禁在函数块调用方或者通过“在 IDB 中设置”去动态更改保持性，所有保持性属性必须在 FB 接口定义或 Global DB 定义中**硬编码显式指定**。

#### 【底层原理（Why）】
- **标准块的粗粒度限制**：标准 DB 只能全块勾选保持，或者在 PLC 硬件配置中按物理字节范围统一划定（如 MB0..MB100, DB1.DBB0..DBB20）。无法区分业务参数与过程运行变量。
- **优化块的独立分区与物理 DMA 刷写**：
  - 优化块内部将变量划分为**保持区**与**非保持区**两个物理子段。
  - 当 PLC 检测到掉电（Power Failure）瞬态事件时，CPU 硬件备用电容供电，微控制器触发专用硬件中断，仅将优化块中的“保持区连续内存段”通过 DMA 快速写入板载非易失性 NVRAM。
  - 逐变量精细化设置保持性，可将断电持久化数据体积压到最低，确保在极短的电容供电维持时间内可靠写毕，防止持久化刷写超时造成数据损坏。

#### 【代码示例（How）】

``scl
DATA_BLOCK "DB_ProductionData"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 0.1
   VAR 
      // 保持性变量：断电保存至 NVRAM
      totalPartsProduced : UDInt := 0; // { S7_Retain := 'TRUE' }
      recipeId : Int := 1;             // { S7_Retain := 'TRUE' }
      
      // 非保持性变量：断电后恢复为初始默认值
      currentSpeed : Real := 0.0;      // { S7_Retain := 'FALSE' }
      cycleTimerRunning : Bool := FALSE;// { S7_Retain := 'FALSE' }
   END_VAR
BEGIN
END_DATA_BLOCK
``

---

### 1.3 致命性能陷阱：优化块与非优化块混合传参及隔离策略

#### 【结论/规则】
- **严禁在优化块与非优化块之间进行复杂的结构体/数组跨界传参**。
- **允许关闭优化访问的唯一场景**：仅用于与只支持绝对寻址（`DBx.DBW`）的旧版 SCADA、不支持 S7 符号化通信的第三方上位机、或者特定 Modbus-TCP / 硬件报文直接映射的通信接口。
- **架构隔离铁律**：核心控制逻辑必须 100% 运行在优化块中；与非优化环境交互时，必须建立单一的**“通信网关 DB（Buffer DB）”**进行物理边界隔离，绝不允许污染核心业务块。

#### 【底层原理（Why）】
- **后台格式重构与副本深拷贝**：
  - 优化块内部是重排对齐、小端序、无间隙的内存组织；非优化块则是按声明顺序、包含填充字节、大端序的排列。
  - 当一个优化块向非优化块传递结构体（UDT/STRUCT/ARRAY），或者通过 InOut 调用时，CPU 无法通过指针直接传递引用！
  - 系统底层被迫在**本地数据栈（L 栈 / Temp 区域）**开辟出一块临时镜像缓冲区，在调用入口处逐字节解析结构、重排变量、转换端序、填充/去除 Byte Gap 进行深度数据拷贝；在退出块时，再次执行逆向重排转换并写回实参。
- **两大灾难性后果**：
  1. **L 栈溢出与 CPU 停机**：大型复杂结构体在 L 栈生成多个副本，极易超出局部数据栈上限（S7-1200 仅几 KB，S7-1500 默认几十 KB），直接引发编程错误中断（OB121），无对应 OB 时 PLC 立即停机（STOP）。
  2. **异步数据被静默覆盖（Bug 极其隐蔽）**：通过 InOut 跨优化/非优化传递时，子块处理期间使用的是 Temp 副本。若在此执行窗口期内，外部中断 OB、HMI 或通信报文异步写入了原实参变量，子块执行结束退出时，其内部的旧 Temp 副本会全量写回实参，**直接将外部异步最新值强行覆盖**，造成现场偶发性不可复现的严重逻辑异常。

#### 【架构隔离设计模式（How）】

``
[外部非优化区域]                         [核心优化控制系统]
第三方SCADA/旧HMI/Modbus                优化业务控制逻辑 (FB/FC)
       │ (绝对寻址读写)                            │ (完全符号化高速引用)
       ▼                                         ▼
┌──────────────────────┐   集中调度复制   ┌──────────────────────┐
│  DB_Comm_NonOptimized│ ───────────────> │  DB_Control_Optimized│
│  (关闭优化访问, 隔离区) │ <─────────────── │  (100% 优化块访问)    │
└──────────────────────┘   (统一在主周期首尾) └──────────────────────┘
``

``scl
// 统一在主循环 OB1 的输入/输出映射阶段执行单次显式解包，隔离核心逻辑
REGION CommDataIsolation
   // 仅在主扫描开始时，将非优化通信 DB 数据显式同步至优化控制 DB
   "DB_Control_Optimized".Command.Start := "DB_Comm_NonOptimized".ModbusCmdStart;
   "DB_Control_Optimized".Command.Speed := "DB_Comm_NonOptimized".ModbusSpeedSetpoint;
   
   // 业务调用 100% 优化块
   "FB_CoreMotion_Instance"("DB_Control_Optimized");
   
   // 在扫描结束时回写状态
   "DB_Comm_NonOptimized".ModbusStatusRunning := "DB_Control_Optimized".Status.Running;
END_REGION
``

---

## 2. 内存概念、完全符号化与硬件无关编程

### 2.1 三大内存区域（Load / Work / Retentive）职责边界

#### 【结论/规则】
- 严格区分代码与数据的物理边界：装载存储器用于归档与配方持久化；工作存储器支撑高速循环执行；保持性存储器受配额严控，仅存关键断电不可逆数据。

#### 【底层原理（Why）】
- **装载存储器（Load Memory）**：
  - 物理介质为 SIMATIC 存储卡（SMC 卡）。存储完整的硬件组态、程序代码、完整的符号名称列表、网络注释及所有块属性。CPU 运行时不从 SMC 逐条读取代码，断电完全不丢失。
  - 可通过系统指令 `READ_DBL`（从装载存储器读 DB）和 `WRIT_DBL`（将工作存储器当前值写入装载存储器中的 DB）实现低频、大容量的配方管理，而无需挤占昂贵的 RAM。
- **工作存储器（Work Memory）**：
  - 物理介质为 CPU 芯片内部高速 SRAM。分为代码工作区（Code Work Memory）和数据工作区（Data Work Memory）。程序编译后的机器码和运行数据在此常驻。断电后易失。工作区不包含变量的字符名和注释。
- **保持性存储器（Retentive Memory）**：
  - 物理介质为专用非易失 NVRAM 芯片或具有硬件超级电容保障的特殊 RAM。在 S7-1200 上通常仅 14 KB，在 S7-1500 上根据型号为 88 KB ~ 768 KB。由于容量稀缺，严禁将大型日志数组或无断电保存必要的过程曲线置入 Retentive 区。

#### 【存储边界与配方架构表（How）】

| 存储类型 | 物理介质 | 存储内容 | 掉电持久性 | 读写指令/机制 |
| :--- | :--- | :--- | :--- | :--- |
| **装载存储器 (Load)** | SMC 闪存卡 | 编译镜像、完整符号表、注释、配方母本 | 永久保存 | `READ_DBL`, `WRIT_DBL` (写操作损耗 Flash 寿命，严禁高频调用) |
| **工作存储器 (Work)** | 内部高速 SRAM | 执行代码 (机器指令)、运行中 DB 变量 | 掉电丢失 | 指令周期内纳秒级访问 |
| **保持性存储器 (Retain)** | 内部 NVRAM | 勾选了 Retain 的标记变量、位置零点 | 电容支持下持久化 | 掉电瞬间硬件 DMA 写入，启动自动恢复 |

---

### 2.2 严禁使用 M 区（位存储器 / 标志位存储器）

#### 【结论/规则】
- **在 S7-1200/1500 程序架构中，绝对禁止使用 M 区（`%M0.0`, `%MB`, `%MW`, `%MD`）**。
- 一律采用**优化全局数据块（Global DB）**配合语义化命名空间取代所有标志位。

#### 【底层原理（Why）】
1. **无命名空间与物理地址重叠灾难**：M 区是一个扁平无结构的物理内存池。`MD10`、`MW10`、`MW12`、`M10.0` 之间存在直接的物理重叠。任何工程师无意的跨字写入，都会瞬间静默篡改重叠区域的布尔状态，排查极其困难。
2. **性能低下（非优化访问）**：M 区为保留旧型号兼容性，底层完全按非优化的大端序与单字节位排列存储，访问 M 区强制 CPU 执行额外的寻址与位掩码指令。
3. **硬件强相关与不可移植性**：不同 CPU 型号（如 1211C 只有 4KB M 区，1518 有 16KB）M 区上限差异巨大，使用 M 区的通用功能块（FB/FC）无法发布到全局库供其他硬件平台复用。
4. **无法精细化控制保持性**：M 区只能从 `MB0` 开始按连续字节范围设定保持性，无法像优化 DB 一样对特定布尔量进行独立勾选。

#### 【反例 vs 正例（How）】

``scl
// -----------------------------------------------------------------------------
// 致命反例：使用 M 区，存在隐蔽地址冲突，无法模块化封装
// -----------------------------------------------------------------------------
%M10.0 := "Sensor_A";        // 属于 MB10
%M10.1 := "Sensor_B";        // 属于 MB10
%MD10  := 123456.78;         // 覆写了 MB10..MB13，直接摧毁 M10.0 与 M10.1 的值！

// -----------------------------------------------------------------------------
// 正确规范：建立结构清晰的优化全局 DB，强类型隔离
// -----------------------------------------------------------------------------
DATA_BLOCK "DB_PlantState"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 0.1
   VAR 
      Station1 : Struct
         SensorA_Tripped : Bool;
         SensorB_Tripped : Bool;
         TargetVelocity  : Real; // 独立强类型，绝对不可能与布尔位发生重叠
      END_STRUCT;
   END_VAR
BEGIN
END_DATA_BLOCK
``

---

### 2.3 用 UDT（PLC 数据类型）直接映射 I/O 过程映像区

#### 【结论/规则】
- 针对具有固定通道结构的数字量/模拟量模块、变频器报文（如 PROFIdrive 标准报文 1、20 等）以及智能仪表通信，**必须声明标准 UDT，并在 PLC 变量表中将整个 UDT 变量直接绑定到 `%I` 或 `%Q` 的首地址**。
- 严禁在代码中写成百上千行单通道零散变量赋值（如 `#run := %I0.0; #fault := %I0.1;`）。

#### 【底层原理（Why）】
- S7-1500 编译器原生支持将复合 PLC 数据类型（UDT）映射到 I/O 输入/输出过程映像区（Process Image）。
- **字对齐合规性**：PLC 数据类型在系统内部定义为**以字（WORD / 2 字节）边界结尾**。只要 UDT 的结构尺寸与硬件模块通道位宽精确匹配（例如数字量 16DI 对应一个包含 16 个 Bool 的 UDT），PLC 即可直接以整块数据的形式与背板总线同步。
- **解耦硬件物理拓扑**：当现场 I/O 模块更换插槽、硬件机架重构，或者起始地址从 `%I0.0` 变更为 `%I100.0` 时，**用户程序内部的 FB/FC 调用代码 0 行变动**，只需在 PLC 变量表中更新一次 UDT 的起始绝对地址，实现完全的硬件无关编程。

#### 【代码实现与映射模式（How）】

``scl
// 步骤 1：定义与驱动器硬件报文完全对齐的 UDT
TYPE "typeDrive_StandardTelegram1_In"
VERSION : 0.1
   STRUCT
      ZSW1 : Word; // 状态字 1 (16位)
      NIST_A : Int;  // 实际转速 (16位)
   END_STRUCT;
END_TYPE

TYPE "typeDrive_StandardTelegram1_Out"
VERSION : 0.1
   STRUCT
      STW1 : Word; // 控制字 1 (16位)
      NSOLL_A : Int; // 设定转速 (16位)
   END_STRUCT;
END_TYPE

// 步骤 2：在 PLC 变量表 (PLC Tags) 中映射整块 UDT：
// 变量名: "Axis1_Drive_In"   地址: %I256.0  类型: "typeDrive_StandardTelegram1_In"
// 变量名: "Axis1_Drive_Out"  地址: %Q256.0  类型: "typeDrive_StandardTelegram1_Out"

// 步骤 3：直接将整体 UDT 传入业务驱动 FB，彻底终结单变量解构传递
FUNCTION_BLOCK "FB_DriveController"
{ S7_Optimized_Access := 'TRUE' }
   VAR_INPUT 
      driveIn : "typeDrive_StandardTelegram1_In"; // 整体接收
   END_VAR
   VAR_OUTPUT 
      driveOut : "typeDrive_StandardTelegram1_Out"; // 整体输出
   END_VAR
BEGIN
   // 内部通过完全符号化点语法直接读取，高效且直观
   IF #driveIn.ZSW1.%X3 THEN // 状态字第3位为故障位
       #driveOut.STW1 := 16#047E; // 输出停机控制字
   END_IF;
END_FUNCTION_BLOCK
``

---

### 2.4 系统常量与局部/全局用户常量的规范使用

#### 【结论/规则】
- 针对硬件标识符（Hardware Identifier），**严禁在程序中硬编码整数（如 `256`, `64`）**，必须强制使用系统硬件组态自动生成的**“系统常量”（System Constants）**。
- 系统物理常数、数组尺寸、超时上限等固定值，必须定义为**全局用户常量（Global Constants）**或块接口中的**局部用户常量（Local Constants）**。

#### 【底层原理（Why）】
- **系统常量（System Constants）**：当在硬件组态中添加任何 DI 模块、PN 接口、分布式从站甚至 OB 时，TIA 底层自动分配一个类型为 `HW_IO`、`HW_DEVICE` 或 `HW_MODULE` 的全局唯一标识符（例如 `Local~DI_16x24VDC_1`）。当硬件模块在机架中移动导致槽位地址改变时，硬件常量的名称维持不变，诊断指令（如 `RD_SINFO`, `LED`, `GET_DIAG`）依赖该符号常数即可保持永续引用，避免硬编码地址失效。
- **用户常量消除 Magic Numbers**：在算法和状态机中使用无意义的硬编码数字极易引入越界和逻辑偏差，常量在编译阶段直接内联解析进操作码，不占用运行时数据区内存。

#### 【代码示例（How）】

``scl
// 在 FB 中使用系统常量与局部常量
FUNCTION_BLOCK "FB_ModuleDiagnostics"
{ S7_Optimized_Access := 'TRUE' }
   VAR_CONST
      MAX_RETRY_COUNT : DInt := 3;           // 局部常量：重试阈值
      FAULT_TIMEOUT   : Time := T#5S;         // 局部常量：超时界限
   END_VAR
   VAR 
      diagData : "typeModuleHealth";
      retVal : Int;
   END_VAR
BEGIN
   // 规范：直接使用系统硬件组态生成的常量符号 "Local~DI_16x24VDC_1" (类型为 HW_IO)
   // 严禁写入硬编码无类型整数 "257"！
   #retVal := GET_DIAG(MODE := 1, 
                       LADDR := "Local~DI_16x24VDC_1", 
                       CNT_DIAG => #diagData.ErrorCount, 
                       DIAG := #diagData.RawBytes);
END_FUNCTION_BLOCK
``

---

## 3. 程序块设计、接口传参机制与多重实例

### 3.1 OB / FB / FC / Global DB 的职责划分与模块化树形调用原则

#### 【结论/规则】
- **OB1 纯调度化**：主循环组织块（OB1）严禁包含具体物理动作或数学计算逻辑，仅允许作为顶层调用树的“任务分发器”。
- **单向树形调用**：程序调用必须严格遵从 `OB -> 工艺单元 (Unit) FB -> 设备模块 (Equipment Module) FB -> 控制执行 (Control Module) FB/FC` 的树形单向依赖结构。严禁回环调用，严禁下层模块跨级访问顶层数据。

#### 【架构对比与职责矩阵（How）】

``
                     ┌───────────────┐
                     │  OB1 (Main)   │ 循环任务调度器
                     └───────┬───────┘
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
   ┌─────────────────┐               ┌─────────────────┐
   │ FB_InfeedUnit   │ 工艺单元 FB    │ FB_OutfeedUnit  │
   └────────┬────────┘               └────────┬────────┘
            │                                 │
     ┌──────┴──────┐                   ┌──────┴──────┐
     ▼             ▼                   ▼             ▼
┌─────────┐   ┌─────────┐         ┌─────────┐   ┌─────────┐
│FB_Motor │   │FB_Valve │ 设备FB   │FB_Motor │   │FC_Math  │
└─────────┘   └─────────┘ (多重实例) └─────────┘   └─────────┘
``

| 块类型 | 核心职责 | 存储特性 | 适用典型场景 |
| :--- | :--- | :--- | :--- |
| **OB (组织块)** | 操作系统与用户逻辑契约接口 | 由系统调用，无 IDB | 周期扫描 (OB1)、硬件中断 (OB40)、循环中断 (OB30)、启动 (OB100) |
| **FB (函数块)** | 具备状态记忆的独立工艺对象控制 | 必须依赖背景数据块 (IDB) 存储 Static 数据 | 具有状态机、滤波历史值、定时器累加的电机、气缸、轴控制 |
| **FC (函数)** | 纯无状态计算或通用逻辑转换 | 无静态记忆，仅有 Temp，运行结束立即销毁 | 格式解析、工程量标定（线性变换）、校验和计算、通用矩阵求逆 |
| **Global DB** | 跨工艺单元的全局共享数据媒介 | 驻留工作存储器，全程序可见 | 全局工步调度表、系统报警中心、上位机通讯交互缓冲区 |

---

### 3.2 核心机制表：FC 与 FB 的形参传递机制（By Value Copy vs By Reference）

#### 【结论/规则】
- **FB 大型结构体传递铁律**：在 FB 接口中传递任何大型结构化数据类型（`ARRAY`, `STRUCT`, `UDT`, `STRING`）时，**必须无条件声明为 `InOut` 参数**！
- 严禁在 FB 中将大型结构体声明为 `Input` 或 `Output`，否则会引发双向深拷贝性能崩塌。

#### 【底层原理（Why）】
- **By Value（按值调用 / 复制传递）**：系统在被调用块的内存区域（L 栈或 FB 的 IDB）分配等尺寸的独立物理空间，在调用前将实参逐字节完整拷贝进去。块内任何修改只改变私有副本，退出时再视情况拷回。
- **By Reference（按引用调用 / 指针传递）**：不创建副本。系统仅将实参的 32 位或 64 位绝对内存地址指针压入调用栈。块内部执行读写时，直接通过指针寻址现场实参。
- **FB 与 FC 的机制分水岭**：
  - **在 FC 中**：无论是 `Input`、`Output` 还是 `InOut`，只要数据类型是**结构化类型**（STRUCT/UDT/ARRAY），TIA 编译器在内部**全部自动按引用（By Reference）传递**！因此 FC 传递结构体具有极高效率。
  - **在 FB 中**：因为 FB 必须保证在“不调用该 FB 时，其内部背景值依然稳定独立”，所以 FB 的 `Input` 会在调用瞬间将外部实参**全量深拷贝**到其静态背景 IDB 中；其 `Output` 会在块执行完成时将 IDB 中的值**全量深拷贝**写出到外部实参！若一个 10 KB 的配方 UDT 作为 `Input` 传入 FB，每周期都会产生 10 KB 的无效内存搬运；若声明为 `InOut`，FB 仅存储一个 4 字节的引用指针，直接指向外部源数据，拷贝开销归零。

#### 【形参传递底层机制完整对照表（How）】

| 块类型 | 接口形参类型 | 基本数据类型 (Elementary: Bool/Int/DInt/Real) | 结构化数据类型 (Structured: ARRAY / STRUCT / UDT) |
| :--- | :--- | :--- | :--- |
| **FC** | **Input** | **By Value (Copy)** 复制至临时 L 栈 | **By Reference (Pointer)** 传递 4 字节指针，无拷贝 |
| **FC** | **Output** | **By Value (Copy)** 退出时从 L 栈写回 | **By Reference (Pointer)** 过程直接写入外部实参 |
| **FC** | **InOut** | **By Value (Copy)** 进入拷入/退出拷出 | **By Reference (Pointer)** 直接操作实参地址 |
| **FB** | **Input** | **By Value (Copy)** 复制并保存在背景 IDB | **By Value (Full Copy)** ⚠️ **全量深拷贝至 IDB，耗时致命！** |
| **FB** | **Output** | **By Value (Copy)** 退出时从 IDB 复制写回 | **By Value (Full Copy)** ⚠️ **退出全量深拷贝出 IDB，耗时致命！** |
| **FB** | **InOut** | **By Reference (Pointer)** 传递指针 | **By Reference (Pointer)** ✅ **零拷贝传递引用，性能最优！** |

``scl
// 正确设计示范：FB 处理大型结构体时必须强制走 InOut
FUNCTION_BLOCK "FB_BatchProcess"
{ S7_Optimized_Access := 'TRUE' }
   VAR_INPUT 
      startTrigger : Bool; // 基础类型：By Value 安全
   END_VAR
   VAR_IN_OUT 
      // 致命陷阱规避：若写在 VAR_INPUT，每次调用全量拷贝 5000 字节！
      // 声明在 VAR_IN_OUT，仅传递 4 字节引用指针
      rawRecipeData : "typeHugeRecipe_5KB"; 
      batchInventory : Array[0..100] of "typeMaterialLot";
   END_VAR
BEGIN
   IF #startTrigger THEN
      #batchInventory[0].RemainingWeight := #rawRecipeData.TargetWeight;
   END_IF;
END_FUNCTION_BLOCK
``

---

### 3.3 多重实例（Multi-instance）与参数实例

#### 【结论/规则】
- 针对基础功能块、IEC 定时器（`TON`, `TOF`, `TP`）和 IEC 计数器，**绝对禁止为每个调用创建独立的单一背景数据块（Single DB）**。
- 必须将它们作为**多重实例（Multi-instance）**统一声明在父 FB 的 `VAR`（Static 静态变量区）中。
- 自 TIA V14 起，针对可动态复用的功能执行逻辑，推荐通过 `VAR_IN_OUT` 声明**参数实例（Parameter Instance）**。

#### 【底层原理（Why）】
- **资源碎裂与封装摧毁**：如果一个设备包含 30 台电机，每台电机内部需要 2 个 TON 延时定时器。若使用独立 DB，系统将生成 60 个单实例定时器 DB，污染项目树，导致下载时的内存碎片化，彻底破坏面向对象设计的封装性。
- **多重实例的内存聚合**：将子 FB 或定时器定义为父 FB 的静态成员，子块的数据结构直接扁平化内嵌在父 FB 的单一 IDB 中。实例化父 FB 时，所有从属变量在内存中连续分配，随父块一键初始化与版本迁移。
- **参数实例的动态多态性**：通过将 FB 实例作为 `InOut` 形参传递给通用协调功能块，上层协调逻辑可以在不同扫描周期操作不同的硬件实例，实现逻辑与物理存储解耦。

#### 【代码示例（How）】

``scl
FUNCTION_BLOCK "FB_StationConveyor"
{ S7_Optimized_Access := 'TRUE' }
   VAR 
      // 规范：将定时器与底层驱动声明为多重实例 (Static 区)
      motorDrive : "FB_MotorDriver"; // 子功能块多重实例
      timerInfeedJam : TON_TIME;     // IEC 定时器多重实例
      
      sensorDebounce : Array[1..4] of TON_TIME; // 支持定时器数组化实例
      stationActive : Bool;
   END_VAR
BEGIN
   // 定时器直接点语法调用，无需外部分配背景 DB
   #timerInfeedJam(IN := #stationActive, PT := T#3S);
   
   IF #timerInfeedJam.Q THEN
      #motorDrive.Stop(); // 直接调用子实例
   END_IF;
END_FUNCTION_BLOCK

// 参数实例示范 (TIA V14+): 将实例动态传入通用管理 FC/FB
FUNCTION "FC_ResetDevice" : Void
{ S7_Optimized_Access := 'TRUE' }
   VAR_IN_OUT
      targetMotor : "FB_MotorDriver"; // 接收外部传入的实例参数
   END_VAR
BEGIN
   #targetMotor.ResetFault();
END_FUNCTION
``

---

## 4. 新数据类型、动态数组与零指针编程

### 4.1 S7-1200/1500 扩展数据类型与计算性能法则

#### 【结论/规则】
- 在 32 位/64 位 CPU 内部运算、循环迭代计数（`FOR`）及数组下标索引中，**必须优先使用 `DInt`（32 位有符号整数）**。
- 严禁在中间算术中滥用 `SInt` 或 `Int` 作为通用计数器。

#### 【底层原理（Why）】
- S7-1500 处理器内部算术逻辑单元（ALU）和寄存器是原生 32 位架构。
- 若声明 `Int`（16 位）作为循环计数变量执行 `FOR #i := 0 TO 100 DO`，CPU 在每一次递增和数组边界核验前，必须在底层强制插入一条符号位扩展指令（Sign Extension: 将 16 位 Int 转换为 32 位寄存器宽度），带来额外的微指令开销。
- 只有声明为 `DInt` 时，变量与硬件内部寄存器完全 1:1 对齐，执行吞吐量最高。
- 日期时间处理**必须放弃旧版 `DATE_AND_TIME` (DT)**，全面采用 **`DTL`**。DTL 内部以结构化格式组织，可以直接使用 `#myTimestamp.Year`、`#myTimestamp.Nanosecond` 进行符号访问，无需调用繁琐的位解包系统功能块。

#### 【数据类型选用基准（How）】

| 数据类型 | 位宽 | 适用场景与性能规则 |
| :--- | :--- | :--- |
| **`DInt`** | 32 位 | **首选用作循环控制变量 (FOR)、数组索引、常规计数**，硬件原生对齐最优 |
| **`LInt` / `ULInt`** | 64 位 | 仅限 S7-1500。超高分辨率编码器绝对脉冲累加、大容量物料唯一 ID 计数 |
| **`Real`** | 32 位 | 工业常规传感器工程量测量（压力、温度、流量），精度 7 位有效数字 |
| **`LReal`** | 64 位 | 高精度轨迹规划、复杂运动学逆解（Kinematics），精度 15 位有效数字 |
| **`DTL`** | 12 字节 | 结构化纳秒级时间戳。支持完全符号化子项点访问，取代过时的 DT |
| **`LTime`** | 64 位 | 纳秒级高精度时间间隔计算（`LT#-106751d...` 至 `LT#+106751d...`） |

---

### 4.2 动态变长数组 `ARRAY[*]` 与通用块设计

#### 【结论/规则】
- 针对需要处理不确定长度数据的通用工具块（FC/FB），必须在 `InOut` 接口中声明 **`ARRAY[*] OF <Type>`（变长通配数组）**。
- 块内部必须使用系统指令 **`LOWER_BOUND`** 与 **`UPPER_BOUND`** 动态获取数组下界与上界。
- 项目内常规数组索引推荐统一以常数定义（如 `0..#MAX_ELEMENTS`）。

#### 【底层原理（Why）】
- 在 S7-300/400 时代，编写支持任意长度数组的算法必须使用复杂的未类型化 `ANY` 指针与基于物理字节偏移的 `LAR1` 间接寻址，极易因偏移计算失误造成内存越界崩溃。
- `ARRAY[*]` 是强类型动态通配机制。调用时编译器严格检查元素数据类型（Type Safety），但放开元素个数维度。系统在调用时隐式将数组的维度上下限元数据压栈，彻底消灭物理指针。

#### 【标准 SCL 通用函数模板（How）】

``scl
FUNCTION "FC_CalculateAverage" : Real
{ S7_Optimized_Access := 'TRUE' }
   VAR_IN_OUT 
      values : Array[*] of Real; // 变长通配数组形参
   END_VAR
   VAR_TEMP 
      lowerIdx : DInt;
      upperIdx : DInt;
      i        : DInt;
      sum      : Real;
      count    : DInt;
   END_VAR
BEGIN
   // 动态获取数组当前实参的维度 1 的上下界
   #lowerIdx := LOWER_BOUND(ARR := #values, DIM := 1);
   #upperIdx := UPPER_BOUND(ARR := #values, DIM := 1);
   
   #count := (#upperIdx - #lowerIdx) + 1;
   #sum := 0.0;
   
   // 防御性校验：避免空数组除以 0
   IF #count <= 0 THEN
      #FC_CalculateAverage := 0.0;
      RETURN;
   END_IF;
   
   // 规范：索引变量必须为 DInt
   FOR #i := #lowerIdx TO #upperIdx DO
      #sum := #sum + #values[#i];
   END_FOR;
   
   #FC_CalculateAverage := #sum / DINT_TO_REAL(#count);
END_FUNCTION
``

---

### 4.3 片段访问（Slice Addressing）替代掩码与 AT 覆盖

#### 【结论/规则】
- 对非结构化位串（`Byte`, `Word`, `DWord`, `LWord`）进行位、字节、字的提取或组合时，**强制使用“片段访问”（Slice Access: `.%Xn`, `.%Bn`, `.%Wn`）**。
- **弃用 `AT` 覆盖架构**：在优化块中，严禁仅为了位拆解而使用 `AT` 关键字（若在 FB Static 中使用 `AT`，必须勾选“在 IDB 中设置”，会导致局部变量失去优化重排优势）。批量位聚合推荐使用 **`SCATTER`** 和 **`GATHER`** 指令。

#### 【底层原理（Why）】
- 片段访问由 TIA 编译器在语法层直接支持，编译为极其精简的位/字节提取机器指令，执行效率最高，且完全不打破优化数据块的数据对齐和保持性分配。
- `SCATTER` / `GATHER` 指令则是硬件级位向量搬运，单条指令实现整字与布尔数组的映射转换。

#### 【代码示例（How）】

``scl
FUNCTION "FC_SliceOperations" : Void
{ S7_Optimized_Access := 'TRUE' }
   VAR_INPUT 
      statusDWord : DWord;
      boolArray : Array[0..15] of Bool;
   END_VAR
   VAR_OUTPUT 
      alarmHighByte : Byte;
      isWarningBit  : Bool;
      packedWord    : Word;
   END_VAR
BEGIN
   // 1. 片段访问 (Slice Access)
   #isWarningBit  := #statusDWord.%X5; // 直接提取第 5 个 bit
   #alarmHighByte := #statusDWord.%B1; // 直接提取第 1 个 byte (Bit 8..15)
   
   // 2. 替代 AT 覆盖的现代聚合指令：SCATTER (分散) 与 GATHER (聚集)
   // 将 16 位布尔数组聚合成一个标准 Word
   GATHER(IN := #boolArray, OUT => #packedWord);
END_FUNCTION
``

---

### 4.4 `VARIANT` 替代 `ANY` 指针与零指针编程

#### 【结论/规则】
- 彻底废除 `ANY` 和 `POINTER` 指针。当且仅当需要编写**完全独立于数据类型**的底层通用组件（如通用通信序列化、通用 JSON 格式化、通用环形队列缓冲区）时，才允许在 `InOut` 中使用 **`VARIANT`**。
- **常规业务逻辑严禁滥用 `VARIANT`**。只要数据类型在工程期可知，必须使用明确的强类型 UDT。

#### 【底层原理（Why）】
- **类型安全（Type Safety）**：`ANY` 指针是完全无类型的 10 字节物理地址指针，一旦指向错误区域会导致静默内存越界破坏。`VARIANT` 包含了运行时类型元数据，系统强制在执行期做类型判定。
- **性能代价（Performance Overhead）**：`VARIANT` 的解包、类型检查（`TypeOf`）、读写（`VariantGet` / `VariantPut`）是由操作系统在运行时通过复杂的解释算法执行的，**其指令耗时是常规强类型 UDT 直接访问的 5~20 倍**。如果在扫描周期的 `FOR` 循环内部高频调用 `VARIANT` 指令，扫描周期将急剧拉长，极易触发扫描超时中断。

#### 【标准 SCL 通用分流模板（How）】

``scl
FUNCTION "FC_WriteGenericValue" : Int
{ S7_Optimized_Access := 'TRUE' }
   VAR_IN_OUT 
      targetData : Variant; // 动态通用类型容器
   END_VAR
   VAR_TEMP 
      tempInt  : Int;
      tempReal : Real;
   END_VAR
BEGIN
   // 严禁在高速循环内执行此判定，仅在框架入口分流使用
   CASE TypeOf(#targetData) OF
      Int:
         #tempInt := 100;
         VariantPut(SRC := #tempInt, DST => #targetData);
         #FC_WriteGenericValue := 0; // 成功
         
      Real:
         #tempReal := 3.14159;
         VariantPut(SRC := #tempReal, DST => #targetData);
         #FC_WriteGenericValue := 0; // 成功
         
      ELSE
         #FC_WriteGenericValue := -1; // 不支持的未知类型
   END_CASE;
END_FUNCTION
``

---

### 4.5 结构化变量直接整体赋值与直接比较

#### 【结论/规则】
- 针对相同 UDT 或结构体变量，**必须使用直接整体赋值（`#udtA := #udtB;`）和直接等值比较（`IF #udtA = #udtB THEN`）**。
- 严禁逐个字段编写冗余的赋值或比较语句。

#### 【底层原理（Why）】
- TIA Portal V14+ 编译器对优化块内的 UDT 提供了整体赋值与全量比较的底层机器码优化。
- 对于整体赋值，编译器直接调用 CPU 的单周期块移动微指令；对于比较，底层采用高效的内存比对，无需生成分支跳转判断逻辑，不仅极大减少程序体积，而且运行效率远高于工程师手动展开的逐字段比对。

#### 【代码示例（How）】

``scl
IF #currentAxisParam = #targetAxisParam THEN
   #paramSynchronized := TRUE;
ELSE
   #currentAxisParam := #targetAxisParam; // 1 行代码直接整体深度复制
   #paramSynchronized := FALSE;
END_IF;
``

---

## 5. SCL 编程核心技巧与安全防坑

### 5.1 使用 `REGION` 组织结构化代码

#### 【结论/规则】
- 每一个中大型 SCL 块（> 30 行）**必须严格使用 `REGION <区域名称>` 与 `END_REGION` 对逻辑进行物理区隔**。

#### 【代码架构模板（How）】

``scl
REGION InputPreProcessing // 参数预处理与边缘检测
   #statTriggerPulse := #execute AND NOT #statExecuteOld;
   #statExecuteOld   := #execute;
END_REGION

REGION StateMachineLogic  // 核心状态机执行
   CASE #statState OF
      #STATE_IDLE:
         IF #statTriggerPulse THEN
            #statState := #STATE_RUNNING;
         END_IF;
      // ...
   END_CASE;
END_REGION

REGION OutputMapping      // 结果输出映射与状态回写
   #busy := (#statState <> #STATE_IDLE);
   #done := (#statState = #STATE_COMPLETED);
END_REGION
``

---

### 5.2 循环安全准则与数组索引缓存优化（Cache Optimization）

#### 【结论/规则】
- **禁止在 `FOR` 循环体内手动篡改循环计数器**（在 TIA SCL 中该行为不仅被编译器严格拦截报警，也是死循环的高发源）。
- **`WHILE` 与 `REPEAT` 防死锁铁律**：循环体必须强制加入防死锁计数器（Watchdog Counter），达到安全阈值后执行 `EXIT` 并发出严重报警。
- **数组索引缓存优化铁律**：在循环内或同一段逻辑内多次访问复杂数组元素的多个属性时，**必须先将该元素浅拷贝至临时变量 `#tempItem`，操作完毕后若有修改再写回**！

#### 【底层原理（Why）】
- **隐式边界安全检查开销**：在优化块中，SCL 每次执行 `#statArray[#idx].SubItem1`，CPU 在机器码层面都会隐式插入两条指令：1) 判断 `#idx` 是否位于数组合法边界内（Bound Check）；2) 计算基地址加上元素跨度偏移。
- 若在一个逻辑段内对 `#statArray[#idx]` 的 5 个字段进行连续读写，CPU 会反复执行 5 次边界安全核验和 5 次地址偏移重算！通过缓存至 Temp 变量，将 5 次越界检查和地址换算压减为 1 次，在大容量循环处理中性能提升可达 300% 以上。

#### 【对比优化代码（How）】

``scl
// -----------------------------------------------------------------------------
// 低效反例：每次访问都触发越界核验与偏移计算
// -----------------------------------------------------------------------------
FOR #i := 0 TO 100 DO
   #statStations[#i].MotorRunning := TRUE;
   #statStations[#i].ActualSpeed := #measuredSpeed;
   #statStations[#i].ErrorCode := 0;
   #statStations[#i].ProcessedCount := #statStations[#i].ProcessedCount + 1;
END_FOR;

// -----------------------------------------------------------------------------
// 高效规范：使用 Temp 缓存对象进行局部操作 (Cache Optimization)
// -----------------------------------------------------------------------------
FOR #i := 0 TO 100 DO
   #tempStation := #statStations[#i]; // 单次命中读取
   
   #tempStation.MotorRunning   := TRUE;
   #tempStation.ActualSpeed    := #measuredSpeed;
   #tempStation.ErrorCode      := 0;
   #tempStation.ProcessedCount := #tempStation.ProcessedCount + 1;
   
   #statStations[#i] := #tempStation; // 单次写回
END_FOR;
``

---

### 5.3 布尔逻辑直赋、CASE 状态机与分支优化

#### 【结论/规则】
- **严禁编写冗余布尔 IF**：禁止写 `IF #cond THEN #out := TRUE; ELSE #out := FALSE; END_IF;`，必须写 `#out := #cond;`。
- **状态机必须强制包含 `ELSE` 分支**：在 `CASE` 语句中，必须显式书写 `ELSE`，用于捕获非法/越界状态，触发故障安全联锁并复位。
- **`IF / ELSIF` 概率排序**：将现场最容易命中、发生概率最高的条件置于顶层 `IF`，小概率异常置于末端 `ELSIF`，降低平均指令执行深度。

#### 【代码示例（How）】

``scl
// 1. 布尔逻辑直赋：单行完成表达式求值，编译器生成最高效的位逻辑指令
#qMotorRun := (#iAutoMode OR #iManualStart) AND NOT #iSafetyHalted AND NOT #statOverloadTripped;

// 2. CASE 规范：包含完整的安全闭环 ELSE
CASE #statStep OF
   0: // 待机
      IF #startCmd THEN #statStep := 10; END_IF;
   10: // 运行
      IF #workFinished THEN #statStep := 20; END_IF;
   20: // 结束
      #statStep := 0;
      
   ELSE // 核心防护：捕获内存位翻转或逻辑错误导致的非法状态
      #errorId := 16#F001; // 未知步序故障
      #error := TRUE;
      #statStep := 0;      // 强行安全归位
END_CASE;
``

---

### 5.4 临时变量（Temp）铁律：先写后读

#### 【结论/规则】
- **在任何 FB/FC 中，对 Temp 变量的使用必须严格遵守“先写后读”（Write Before Read）原则**。
- 绝不能依赖跨扫描周期的 Temp 变量残余值。

#### 【底层原理（Why）】
- Temp 变量分配在 CPU 的临时局部数据区（L 栈）。当块执行完毕退出时，L 栈空间立即被释放，随后的其他 FB/FC/中断 OB 会无条件覆盖这片内存。
- 尽管在 S7-1500 优化块中，基本类型 Temp 会在每次进入块时被操作系统初始化为默认值，但在非优化块、复杂复合类型、或者移植到其他 IEC 兼容平台时，未初始化的 Temp 变量将直接读取到上一代码块遗留的“脏内存数据”。这是导致设备偶发性动作失常、且在离线仿真中无法复现的头号杀手。

#### 【反例 vs 正例（How）】

``scl
// 致命反例：未显式初始化直接参与分支累加
VAR_TEMP
   tempAccumulator : DInt; // 若上一个使用 L 栈的块残留了数据
END_VAR
IF #condition THEN
   #tempAccumulator := #tempAccumulator + 1; // 结果为未定义的随机垃圾值！
END_IF;

// 正确规范：在块的第一行无条件完成显式清零/赋初值
VAR_TEMP
   tempAccumulator : DInt;
END_VAR
#tempAccumulator := 0; // 严格先写
IF #condition THEN
   #tempAccumulator := #tempAccumulator + 1; // 稳定确定性运算
END_IF;
``

---

### 5.5 `ENO` 使能输出与错误评估

#### 【结论/规则】
- 在以 SCL 语言编写的高性能计算块中，**推荐在块属性中关闭“生成 ENO”（Set ENO automatically）**，消除无谓的性能开销。
- 针对除法运算、浮点计算和数组间接寻址，**必须在代码层做显式前置防御，严禁依赖系统异常捕获**。

#### 【底层原理（Why）】
- 当开启 ENO 自动评估时，编译器会在每一个算术指令、类型转换和数组访问后插入状态字校验代码，判断是否发生溢出或越界，使代码体积膨胀且拖慢运行速度。
- 显式的前置数值校验（如分母判零）比触发 CPU 内部浮点异常耗时更短、更可控。

#### 【代码示例（How）】

``scl
// 前置防御性编程：免除除零异常与全局错误中断
IF #flowRateSetpoint > 0.0 THEN
   #valveOpeningRatio := #currentMassFlow / #flowRateSetpoint;
   #enoValid := TRUE;
ELSE
   #valveOpeningRatio := 0.0;
   #enoValid := FALSE;
END_IF;
``

---

## 6. PLCopen 异步块标准模板（Enable vs Execute）

### 6.1 连续执行块（`Enable` 电平触发型）

#### 【规范定义】
- **触发机制**：电平有效触发。只要 `Enable = TRUE`，块在每个扫描周期持续执行操作。
- **输出语义**：
  - `Valid`：输出引脚当前的数据完全有效且已被刷新。
  - `Busy`：功能块当前正在处理运算。
  - `Error`：发生故障。
  - `Status`：当前状态代码或报警错误码（无错误时为 `16#0000` 或 `16#7000`）。
- **终止行为**：一旦 `Enable` 变为 `FALSE`，块立即停止后续操作，`Valid` 与 `Busy` 必须在**本周期内无条件复位为 `FALSE`**。

#### 【标准 SCL 模板（How）】

``scl
FUNCTION_BLOCK "FB_ContinuousSensorReader"
{ S7_Optimized_Access := 'TRUE' }
   VAR_INPUT 
      enable : Bool;
      hwIdentifier : HW_IO;
   END_VAR
   VAR_OUTPUT 
      valid  : Bool;
      busy   : Bool;
      error  : Bool;
      status : Word;
      scaledValue : Real;
   END_VAR
   VAR 
      statRawVal : Int;
      statRetVal : Int;
   END_VAR
BEGIN
   IF #enable THEN
      #busy := TRUE;
      // 模拟读取硬件模拟量过程映像
      #statRetVal := RD_REC(LADDR := #hwIdentifier, RECORD => #statRawVal);
      
      IF #statRetVal = 0 THEN
         #scaledValue := INT_TO_REAL(#statRawVal) * 0.1;
         #valid  := TRUE;
         #error  := FALSE;
         #status := 16#7002; // 正在持续正常运行
      ELSE
         #valid  := FALSE;
         #error  := TRUE;
         #status := INT_TO_WORD(#statRetVal); // 错误代码
      END_IF;
   ELSE
      // Enable 为低电平时彻底重置状态
      #valid  := FALSE;
      #busy   := FALSE;
      #error  := FALSE;
      #status := 16#7000; // 块未激活 (Idle)
   END_IF;
END_FUNCTION_BLOCK
``

---

### 6.2 单次触发块（`Execute` 上升沿触发型）

#### 【规范定义】
- **触发机制**：上升沿脉冲触发动作启动。
- **输出语义**：
  - `Done`：单次动作成功完成（与 `Busy` 互斥）。
  - `Busy`：动作已启动但尚未完成。
  - `Error`：动作失败终止。
  - `Status`：当前工步或失败错误代码。
- **保持铁律（Hold Rule）**：
  - 若触发方在动作完成时依然保持 `Execute = TRUE`，则 `Done` 或 `Error` **必须保持为 `TRUE` 直到 `Execute` 变低**。
  - 若调用方在动作进行中已经将 `Execute` 变低（提前释放），则当动作完成时，`Done` 或 `Error` **必须严格输出且仅输出 1 个扫描周期的高电平脉冲**！

#### 【PLCopen 工业标准 SCL 状态机模板（How）】

``scl
FUNCTION_BLOCK "FB_ExecuteAsyncAction"
{ S7_Optimized_Access := 'TRUE' }
   VAR_INPUT 
      execute : Bool;
      targetPosition : Real;
   END_VAR
   VAR_OUTPUT 
      done   : Bool;
      busy   : Bool;
      error  : Bool;
      status : Word;
   END_VAR
   VAR 
      statExecuteOld : Bool;
      statState      : Int := 0; // 0:IDLE, 10:BUSY, 20:DONE_HOLD, 30:ERROR_HOLD
      statSimTimer   : TON_TIME;
   END_VAR
   VAR_CONST 
      STATUS_IDLE       : Word := 16#7000;
      STATUS_BUSY       : Word := 16#7001;
      STATUS_DONE       : Word := 16#0000;
      STATUS_ERR_ABORT  : Word := 16#8001;
   END_VAR
BEGIN
   // 1. 边缘检测
   IF #execute AND NOT #statExecuteOld AND (#statState = 0) THEN
      #statState := 10; // 启动异步任务
      #done   := FALSE;
      #error  := FALSE;
      #busy   := TRUE;
      #status := #STATUS_BUSY;
   END_IF;
   #statExecuteOld := #execute;

   // 2. 状态机调度
   CASE #statState OF
      0: // IDLE
         #busy := FALSE;
         IF NOT #execute THEN
            #done   := FALSE;
            #error  := FALSE;
            #status := #STATUS_IDLE;
         END_IF;

      10: // 正在异步处理 (模拟耗时 2 秒的操作)
         #busy := TRUE;
         #statSimTimer(IN := TRUE, PT := T#2S);
         
         IF #statSimTimer.Q THEN
            #statSimTimer(IN := FALSE, PT := T#2S); // 复位定时器
            #busy := FALSE;
            
            // 假设处理成功
            IF #targetPosition >= 0.0 THEN
               #done   := TRUE;
               #error  := FALSE;
               #status := #STATUS_DONE;
               #statState := 20; // 转入保持状态
            ELSE
               #done   := FALSE;
               #error  := TRUE;
               #status := #STATUS_ERR_ABORT;
               #statState := 30; // 转入错误保持
            END_IF;
         END_IF;

      20: // 成功完成保持态
         IF NOT #execute THEN
            #done      := FALSE;
            #statState := 0; // Execute 释放，回归待机
         END_IF;

      30: // 错误发生保持态
         IF NOT #execute THEN
            #error     := FALSE;
            #statState := 0; // Execute 释放，回归待机
         END_IF;
   END_CASE;
END_FUNCTION_BLOCK
``

---

## 7. STEP 7 Safety（F-安全程序）核心规范

### 7.1 安全程序架构与运行机制

#### 【结论/规则】
- 安全程序必须运行在专用的 **F-运行组（F-Runtime Group）**中，由系统生成的 **F-OB（如 OB123，周期中断驱动）**调用“主安全块”（Main Safety Block）。
- 安全程序采用**全双重冗余逻辑与 PROFIsafe 总线通信**；每个 F-I/O 模块必须分配全网唯一的 **PROFIsafe 地址**。

#### 【底层原理（Why）】
- **确定性周期与故障导向安全**：F-OB 必须严格在恒定周期的中断中执行，以确保安全时间（Fault Reaction Time）完全可控。主安全块不能包含形式参数，其底层由系统生成的暗箱检验块（Safety System Blocks）实时比对双通道校验码。
- **值状态（Value Status / VS）取代旧版 QBAD**：
  - 在 S7-300F 时代，通道故障通过 F-I/O DB 中的 `QBAD`（高有效）判定。
  - 在 S7-1200F/1500F 中，废除 `QBAD`，引入过程映像中的**值状态（Value Status）**：
    - `Value Status = 1`（TRUE）：当前输入/输出过程值有效，无故障。
    - `Value Status = 0`（FALSE）：模块检测到断线、短路或通道钝化，输出替代值（安全零值）。
  - 值状态位紧随物理通道数据直接附加在过程映像输入区，安全程序中应直接符号化引用 `Tag_In_VS`。

#### 【F 架构图与状态对照（How）】

``
        ┌──────────────────────────────────────────────┐
        │        F-CPU 循环中断 (例如 OB123, 50ms)        │
        └──────────────────────┬───────────────────────┘
                               │ 驱动
                               ▼
        ┌──────────────────────────────────────────────┐
        │  主安全块 (Main Safety FB, 无参数形式)         │
        │  ├─ 调用用户 F-FB / F-FC                      │
        │  ├─ 评估 F-I/O 值状态 (Value Status)          │
        │  └─ 执行急停、安全门、双按钮安全功能块            │
        └──────────────────────┬───────────────────────┘
                               │
                               ▼
        ┌──────────────────────────────────────────────┐
        │  系统生成 F 验证保护块 (自动校验指令流冗余)        │
        └──────────────────────────────────────────────┘
``

| 场景状态 | S7-300F 遗留变量 (`QBAD`) | S7-1200F/1500F 现代机制 (`Value Status`) |
| :--- | :--- | :--- |
| **通道健康，数值有效** | `FALSE` | **`TRUE`** |
| **通道断线/短路/钝化** | `TRUE` | **`FALSE`** (输出安全值 0) |
| **故障消失，等待重合闸** | `TRUE` (等待 ACK_REI) | **`FALSE`** |
| **用户确认完成 (Reintegration)** | `FALSE` | **`TRUE`** |

---

### 7.2 安全程序支持的数据类型与约束

#### 【结论/规则】
- 安全程序仅支持极精简的强类型子集：**`Bool`, `Int`, `DInt`, `Word`, `Time` 以及合规的 F-PLC 数据类型（F-UDT）**。
- **严禁在安全程序中使用 `Real`（浮点数）与 `Array`（数组）**！不支持 F-UDT 的多层嵌套。

#### 【底层原理（Why）】
- 工业功能安全标准（IEC 61508 SIL3 / ISO 13849-1 PLe）对指令执行的确定性有极端要求。
- 浮点数由于 IEEE 754 存在舍入误差、非数（NaN）与非精确相等问题，无法在安全双内核之间执行绝对可靠的逐位二进制冗余比对；数组寻址由于存在指针动态越界风险，被安全编译器完全禁用。

#### 【类型支持矩阵（How）】

| 数据类型 | 安全程序是否支持 | 核心应用与约束说明 |
| :--- | :---: | :--- |
| **`Bool`** | ✅ 是 | 安全联锁、急停按钮常开/常闭触点、接触器反馈信号 |
| **`Int` / `DInt`** | ✅ 是 | 安全编码器绝对脉冲、安全计数、安全转速窗口监控 |
| **`Word`** | ✅ 是 | PROFIsafe 控制字与状态字评估 |
| **`Time`** | ✅ 是 | 安全延时（如安全门锁延时停机开门），与 DInt 长度相同可隐式转换 |
| **`Real`** | ❌ **严禁** | 不可用于安全计算！需用定点缩放的 `DInt` 代替浮点数 |
| **`Array`** | ❌ **严禁** | 无法通过安全编译器，结构化数据必须通过平铺 F-UDT 声明 |
| **`F-UDT`** | ✅ 是 | 符合安全规范的 PLC 数据类型，仅允许单层结构，禁止嵌套定义 |

---

### 7.3 标准程序与安全程序数据交换铁律

#### 【结论/规则】
- **严禁安全程序直接异步读取标准用户程序的 DB、M 区或全局变量**！
- 必须建立专门的**“单向数据交换网关 DB”**（如 `DB_ToSafety` 与 `DB_FromSafety`），并在主循环 OB1 与 F-OB 之间建立受保护的数据解耦。

#### 【底层原理（Why）】
- **数据损坏导致的 F-CPU 紧急停机（STOP）**：
  - 标准程序运行在主循环 OB1 中，安全程序运行在异步优先级的 F-OB（循环中断）中。
  - 若安全程序正在读取一个标准变量，而此时 OB1 或通信中断在后台恰好修改了该变量的低位字节，安全程序在双通道内部交叉校验（Cross-Check）时将检测到数据损坏（Data Inconsistency），安全系统会判定 PLC 内部遭到未知电气干扰或内存故障，**直接触发 F-CPU 进入紧急安全停机（CPU STOP）**，现场设备全线瘫痪！
- **隔离 DB 机制**：
  - 建立标准优化数据块 `DB_ToSafety`（标准程序写，安全程序读）和 `DB_FromSafety`（安全程序写，标准程序读）。
  - 在标准程序中，将 HMI 复位指令集中赋值到 `DB_ToSafety`。在 F-OB 执行时，仅在该周期的起始点单次抓取镜像，彻底隔绝并发脏写。

#### 【安全交换架构模式（How）】

``
   [标准程序 (OB1)]                                 [安全程序 (F-OB123)]
┌────────────────────┐                          ┌────────────────────────┐
│ HMI 操作/工步指令   │                          │ 核心安全急停/安全门逻辑 │
└─────────┬──────────┘                          └───────────▲────────────┘
          │ (单向写)                                         │ (单向读)
          ▼                                                 │
┌───────────────────────────────────────────────────────────┴────────────┐
│                    DB_ToSafety (标准全局优化 DB)                         │
│                    .ResetPushButton_FromHMI : Bool                     │
│                    .ProductionMode_Selected : Int                      │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│                   DB_FromSafety (标准全局优化 DB)                        │
│                   .EmergencyStopActive : Bool                          │
│                   .SafetyGateInterlockClosed : Bool                    │
└───────────────────────────────────────────────────────────▲────────────┘
          ▲                                                 │ (单向写)
          │ (单向读)                                         │
┌─────────┴──────────┐                          ┌───────────┴────────────┐
│ 上位机监控 / 报警   │                          │ 安全状态发布输出        │
└────────────────────┘                          └────────────────────────┘
``

---

### 7.4 安全逻辑设计与编译签名优化

#### 【结论/规则】
- **字面量规范**：安全程序中必须直接使用字面量 `TRUE` 和 `FALSE`，严禁通过常闭与常开触点串联的旧式花招去模拟布尔常量。
- **签名稳定性原则**：严禁在安全程序中使用 `JMP` / `LABEL` 跳转指令，尽量限制 IEC 定时器数量，调用层级严禁超过 8 层。

#### 【底层原理（Why）】
- **F-签名（F-Signature）**：安全程序通过“集体 F 签名”（Collective F-Signature）确保代码完整性。只要安全逻辑发生变化，签名即改变，要求重新签署法定安全验证报告。
- **JMP/LABEL 导致校验码爆炸**：在安全程序中使用跳转指令会打乱执行流的确定性，系统编译器被迫插入巨量的上下文校正与分支冗余指令，造成编译时间成倍延长，并极度消耗 F-CPU 运行时间。
- **定时器资源开销**：安全定时器（`TON`, `TOF`）会在后台实例化复杂的安全校验时钟逻辑，定时器过多将直接拉长 F-运行组最大循环时间，增加超时停机风险。

#### 【安全 SCL 接口防坑清单（How）】

``scl
// 1. 安全常量赋值：直接使用系统原生字面量 TRUE / FALSE
#statDisarmLampOut := FALSE;
#statSafetyHealthy := TRUE;

// 2. 严禁使用跳转与深层嵌套：
// 严禁书写：JMP Lab1; 必须完全展开为纯粹的布尔与状态逻辑表达！

// 3. 安全输入评估规范：同时评估通道物理电平与值状态 (Value Status)
// 只有在通道信号为 TRUE 且 值状态为 TRUE (有效) 时，才判定急停回路闭合
#statEStopHealthy := "DI_EStop_Channel1" AND "DI_EStop_Channel1_VS"
                     AND "DI_EStop_Channel2" AND "DI_EStop_Channel2_VS";
``

---

## 8. 总结：AI 编程 Agent 核心自检清单 (Pre-flight Checklist)

在为 S7-1200/1500 生成任何 SCL/LAD 代码或定义数据块之前，AI Agent 必须自检以下 10 条铁律：

1. **优化块检查**：所有 DB/FB/FC 的属性 `{ S7_Optimized_Access := 'TRUE' }` 是否开启？
2. **零 M 区违背**：代码中是否彻底杜绝了 `%M` 变量，全部改用结构化全局 DB？
3. **硬件直接映射**：I/O 过程映像是否通过 UDT 整体绑定到 `%I` / `%Q` 首地址？
4. **FB InOut 铁律**：FB 接口传递大型结构体（UDT/ARRAY）是否全部使用 `VAR_IN_OUT` 引用传递？
5. **多重实例彻底化**：定时器（TON）、计数器及子 FB 是否全部声明在父 FB 的 `VAR` (Static) 区？
6. **循环整型规范**：所有 `FOR` 循环计数变量及数组下标是否为原生的 32 位 `DInt`？
7. **数组缓存优化**：循环中多字段引用的数组对象，是否先缓存到了局部 Temp 变量？
8. **片段访问替代 AT**：是否使用 `.%X0`, `.%B0` 取代了可能破坏优化的 `AT` 覆盖？
9. **PLCopen 契约合规**：Execute 触发型块是否满足“Execute 未复位前保持 Done/Error，已复位则输出 1 周期脉冲”？
10. **安全隔离屏障**：安全逻辑中是否绝无直接访问标准 DB 的动作，且未引入 Real 或 Array？
