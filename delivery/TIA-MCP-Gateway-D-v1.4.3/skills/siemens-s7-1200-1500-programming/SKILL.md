---
name: siemens-s7-1200-1500-programming
description: 西门子 SIMATIC S7-1200 / S7-1500 官方编程风格指南（V2.0，78条规则）、编程指南（V1.6，优化块内存/符号化/SCL/F-Safety）与 LGF 通用函数库（V5.5.0，189块接口与原生SCL自研蓝本）规范。在设计 S7-1200/1500 程序架构、编写或审查 SCL/LAD/FBD/DB/UDT 代码、实现 PLCopen 异步状态机（enable/execute）、优化扫描周期性能或选用/自研 LGF 通用算法块时加载本 Skill。
---

# 西门子 S7-1200/S7-1500 编程规范与架构指南

本 Skill 蒸馏自西门子工业在线支持（SIOS）三份官方核心文档，采用**渐进式披露（Progressive Disclosure）**架构，提供 S7-1200/1500 的代码规范、底层内存机理与通用函数库蓝本。

---

## 1. 知识源优先级与本机 Skill 协同裁决

### 1.1 内部三份官方文档与本机实测知识源的关系
| 文档源 | 版本与条目 ID | 角色定位 | 冲突裁决优先级 | 按需加载文件 |
| :--- | :--- | :--- | :--- | :--- |
| **编程风格指南 (Style Guide)** | V2.0 (109478084) | **规范源（What）**：78 条强制规则与建议 | **最高优**（与编程指南冲突时以本文件为准） | [`references/rules.md`](references/rules.md) / [`assets/rules.json`](assets/rules.json) |
| **编程指南 (Programming Guideline)** | V1.6 (81318674) | **理由源（Why）**：优化块内存对齐、传参机制、F-Safety | 次高优（提供底层原理与架构设计依据） | [`references/guideline.md`](references/guideline.md) |
| **LGF 通用函数库 (LGF Library)** | V5.5.0 (109479728) | **工具与蓝本源（How）**：189 个标准块接口与算法 | 对应 TIA V20/V21（V17-V19 对应 LGF V5.2.x） | [`references/lgf-index.md`](references/lgf-index.md) / [`references/lgf-blueprints.md`](references/lgf-blueprints.md) |
| **TIA V20 黄金功能块库与编译防坑规约 (Golden Library & Anti-Patterns)** | 实机验证 (15块 + 9条规约) | **实机验证源（Verified Blueprints & Rules）**：15 个 0E/0W 标准块 + 15 个 HMI UDT + 9 条实测强制规约 `CP001~CP005`/`LP001~LP004` | 架构规范遵 Style Guide，实机实现与避坑优先级最高 | [`references/golden-standard-blocks.md`](references/golden-standard-blocks.md) / [`references/rules.md`](references/rules.md) §11 |

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

