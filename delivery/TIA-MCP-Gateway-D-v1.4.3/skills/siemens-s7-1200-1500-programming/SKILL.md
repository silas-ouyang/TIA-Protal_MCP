---
name: siemens-s7-1200-1500-programming
description: 西门子 SIMATIC S7-1200 / S7-1500 官方编程风格指南（V2.0，78条规则）、编程指南（V1.6，优化块内存/符号化/SCL/F-Safety）与 LGF 通用函数库（V5.5.0，189块接口与原生SCL自研蓝本）规范。在设计 S7-1200/1500 程序架构、编写或审查 SCL/LAD/FBD/DB/UDT 代码、实现 PLCopen 异步状态机（enable/execute）、优化扫描周期性能或选用/自研 LGF 通用算法块时加载本 Skill。
---

# 西门子 S7-1200/S7-1500 编程规范与架构指南

本 Skill 蒸馏自西门子工业在线支持（SIOS）三份官方核心文档，采用**渐进式披露（Progressive Disclosure）**架构，提供 S7-1200/1500 的代码规范、底层内存机理与通用函数库蓝本。

---

## 1. 知识源优先级与本机 Skill 协同裁决

### 1.1 内部三份官方文档的关系与冲突裁决
| 文档源 | 版本与条目 ID | 角色定位 | 冲突裁决优先级 | 按需加载文件 |
| :--- | :--- | :--- | :--- | :--- |
| **编程风格指南 (Style Guide)** | V2.0 (109478084) | **规范源（What）**：78 条强制规则与建议 | **最高优**（与编程指南冲突时以本文件为准） | [`references/rules.md`](references/rules.md) / [`assets/rules.json`](assets/rules.json) |
| **编程指南 (Programming Guideline)** | V1.6 (81318674) | **理由源（Why）**：优化块内存对齐、传参机制、F-Safety | 次高优（提供底层原理与架构设计依据） | [`references/guideline.md`](references/guideline.md) |
| **LGF 通用函数库 (LGF Library)** | V5.5.0 (109479728) | **工具与蓝本源（How）**：189 个标准块接口与算法 | 对应 TIA V20/V21（V17-V19 对应 LGF V5.2.x） | [`references/lgf-index.md`](references/lgf-index.md) / [`references/lgf-blueprints.md`](references/lgf-blueprints.md) |

### 1.2 与本机其它博途 Skill 的职责边界及【命名双模裁决】
- **MCP 通道与读写编译下载流程** → 归 `tia-portal-ops` 管（先读后写、编译 0 错才保存）。
- **TIA V20 平台特性、`.s7dcl` 紧凑梯形图语法、UTF-8 BOM 编码、顺序控制防坑** → 归 `siemens-v20-ops` 管。
- **⚠️ 标识符命名冲突裁决（必读）**：
  - 西门子官方风格指南（`NF001`/`NF005`/`NF006`）强制要求使用**纯英文 `camelCasing` / `PascalCasing` 标识符**。
  - 本机 `tia-portal-ops` 与 `siemens-v20-ops` 规定常规现场工程**默认使用直观中文变量名与中文注释**（如 `"启动按钮"`、`"一号光电_空瓶到位"`）。
  - **统一裁决**：
    1. **常规业务工程模式（本机默认）**：PLC 变量、块注释、网络注释使用中文；但**必须 100% 遵守本 Skill 的架构规范、作用域区分思想（区分静态/临时/实例/常量）、接口传参规则、PLCopen 状态码与性能优化准则**。
    2. **标准化库 / 国际规范模式（开发通用库块 `L*`、封装标准 FB/FC 或用户指定按西门子官方风格时）**：严格执行 `NF001~NF014` 英文命名、大小写与前缀表（`stat`/`temp`/`inst`/`type`）。

---

## 2. 按需加载路由与决策树

``text
当前任务是什么？
├─ 1. 新建项目 / 设计 FB、FC、DB、UDT 架构
│   ├─ 先看本文件 §3（黄金铁律 Top 12 + FC/FB 传参矩阵 + PLCopen 状态码表）
│   ├─ 涉及跨周期异步块（通信/运动/序列/文件）→ 必读 references/guideline.md §6（enable/execute 模板）
│   ├─ 涉及优化块内存、UDT 映射 I/O、ARRAY[*]、F-Safety → 按需读 references/guideline.md §1~§7
│   └─ 涉及具体规则细节或正反例代码 → 查 §4 速查表定位 ID，再读 references/rules.md
│
├─ 2. 代码评审（Code Review）/ 性能优化 / 重构已有块
│   ├─ 逐项对照 §4 的 78 条规则速查表（重点核查 RU/SE/DA/PE 四大类）
│   └─ 调阅 references/rules.md 中对应规则 ID 的正反例代码与 rationale
│
└─ 3. 需要通用功能（FIFO队列、滤波、线性标定、脉冲继电器、斜坡、矩阵、CRC、日历、位/字互转等）
    ├─ 先读 references/lgf-index.md 检索 189 个 LGF 官方块
    ├─ 【分支 A】通过 d_tree 确认当前博途工程已导入对应 LGF_* 块：
    │   └─ 读 references/lgf/<块名>.md 获取精确引脚签名与错误码，直接实例化调用
    └─ 【分支 B】当前工程未导入 LGF 库（严禁直接写 LGF_* 调用，否则必报编译错误！）：
        └─ 读 references/lgf-blueprints.md（含 10 大高频算法块原生 SCL 完整实现）或 references/lgf/<块名>.md，用原生 SCL 自研实现
``

---

## 3. S7-1200/1500 核心架构与性能速查（常驻必背）

### 3.1 黄金编程铁律 Top 12
1. **强制优化块访问**（`DA003`）：所有新建 OB/FB/FC/DB 默认启用 `{ S7_Optimized_Access := 'TRUE' }`（编译器按类型位宽自动重排消除 Byte Gap、小端序高速访问）；严禁优化块与非优化块直接混传结构体（会触发 L 栈全量拷贝甚至溢出停机）。
2. **禁用 M 区，全用优化 Global DB**（`RU007`）：严禁使用 `%M/%MB/%MW/%MD` 位存储器（非优化、无命名空间、易地址重叠踩踏）；全局数据一律存入按功能拆分的优化 Global DB，并用 UDT 直接绑定 `%I`/`%Q` 首地址映射过程映像区。
3. **块内零全局变量，只走形参交换**（`RU004`/`DA005`/`DA006`）：可重用 FB/FC 内部严禁直接读写全局 DB 或 PLC 变量；严禁从 FB 外部跨界读写其 `Static` 静态变量；`Output` 参数每周期只在块末尾集中写一次且严禁块内回读（`DA008`）。
4. **多重实例封装**（`AL001`）：FB 内部调用的 IEC 定时器（`TON`/`TOF`/`TP`）、计数器及子 FB 必须声明在父 FB 的 `Static` 区作为多重实例（`inst*`），严禁生成漫天飞的独立单实例 DB。
5. **结构化大参数在 FB 中必放 `InOut`**（`PE003`/`DA007`）：FB 的 `Input` 和 `Output` 对结构化类型（`UDT`/`ARRAY`/`STRUCT`）总是执行**全量深拷贝（Copy）**！只有放 `InOut` 才是**按引用传递（Reference）**（见表 3-1）。
6. **临时变量先写后读 + 首选 Temp 缓存**（`SE002`/`PE006`）：所有 `Temp` 变量在读取前必须显式赋初值；仅单周期使用的中间变量和高频访问的 `InOut` 参数优先用 `Temp` 缓存。
7. **循环与数组索引一律用 `DInt` + `0..#MAX` + `Array[*]`**（`AL002`/`AL003`/`PE008`/`PE009`）：循环变量与数组上下限常量统一用 32 位 `DInt`（免类型转换）；循环内多次访问 `#statArray[#tempIndex]` 的不同成员时，必须先拷入 `#tempItem` 修改完再写回（消除重复边界检查）。
8. **用片段访问 `.%X0` 替代 `AT` 覆盖与掩码**（`PE002`/`PE010`）：访问 Byte/Word/DWord 的独立位用 `#wordVar.%X0`~`.%X15` 或 `SCATTER`/`GATHER`；严禁为用 `AT` 而勾选“在 IDB 中设置”（会导致 IDB 退化为混合非优化块）。
9. **消除魔数與冗余分支**（`RU005`/`PE011`/`PE012`/`DA016`/`DA017`）：除 `0`、`0.0`、`TRUE`、`FALSE` 外一律定义为 `UPPER_CASE` 局部常量；布尔赋值直接写 `#out := #a AND NOT #b;`；多状态分支用 `CASE ... OF` 且**必须包含 `ELSE` 错误捕获分支**。
10. **实参合法性前置校验与下层错误传递**（`SE001`/`SE005`/`DA015`）：入口先验除数非零与参数范围；调用系统函数或子块必须检查其错误返回，出错时将子块状态存入 `diagnostics.subfunctionStatus` 并记录出错步号 `stateNumber`。
11. **严格区分 PLCopen `enable` 与 `execute` 异步状态机**（`DA010`~`DA014`）：连续运行块用 `enable`（电平触发，输出 `valid/busy/error`）；单次作业块用 `execute`（上升沿触发，输出 `done/busy/error`，且 `execute` 提前释放时 `done/error` 只維持 1 个周期）。
12. **F-Safety 安全程序隔离铁律**（编程指南 §5）：安全程序禁用 `Real` 和 `Array`；标准程序与安全程序交换数据必须通过专用的标准 Global DB（`DB_ToSafety` / `DB_FromSafety`）中转解耦，严禁安全程序直接读运行中被异步修改的标准变量导致 F-CPU 报校验错停机。