```text
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
├─ 3. 需要通用功能（FIFO队列、滤波、线性标定、脉冲继电器、斜坡、矩阵、CRC、日历、位/字互转等）
│   ├─ 先读 references/lgf-index.md 检索 189 个 LGF 官方块
│   ├─ 【分支 A】通过 d_tree 确认当前博途工程已导入对应 LGF_* 块：
│   │   └─ 读 references/lgf/<块名>.md 获取精确引脚签名与错误码，直接实例化调用
│   └─ 【分支 B】当前工程未导入 LGF 库（严禁直接写 LGF_* 调用，否则必报编译错误！）：
│       └─ 读 references/lgf-blueprints.md（含 10 大高频算法块原生 SCL 完整实现）或 references/lgf/<块名>.md，用原生 SCL 自研实现
│
└─ 4. 需要工业设备控制或 Factory I/O 场景顺控（模拟量定标报警、低通滤波、气缸、正反转电机、环形FIFO、按钮防抖、Modbus轮询、双回路急停、高低分拣、气动抓手、三段缓冲带、旋转转盘、立体仓库、液位PID、双工位装配）
    └─ 必读 references/golden-standard-blocks.md 直接复用已通过 TIA V20 0E/0W 验证的 15 个黄金块与 UDT_HMI_xxx
```

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
| **CP001** | 规则 | 编译避坑 | 严禁回读 VAR_OUTPUT 输出参数 | 表达式右侧禁读 Output，用 VAR_TEMP/VAR 计算后在块尾集中单向写一次，防 uninitialized 警告。 |
| **CP002** | 规则 | 编译避坑 | VAR_TEMP 临时变量块首全量赋初值 | 进入 BEGIN 首行必须对所有 Temp 变量显式赋安全初值，严禁仅在 IF/CASE 分支内局部赋值。 |
| **CP003** | 规则 | 编译避坑 | FC 禁 VAR 段，FB 定时器必用多重背景并显式复位 | FC 禁声明 VAR 段；FB 定时器必用 VAR 段 TON_TIME 多重背景，并在 IDLE/FAULT 显式 IN:=FALSE 复位。 |
| **CP004** | 规则 | 编译避坑 | TIME/DINT/REAL 严禁混算与浮点数直接判等 | Time 转整数必用 TIME_TO_DINT，浮点常量必带 .0，REAL 禁 =/<> 改用 <=/>= 或 ABS 容差比较。 |
| **CP005** | 规则 | 编译避坑 | TIA V20 Openness 依赖顺序与符号双引号/井号铁律 | 先导编译 UDT 再导 FB/FC；局部变量 100% 加 # 前缀，全局块名与 UDT 100% 加英文双引号。 |
| **LP001** | 规则 | 逻辑规约 | 电机正反转状态机严禁旁路灭弧冷却死区 | 反向请求排在停止前，且运行态停机或换向必须强制进 STATE_DEADBAND 冷却至少 1.0s，禁直接跳 IDLE。 |
| **LP002** | 规则 | 逻辑规约 | PLCopen Execute STEP_DONE 禁同周期跳 IDLE | 进入 STEP_DONE 必须维持 done=TRUE 至少 1 周期等待 NOT execute 确认，done 与 busy 严格互斥。 |
| **LP003** | 规则 | 逻辑规约 | EDM 外部接触器常闭反馈禁放进持续切断条件 | feedbackLoopOk 常闭辅助回路仅允许在复位上升沿作吸合前置校验，吸合运行中严禁因 NC 断开自切。 |
| **LP004** | 规则 | 逻辑规约 | 顺控预备步禁漏开驱动，动作步禁漏判工位限位 | 顺控每步必须闭环核对所有声明的到位/限位传感器与双限位互锁，预备步保持进料辊道运转，禁悬空引脚。 |

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

---

## 6. TIA V20 实测编译避坑死规矩（Top 5）与工业逻辑反模式（Top 4）

> 来源沉淀：TIA Portal V20 + S7-1500 真实环境 15 个工业标准 FB/FC 及配套 UDT 通宵流水线编译与安全终审实战（详见 [`references/rules.md`](references/rules.md) §11）。

### 6.1 Top 5 编译避坑死规矩
1. **严禁回读 `VAR_OUTPUT` 引脚（Rule DA008 / CP001）**：
   - 表达式右侧（RHS）或 `IF/CASE` 条件中**严禁读取任何 `VAR_OUTPUT` 输出参数**！
   - 博途静态分析器无法证明所有控制流分支读取前已赋值时，会直接抛出 `The parameter '#xxx' might not be initialized` 警告。
   - **铁律**：所有输出状态在 `VAR`（`#stat...`）或 `VAR_TEMP`（`#temp...`）中完成运算，仅在块末尾集中执行一次单向写入赋值。