### 3.2 表 3-1：S7-1200/1500 形参传递机制矩阵（`PE003` 核心）
| 块类型 | 形参方向 | 基本数据类型 (Bool/Int/DInt/Real/Word...) | 结构化数据类型 (UDT / STRUCT / ARRAY / String) | 工程选型铁律 |
| :--- | :--- | :--- | :--- | :--- |
| **FC** | `Input` / `Output` / `InOut` | **Copy**（按值拷贝） | **Reference**（按指针引用传递） | FC 传递结构体天然高效（前提：双方均为优化块） |
| **FB** | `Input` / `Output` | **Copy**（按值拷贝至 IDB） | **Copy（按值全量深拷贝至 IDB！）** | ⚠️ **FB 的 In/Out 传大结构体性能极差，严禁放大型 UDT/数组** |
| **FB** | `InOut` | **Copy**（按值拷贝） | **Reference（按指针引用传递）** | ✅ **FB 传递 UDT、数组或超过 10 个参数组时，必须放 `InOut`！** |

### 3.3 表 3-2：PLCopen 异步接口与标准化 `status` 状态码表（`DA011`~`DA014`）
| 状态码区间 (Word) | 最高半字节 | 标准常量命名示例 | 规范含义与 error 标志关系 |
| :--- | :--- | :--- | :--- |
| **`16#0000`** | `16#0` | `STATUS_EXECUTION_FINISHED` / `STATUS_NO_ERROR` | 命令执行完成，无警告，无进一步信息（`error = FALSE`） |
| **`16#0001..16#0FFF`** | `16#0` | `STATUS_FINISHED_WITH_INFO` | 命令执行完成，附带详细信息（`error = FALSE`） |
| **`16#7000`** | `16#7` | `STATUS_NO_CALL` | 没有正在执行的命令 / 块处于空闲初始态（`error = FALSE, busy = FALSE`） |
| **`16#7001`** | `16#7` | `STATUS_FIRST_CALL` | 收到新命令后的第一次调用 / 上升沿启动瞬间（`error = FALSE, busy = TRUE`） |
| **`16#7002`** | `16#7` | `STATUS_SUBSEQUENT_CALL` | 命令激活后的后续周期执行中，无附加信息（`error = FALSE, busy = TRUE`） |
| **`16#7003..16#7FFF`** | `16#7` | `WARN_*` / `SUBSEQUENT_INFO` | 执行期间附带详细信息或非中断性警告（`error = FALSE, busy = TRUE`） |
| **`16#8001..16#81FF`** | `16#8` | `ERR_OPERATOR` | 函数块操作/控制时序错误（Bit 15 = 1，**`error = TRUE`**） |
| **`16#8200..16#83FF`** | `16#8` | `ERR_PARAMETER` | 外部传入的形参设定错误/超限/类型不符（**`error = TRUE`**） |
| **`16#8400..16#85FF`** | `16#8` | `ERR_EXTERNAL` | 外部执行条件错误，如 I/O 故障、轴未归位、队列已满/空（**`error = TRUE`**） |
| **`16#8600..16#87FF`** | `16#8` | `ERR_INTERNAL` | 内部执行错误，如调用底层系统函数报错，查 `subfunctionStatus`（**`error = TRUE`**） |
| **`16#8800..16#8FFF`** | `16#8` | `RESERVED` | 系统保留区间（**`error = TRUE`**） |
| **`16#9000..16#FFFF`** | `16#9..F` | `ERR_USER_*` | 用户/特定工艺自定义错误分类区间（Bit 15 = 1，**`error = TRUE`**） |