2. **`VAR_TEMP` 必须在 `BEGIN` 首段无条件全量赋初值（Rule SE002 / CP002）**：
   - 临时变量驻留在 CPU 局部堆栈（L 栈），未初始化会残留上一周期的脏数据导致幽灵动作或编译警告。
   - **铁律**：进入 `BEGIN` 的第一段，必须对 `VAR_TEMP` 声明的每一个临时变量无条件赋安全初值（`Bool:=FALSE;`、`Int:=0;`、`Real:=0.0;`、`Time:=T#0s;`），严禁仅在 `IF/CASE` 分支内局部赋值。
3. **`FC` 禁声明 `VAR` 静态段，`FB` 定时器必用 `VAR` 多重背景并显式复位（Rule AL001 / CP003）**：
   - 博途 SCL 中 `FUNCTION`（FC）仅支持 `VAR_INPUT/OUTPUT/IN_OUT/TEMP/CONSTANT`，写 `VAR` 直接报语法错误。FC 跨周期状态记忆必须通过挂载于 `VAR_IN_OUT` 的 `"UDT_HMI_xxx"` 传入。
   - `FB` 内定时器必须声明在 `VAR` 段为 `TON_TIME` 多重背景；严禁塞在 `IF` 单边分支导致无法复位，必须在 `IDLE/FAULT` 分支显式调用 `#instTimer(IN := FALSE, PT := ...)`。
4. **`TIME`/`DINT`/`REAL` 严禁隐式混算与浮点数直接判等（Rule PE008 / CP004）**：
   - `Time` 与整数毫秒换算必须使用显式转换函数 `TIME_TO_DINT(#timeVal)`；浮点常量必须带小数点（写 `0.0`、`1.0`，严禁写 `0`、`1`）。
   - 严禁对 `REAL` 浮点数使用 `=` 或 `<>` 直接判等；边界与零值判断必须使用 `<= 0.0`、`>= 0.0` 或 `ABS(a - b) <= 1.0e-6`。
5. **TIA V20 Openness 外部源导入依赖顺序与符号规范（CP005）**：
   - **导入顺序**：必须先导入编译 `UDT_HMI_xxx`，再导入编译引用该 UDT 的 `FB/FC`，否则报 `Data type unknown`。
   - **符号规范**：块内所有局部变量（形参/静态/临时/常量）在代码体中 100% 强制带 `#` 前缀；所有全局块名和 UDT 类型名 100% 强制带英文双引号 `"..."`（如 `ioHmi : "UDT_HMI_CylinderCtrl";`）。

### 6.2 Top 4 编译器不报的工业逻辑反模式
1. **反模式 L1（正反转换向死区被旁路 / LP001）**：
   - **陷阱**：在正转/反转运行分支中，若停止退出条件（`NOT reqFwd`）排在反向请求（`reqRev`）之前，直接切换方向时会在第 1 周期跳回 `STATE_IDLE`，第 2 周期立即吸合反转，完全绕过接触器灭弧死区导致主回路相间短路爆弧！
   - **规约**：状态机必须将反向请求判断排在停止退出前，且从运行态无论是正常停止还是换向，均必须强制进入 `STATE_DEADBAND` 冷却态（维持至少 1.0s），冷却计时未到绝不允许跳回 `STATE_IDLE`。
2. **反模式 L2（`STEP_DONE` 同周期跳回 `IDLE` 吞掉 `done` 脉冲 / LP002）**：
   - **陷阱**：进入 `STEP_DONE` 分支后，如果同周期直接写 `#statStep := #STEP_IDLE;`，块尾计算 `#done := (#statStep = #STEP_DONE)` 结果恒为 `FALSE`，上位调度永远收不到完成握手信号造成顺控假死。
   - **规约**：遵循 PLCopen `Execute` 握手规范（`DA012`），进入 `STEP_DONE` 后必须保持 `done := TRUE` 至少 1 个完整扫描周期，等待外部 `NOT execute` 释放后才返回 `STEP_IDLE`，且 `done` 与 `busy` 严格互斥。