### 3.4 表 3-3：西门子标准作用域前缀与命名速查表（`NF004`~`NF011`）
| 对象 / 变量作用域 | 前缀要求 | 大小写规则 | 标准正例 |
| :--- | :--- | :--- | :--- |
| **块形参 (`In` / `Out` / `InOut`)** | **无前缀** | `camelCasing` | `enable`, `execute`, `done`, `conveyorAxis` |
| **PLC 变量 (Tag) / 全局 DB 内成员 / UDT 内成员** | **无前缀** | `camelCasing` | `lightBarrierLeft`, `powerBusReady`, `stateNumber` |
| **FB 静态变量 (`Static`)** | **`stat`** | `camelCasing` | `statState`, `statTriggerOld`, `statVelocity` |
| **局部临时变量 (`Temp`)** | **`temp`** | `camelCasing` | `tempIndex`, `tempCurrentData`, `tempRetVal` |
| **多重实例 (`Static` 内 FB) / 参数实例** | **`inst`** | `camelCasing` | `instWatchDogTimer`, `instWatchDogTimers` (数组用复数) |
| **单实例数据块 (Single Instance DB)** | **`Inst`** | `PascalCasing` | `InstHeater`, `InstConveyorFeed` |
| **PLC 数据类型 (UDT)** | **`type`** | `camelCasing` | `typeDiagnostics`, `typeMotorConfig` (库内为 `LGF_typeGPS`) |
| **库 (Library) 及库内元素** | **`L<库名>_`** | 库名 ≤ 8 字符 | 库: `LGF`, `LCom`; 块: `LGF_PulseRelay`; 常量: `LGF_ERR_...` |
| **程序块 (`OB`/`FB`/`FC`/`Global DB`) / 变量表 / TO** | **无前缀** | `PascalCasing` | `Main`, `HeatTank`, `CalculateTime`, `MachineData` |
| **符号常量（局部 `Constant` / 全局用户常量）** | **无前缀** | `UPPER_CASE` | `MAX_VELOCITY`, `BUFFER_UPPER_LIMIT`, `STATUS_NO_CALL` |
| **官方推荐单个缩写（每标识符限用 1 个）** | - | 按所处位置 | `Min`/`Max`, `Act`(当前), `Next`/`Prev`, `Avg`, `Sum`, `Diff`, `Cnt`, `Len`, `Pos`, `Ris`/`Fal`(沿), `Old`, `Sim`, `Dir`, `Err`/`Warn`, `Cmd`, `Addr` |

---

## 4. 编程风格指南 78 条规则全量速查表（48 规则 + 30 建议）

> 详情、原理解释（`rationale`）与正反代码示例请按 ID 查阅 [`references/rules.md`](references/rules.md) 或机器可读文件 [`assets/rules.json`](assets/rules.json)。

| ID | 类型 | 类别 | 规则标题 | 一句话核心要求 |
| :--- | :--- | :--- | :--- | :--- |
| **ES001** | 规则 | 设置 | 用户界面语言 “English” | 界面语言设为 English，确保新建项目编辑/参考语言及系统常量统一为英语。 |
| **ES002** | 规则 | 设置 | 助记符 “International” | 助记符设为 International（I/Q/M、TON），严禁使用德语助记符（E/A/M）。 |
| **ES003** | 建议 | 设置 | 编辑器中的非比例字体 | 编辑器使用等宽字体（推荐 Consolas 10pt），保证缩进对齐与相似字符区分。 |
| **ES004** | 规则 | 设置 | 带有两个空格的智能缩进 | 启用 Smart 智能缩进，每级缩进 2 个空格，严禁在文本代码中使用 Tab 制表符。 |
| **ES005** | 规则 | 设置 | 操作数的符号表示 | 操作数表示方式设为 Symbolic（符号寻址）。 |
| **ES006** | 规则 | 设置 | 符合 IEC 的编程 | 默认开启新建程序块的 IEC 检查（IEC check），强制保障类型安全。 |
| **ES007** | 规则 | 设置 | 通过 HMI/OPC UA/Web API 显式数据访问 | 全局默认禁用新建变量的 HMI/OPC UA/Web API 访问与写入权限，仅按需显式开启。 |
| **ES008** | 规则 | 设置 | 启用自动值计算 (ENO) | 默认启用指令的 EN/ENO 自动值边界与运行时错误评估机制。 |
| **ES009** | 规则 | 设置 | 自动计算数组边界 | 必须启用编译期数组边界自动计算与越界检查。 |
| **GL001** | 规则 | 全球化 | 使用一致的语言 | PLC 与 HMI 各语言槽位中的文本必须与对应语种严格一致，严禁语种错位。 |
| **GL002** | 规则 | 全球化 | 设置编辑参考语言为 “English (US)” | 国际项目将编辑语言和参考语言均设为 English (US)（本机中文项目保留 en-US 资源词条）。 |
| **GL003** | 规则 | 全球化 | 提供所有项目语言的文本 | 为所有已激活的项目语言提供完整翻译文本（至少必须包含完整 English 文本）。 |
| **NF001** | 规则 | 命名 | 唯一且一致的英文标识符 | 块名用动词开头，数组用复数，状态布尔用 `is`/`can`/`has` 开头，替换默认形参占位符。 |
| **NF002** | 规则 | 命名 | 使用有意义的注释和属性 | 为块、接口参数、网络、变量、UDT 成员、变量表及报警列表编写有意义的描述注释。 |
| **NF003** | 规则 | 命名 | 记录开发人员信息 | 在块属性填用户信息，并在代码顶部包含标准块头模板（作者/目标固件/TIA版本/变更日志）。 |
| **NF004** | 规则 | 命名 | 遵守库的前缀和结构 | 库名以 `L` 开头且 ≤8 字符（如 `LGF`），库内所有元素冠以 `<库名>_` 前缀并归入同名子文件夹。 |
| **NF005** | 规则 | 命名 | 使用帕斯卡（PascalCasing）命名法 | 程序块、软件单元、工艺对象、库、项目、变量表、监控表采用大驼峰 `PascalCasing`。 |
| **NF006** | 规则 | 命名 | 对代码元素使用驼峰命名规则 camelCasing | 变量、UDT、STRUCT、PLC 变量和块形参采用小驼峰 `camelCasing`，不用下划线。 |
| **NF007** | 规则 | 命名 | 使用前缀 | 形参/全局变量/UDT成员无前缀；临时加 `temp`，静态加 `stat`，多重实例加 `inst`，单实例加 `Inst`，UDT加 `type`。 |
| **NF008** | 规则 | 命名 | 用大写字母表示常量标识符 | 局部与全局符号常量全用大写字母并用下划线分隔（`MAX_VELOCITY`），`TRUE`/`FALSE` 大写。 |
| **NF009** | 规则 | 命名 | 限制标识符的字符集 | 遵循国际规范时仅用 `a-z`、`A-Z`、`0-9` 和 `_`，严禁空格及 WinCC 不支持的特殊字符。 |
| **NF010** | 建议 | 命名 | 限制标识符的长度 | 单个标识符总长度（含前缀和库名）建议不超过 24 个字符。 |
| **NF011** | 建议 | 命名 | 每个标识符仅使用一个缩写 | 单个标识符不连续堆叠缩写，优先采用官方标准缩写表（`Act`/`Prev`/`Avg`/`Cnt`/`Pos`/`Ris`/`Fal`等）。 |
| **NF012** | 规则 | 命名 | 以对应的格式初始化变量 | 初始化字面量须匹配类型格式（Word 用 `16#7000`，Byte 用 `16#01`，LReal 用 `0.0`，DInt 用 `101`）。 |
| **NF013** | 建议 | 命名 | 隐藏可选形参 | 为不常改动的可选形参设默认值并在块接口属性中设为隐藏（Hidden）。 |
| **NF014** | 规则 | 命名 | 有意义地格式化 SCL 代码 | 仅用 `//` 行注释说原因；运算符前后加空格；子表达式加括号；`THEN`/`ELSE` 后必换行。 |
| **RU001** | 规则 | 复用 | 提供可以仿真的块 | 在项目属性 Protection 中勾选“块编译时支持仿真”，确保块可在 PLCSIM Advanced 中运行。 |
| **RU002** | 规则 | 复用 | 完全使用库进行版本控制 | 可复用 FC/FB/UDT 存为库类型（Types），采用 `Major.Minor.Patch`（从 `1.0.0` 起）管理版本。 |
| **RU003** | 规则 | 复用 | 在已发布的项目中只保留已发布的类型 | 交付项目与库中只保留“已发布（Released）”状态的类型，严禁残留“测试中（In test）”版本。 |
| **RU004** | 规则 | 复用 | 只使用局部变量 | 可复用 FC/FB 内严禁直接访问全局变量/DB/I/O/常数，外部数据一律经形参传入以达成库一致性。 |
| **RU005** | 规则 | 复用 | 使用本地符号常量 | 块内使用 `Constant` 局部符号常量，严禁出现除 `0`/`0.0`/`TRUE`/`FALSE` 以外的硬编码魔数。 |
| **RU006** | 规则 | 复用 | 程序完全符号化 | 100% 采用符号化寻址，严禁使用绝对地址或 `ANY` 指针（动态类型改用 `VARIANT` 或 `REF_TO`）。 |
| **RU007** | 建议 | 复用 | 独立于硬件编程 | 仅使用 IEC 标准硬件无关类型与指令（用 `IEC_Timer` 替代 `S5-Timer`，用 Global DB 替代 M 区）。 |
| **RU008** | 建议 | 复用 | 使用模板 | 基于经过验证的标准化模板（如 LGF 中的 PLCopen `enable`/`execute` 块模板）开发新块。 |
| **AL001** | 规则 | 分配 | 使用多重实例而不是单个实例 | FB 内部调用的子 FB 与 IEC 定时器/计数器必须声明在父 FB 的 `Static` 区作为多重实例。 |
| **AL002** | 建议 | 分配 | 定义从 0 到常数值的数组边界 | 数组边界定义为从 `0` 到 `DInt` 符号常量上限（`Array[0..#UPPER_LIMIT] of ...`）。 |
| **AL003** | 建议 | 分配 | 将数组参数声明为数组 [*] | 数组作为形参传入时声明为变长数组 `Array[*]`，用 `LOWER_BOUND` 和 `UPPER_BOUND` 获取边界。 |
| **AL004** | 建议 | 分配 | 指定所需的字符串长度 | 声明字符串时用常量限制实际所需长度（`String[#MAX_LEN]`），避免默认保留 254 字符浪费内存。 |
| **SE001** | 规则 | 安全 | 验证实际值 | 块执行前必须校验所有传入实参的有效性，非法时置 `error=TRUE` 并返回 `16#8200..83FF` 状态码。 |
| **SE002** | 规则 | 安全 | 初始化临时变量 | 每个 `Temp` 临时变量在当前周期首次读取前必须先完成显式初始化写入。 |
| **SE003** | 规则 | 安全 | 处理 ENO | 正确评估指令 `ENO`；若关闭了块的自动 EN/ENO，必须在块退出前显式赋值 `ENO := ...;`。 |
| **SE004** | 规则 | 安全 | 有选择地激活 HMI/OPC UA/Web API 数据访问 | 严禁将 FB 的 `Static` 静态变量暴露给 HMI/OPC UA，仅在专用接口变量或 UDT 上按需开启访问。 |
| **SE005** | 规则 | 安全 | 评估错误代码 | 调用任何返回错误或状态码的 FC/FB/系统函数后必须评估其返回值并做错误处理。 |
| **SE006** | 规则 | 安全 | 用评估逻辑写错误 OB | 添加的错误组织块（如 OB80/82/86/121/122）严禁留空，必须编写故障评估与安全处理逻辑。 |
| **DA001** | 规则 | 架构 | 对项目 / 库进行结构化和分组 | 用文件夹/软件单元/FC/FB/UDT 分层组织工程；SCL 块内必须用 `REGION ... END_REGION` 分区。 |
| **DA002** | 建议 | 架构 | 使用适当的编程语言 | 算法与数据处理首选 SCL；顶层块互连与布尔联锁用 LAD/FBD；步序流程用 GRAPH 或 SCL CASE。 |
| **DA003** | 规则 | 架构 | 设置 / 评估块属性 | 必须启用块的自动编号、IEC 检查、优化的块访问、多重实例能力，并验证库一致性。 |
| **DA004** | 规则 | 架构 | 使用 PLC 数据类型 | 跨块交换或整体传输的数据必须定义为 UDT（`type*`）；匿名 `STRUCT` 仅限块内私有分组使用。 |
| **DA005** | 规则 | 架构 | 只通过形参交换数据 | 块间数据交换必须且只能通过 `Input`、`Output`、`InOut` 形参进行。 |
| **DA006** | 规则 | 架构 | 仅从块内访问静态变量 | FB 的 `Static` 静态变量只能在 FB 内部访问，严禁从外部直接读写背景数据块（IDB）。 |
| **DA007** | 建议 | 架构 | 形参组 | 传递超过约 10 个相关参数时，将其聚合进 UDT 并声明为 `InOut` 形参按引用传递。 |
| **DA008** | 规则 | 架构 | 输出参数只写一次 | 每个周期仅在块末尾对 `Output` 参数和返回值集中写入一次，严禁在块内回读自己的 `Output`。 |
| **DA009** | 规则 | 架构 | 仅保留使用过的代码 | 发布程序中必须彻底清除未调用的块、未使用的变量/常量、死代码、注释掉的旧代码和外部源。 |
| **DA010** | 规则 | 架构 | 根据 PLCopen 开发异步块 | 所有跨多周期执行的异步功能块必须遵循 PLCopen 状态机与接口标准。 |
| **DA011** | 规则 | 架构 | 带 “enable” 的连续异步执行 | 连续运行块用 `enable` 电平触发，必含互斥的 `valid`/`error` 及 `busy` 输出，按规定时序复位。 |
| **DA012** | 规则 | 架构 | 带 “execute” 的单次异步执行 | 单次作业块用 `execute` 上升沿触发，必含互斥的 `done`/`busy`/`error`；提前释放时 `done/error` 置位 1 周期。 |
| **DA013** | 规则 | 架构 | 通过 “status”/“error” 返回状态 / 错误 | 用局部常量定义 `status (Word)` 状态码，最高位 Bit 15（`16#8000`）必须与 `error=TRUE` 同步。 |
| **DA014** | 规则 | 架构 | “status” 使用标准化的取值范围 | `status` 严格遵循标准区间：`16#0000` 完成、`16#7000` 空闲、`16#7001` 首周期、`16#7002` 执行中、`16#8xxx` 错误。 |
| **DA015** | 建议 | 架构 | 传递下层信息 | 子函数出错时，将当前 `status`、子块 `subfunctionStatus` 和出错步号 `stateNumber` 写入 `diagnostics` 输出。 |
| **DA016** | 建议 | 架构 | 用 CASE 指令代替 ELSIF 分支 | 多路离散分支或状态机优先使用 `CASE ... OF` 代替长链 `IF ... ELSIF`。 |
| **DA017** | 规则 | 架构 | 在 CASE 指令中创建 ELSE 分支 | 每个 `CASE` 语句必须包含 `ELSE` 分支以捕获并报告未定义的异常状态。 |
| **DA018** | 建议 | 架构 | 避免跳转和标签 | 避免使用 `JMP` / `GOTO` 跳转指令与标签，保持结构化单向控制流。 |
| **PE001** | 建议 | 性能 | 禁用 “创建扩展状态信息” | 生产运行环境中禁用块属性的“创建扩展状态信息”以减少内存和扫描耗时。 |
| **PE002** | 建议 | 性能 | 避免 “在 IDB 中设置” | 避免勾选“在 IDB 中设置”（防生成优化/非优化混合 DB），用片段访问或 `SCATTER`/`GATHER` 替代 `AT`。 |
| **PE003** | 建议 | 性能 | 使用引用传递结构化参数 | 在 FB 中传递结构化参数（UDT/ARRAY/STRUCT）必须放 `InOut` 以按引用传递，且保持双方均为优化块。 |
| **PE004** | 建议 | 性能 | 避免 Variant 形参 | 除通用通信/序列化/泛型容器外避免滥用 `Variant` 形参，优先为确定数据类型提供强类型专用块。 |
| **PE005** | 建议 | 性能 | 避免形参 “mode” | 避免用 `mode` 参数在单个大块内切换不同功能（产生死代码），应按单一职责拆分为独立程序块。 |
| **PE006** | 建议 | 性能 | 首选临时变量 | 单周期中间变量一律声明为 `Temp`；高频读写的 `Input`/`InOut` 形参可用 `Temp` 变量做本地缓存。 |
| **PE007** | 建议 | 性能 | 将重要的测试变量声明为静态 | 需在块执行后在线监控诊断的关键状态变量应声明在 FB 的 `Static` 区。 |
| **PE008** | 建议 | 性能 | 将控制 / 索引变量声明为 “DInt” | 循环控制变量、数组下标索引及数组上限常量统一声明为 `DInt` 类型（免隐式类型转换）。 |
| **PE009** | 建议 | 性能 | 避免多个相同的索引访问 | 循环内多次访问 `#statArray[#tempIndex]` 的多个成员时，先拷入 `#tempItem` 修改完再写回数组。 |
| **PE010** | 建议 | 性能 | 使用片段访问代替掩码 | 访问单个/少数独立位用片段访问（`#v.%X1`）；同时将多位模式与整字比对时用常量掩码（`AND #MASK`）。 |
| **PE011** | 建议 | 性能 | 简化 IF/ELSE 指令 | 将单纯赋 `TRUE`/`FALSE` 的 `IF/ELSE` 简化为直接布尔逻辑赋值（`#out := #a AND NOT #b;`）。 |
| **PE012** | 建议 | 性能 | 根据预期对 IF/ELSIF 分支进行排序 | 按条件成立概率从高到低排列 `IF/ELSIF` 分支，将最常命中的正常情况排在第一个 `IF`。 |
| **PE013** | 建议 | 性能 | 避免内存密集型指令 | 尽量避免使用 `GetSymbolName`、`GetSymbolPath`、`GetInstanceName`、`GetInstancePath`。 |
| **PE014** | 建议 | 性能 | 避免运行时密集指令 | 减少 `Serialize`/`Deserialize` 及慢速 SMC 卡读写（`WRIT_DBL`/`FileRead`）频次，归档配方优先用 DataLog/Recipe。 |
| **PE015** | 建议 | 性能 | SCL/LAD/FBD 用于运行时间敏感的应用 | 时间严苛的高速控制段使用 SCL/LAD/FBD，避免在高速路径上使用额外生成诊断代码的 GRAPH。 |
| **PE016** | 建议 | 性能 | 检查最小循环时间的设置 | 快速响应应用关闭“最小循环时间”；高通信负载应用开启并适当调高最小循环时间以保障通信吞吐。 |