3. **反模式 L3（EDM 外部接触器常闭反馈放进持续切断条件 / LP003）**：
   - **陷阱**：安全继电器/急停模块的外部设备监控回路（EDM `feedbackLoopOk`）串联的是外部接触器的**常闭（NC）辅助触点**。主接触器吸合后 NC 辅助触点必然断开；若将 `OR (NOT #feedbackLoopOk)` 写在持续运行切断条件中，安全输出吸合后的下一个周期就会误切断自锁！
   - **规约**：`feedbackLoopOk` 仅允许在复位上升沿（`STATE_WAIT_RESET -> STATE_RUN`）作为闭合前置校验，吸合运行期间严禁因 `feedbackLoopOk = FALSE` 自切。
4. **反模式 L4（顺控预备步漏开传送带或漏判工位限位 / LP004）**：
   - **陷阱**：在 `STEP_WAIT_ENTRY` 等待进料时若关闭进料辊道，仅靠上游惯性工件会卡在分界传感器前；或声明了 `posAtLimit`（挡料板到位）和双限位传感器，在动作步中却未等待限位到位即触发推料/出料，引发机械干涉撞刀。
   - **规约**：顺控状态机每一步必须闭环核对所有声明的到位传感器（如 `atEntry`、`atExit`、`posAtLimit`）与双限位冲突（`limit0 AND limit90`），禁止出现“声明了限位引脚却不判读”的悬空引脚。

---

## 7. 黄金功能块资产库（15 个标准 FB/FC + 15 个 UDT_HMI + Factory I/O 映射）速查索引

> 详细接口定义、UDT 字段明细、物理资产绝对路径与 Factory I/O 引脚映射请查阅完整蓝图文档：[`references/golden-standard-blocks.md`](references/golden-standard-blocks.md)。
> 所有资产均在真实 Siemens TIA Portal V20 + S7-1500 环境完成编译验证（`0 Error, 0 Warning`），并通过 9 大类净室故障注入验证。