---

## 5. LGF 通用函数库（189 块）分类导航与使用铁律

> ⚠️ **严禁盲目直接调用 `LGF_*`**：LGF 是扩展库，非内置指令！若工程未导入 LGF 库，直接调用必报编译错误。此时请读取 [`references/lgf-blueprints.md`](references/lgf-blueprints.md) 用原生 SCL 自研实现。

- **全量 189 块速查表**：[`references/lgf-index.md`](references/lgf-index.md)（按块名查一维表，再按需点开 `references/lgf/<块名>.md`）
- **10 大高频算法原生 SCL 自研实现蓝本**：[`references/lgf-blueprints.md`](references/lgf-blueprints.md)（含脉冲继电器、防抖滤波、闪烁时钟、线性标定、滑动平均、一阶平滑、斜坡限制、环形 FIFO、超差超时报警、字位互转完整源码）
- **LGF 189 块分类概览**：
  1. **Bit logic (§4.1, 7块)**：`LGF_BitReset`/`Set`/`SetTo`/`Test`/`Toggle`, `LGF_IecTimerOnOff`, `LGF_PulseRelay`
  2. **Date & Timer (§4.2~4.3, 11块)**：`LGF_AstroClock`, `LGF_TimerSwitch`, `LGF_DelayProgram`, `LGF_SetTime`, 日历周/节假日/太阳追日SPA
  3. **Counter (§4.4, 6块)**：`LGF_BitCount`, `LGF_CountArrayElements`, `LGF_CountBooleanEdges`, `LGF_CountFalInDWord`, `LGF_CountRisInDWord`, `LGF_GetBitStates`
  4. **Comparator (§4.5, 5块)**：`LGF_BinaryMaskCompare`, `LGF_CompareLReal`, `LGF_CompareLRealByPrecision`, `LGF_CompareString`, `LGF_CompareVariant`
  5. **Math & Matrix (§4.6~4.7, 31块)**：`LGF_ScaleLinear`, `LGF_SearchMinMax*`, `LGF_SimpleAveraging`, `LGF_Integration`, `LGF_Random*`, `LGF_IsValueInLimits`/`Range`/`Tolerance*`, 二维矩阵加减乘逆转置（7块）
  6. **Data Handling (§4.8, 21块)**：`LGF_FIFO`, `LGF_LIFO`, `LGF_ShiftRegister`, `LGF_ShellSort*`（希尔排序3块）, `LGF_CalcCRC8`/`16`/`32*`（CRC校验7块）, `LGF_DataLogC`, `LGF_FileRead`/`Write`/`Delete`
  7. **Converter & String & Temp (§4.9~4.13, 53块)**：格雷码、压力/速度/温度换算、UTF-8编解码、DTL与Unix时间戳/ISO字符串互转、字节序翻转 `SwapBlock*`、位/字节/字/双字拆分合并 `Split*`/`Merge*`（12块）、字符数组查找提取与大小写转换
  8. **Signal Generators (§4.14, 9块)**：`LGF_ClockGen`, `LGF_Impulse`, `LGF_Frequency`, `LGF_RampGenerator`, 正弦/余弦/方波/锯齿波/三角波发生器
  9. **Technology (§4.15, 4块)**：`LGF_RampCI`, `LGF_LimRateOfChangeCI`/`AdvancedCI`, `LGF_NonLinearInterpolation`（折线插值）
  10. **Measurement (§4.16, 15块)**：`LGF_FloatingAverage`, `LGF_SimpleSmoothingFB`/`FC`, `LGF_SmoothByPolynomFB`/`FC`, `LGF_DifferenceQuotientFB`/`FC`, `LGF_RegressionLine`, `LGF_Boxplot*`, `LGF_Histogram*`
  11. **System & UDTs (§4.17~5.7, 27块)**：大小端检测、PROFINET 从站激活/去激活 `LGF_ActDeactDevice`、CPU 负载测量 `LGF_MeasureCpuLoad`、读取 PN 接口 IP/MAC，以及 `LGF_typeDiagnostics` 等 19 个配套 UDT。