### 7.1 Part A：通用工控底层黄金标准块（8 个）
| 编号 | 功能块名称 | 类型 | 配套 UDT (`VAR_IN_OUT.ioHmi`) | 工艺核心功能 | 对应蓝图章节 |
| :---: | :--- | :---: | :--- | :--- | :---: |
| **A01** | `FC_AnalogScaleAlarm` | FC | `UDT_HMI_AnalogScale` | 模拟量线性定标、工程量换算、HH/H/L/LL 四限报警与断线溢出检测 | [查看 A01](references/golden-standard-blocks.md#a01--fc_analogscalealarm-模拟量线性定标与四限报警) |
| **A02** | `FB_LowPassFilter` | FB | `UDT_HMI_LowPassFilter` | 一阶低通惯性数字滤波、平滑系数计算、旁路与冷启动无扰跟踪 | [查看 A02](references/golden-standard-blocks.md#a02--fb_lowpassfilter-一阶低通惯性滤波) |
| **A03** | `FB_CylinderCtrl` | FB | `UDT_HMI_CylinderCtrl` | 单控/双控气缸驱动、双限位磁簧冲突检测、动作超时报警与手动调试 | [查看 A03](references/golden-standard-blocks.md#a03--fb_cylinderctrl-气缸双向到位驱动与超时保护) |
| **A04** | `FB_MotorRevCtrl` | FB | `UDT_HMI_MotorRevCtrl` | 电机正反转接触器互锁、强制 1.0s 灭弧冷却死区、热过载与接触器反馈监控 | [查看 A04](references/golden-standard-blocks.md#a04--fb_motorrevctrl-电机正反转互锁与灭弧死区保护) |
| **A05** | `FB_RingFifo` | FB | `UDT_HMI_RingFifo` | 32 深度先进先出环形队列、入队出队原子操作、满溢出/空下溢保护 | [查看 A05](references/golden-standard-blocks.md#a05--fb_ringfifo-环形-fifo-队列管理) |
| **A06** | `FC_ButtonDebounceToggle` | FC | `UDT_HMI_ButtonDebounce` | 按钮毫秒级防抖滤波、双边沿单脉冲提取及单键启停双稳态翻转（无状态 FC+UDT 模式） | [查看 A06](references/golden-standard-blocks.md#a06--fc_buttondebouncetoggle-按钮防抖与单键启停翻转) |
| **A07** | `FB_ModbusPoller` | FB | `UDT_HMI_ModbusPoller` | 多从站轮询状态调度器、应答超时重试、自动隔离掉线站防死锁 | [查看 A07](references/golden-standard-blocks.md#a07--fb_modbuspoller-modbus-多从站轮询调度器) |
| **A08** | `FB_DualEStopInterlock` | FB | `UDT_HMI_DualEStop` | 双通道急停回路差异超时（200ms）粘连监控、EDM 常闭触点前置校验与受控复位 | [查看 A08](references/golden-standard-blocks.md#a08--fb_dualestopinterlock-双回路急停与-edm-反馈监控) |

### 7.2 Part B：Factory I/O 经典场景顺控黄金块（7 个）
| 编号 | 功能块名称 | 类型 | 配套 UDT (`VAR_IN_OUT.ioHmi`) | 适配 Factory I/O 官方标准场景 | 对应蓝图章节 |
| :---: | :--- | :---: | :--- | :--- | :---: |
| **B01** | `FB_FIO_SortingByHeight` | FB | `UDT_HMI_FIO_SortingByHeight` | *Sorting by Height (Basic / Advanced)* 高低件测高分拣与双推杆顺控 | [查看 B01](references/golden-standard-blocks.md#b01--fb_fio_sortingbyheight-factory-io-高低件分拣) |
| **B02** | `FB_FIO_PickAndPlace` | FB | `UDT_HMI_FIO_PickAndPlace` | *Pick & Place (Basic)* 两轴 X/Z 气动机械手搬运与真空吸盘步序 | [查看 B02](references/golden-standard-blocks.md#b02--fb_fio_pickandplace-factory-io-两轴气动抓手搬运) |
| **B03** | `FB_FIO_BufferConveyor` | FB | `UDT_HMI_FIO_BufferConveyor` | *Buffer Station* 三段缓冲传送带防追尾、零压力积放与上/下游联锁 | [查看 B03](references/golden-standard-blocks.md#b03--fb_fio_bufferconveyor-factory-io-三段积放缓冲带) |
| **B04** | `FB_FIO_Turntable` | FB | `UDT_HMI_FIO_Turntable` | *Sorting Station with Turntable* 90° 分流转盘、预备步进料与双限位互锁 | [查看 B04](references/golden-standard-blocks.md#b04--fb_fio_turntable-factory-io-90-旋转转盘) |
| **B05** | `FB_FIO_AutomatedWarehouse` | FB | `UDT_HMI_FIO_Warehouse` | *Automated Warehouse* 54 库位立体仓库堆垛机取放料、PLCopen Execute 顺控 | [查看 B05](references/golden-standard-blocks.md#b05--fb_fio_automatedwarehouse-factory-io-立体仓库堆垛机) |
| **B06** | `FB_FIO_TankLevelPID` | FB | `UDT_HMI_FIO_TankLevelPID` | *Level Control* 水箱模拟量液位进水/排水比例阀分程闭环 PID 与手自动无扰切换 | [查看 B06](references/golden-standard-blocks.md#b06--fb_fio_tanklevelpid-factory-io-水箱液位比例-pid) |
| **B07** | `FB_FIO_Assembler` | FB | `UDT_HMI_FIO_Assembler` | *Assembler (Basic)* 双工位底座/盖板气动夹紧压装顺控、挡料销闭环防撞 | [查看 B07](references/golden-standard-blocks.md#b07--fb_fio_assembler-factory-io-双工位装配站) |
