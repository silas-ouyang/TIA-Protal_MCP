# 西门子 S7-1200/S7-1500 编程风格指南 —— 78 条规则全表

> **来源**：Siemens Programming Style Guide V2.0 (109478084) + Programming Guideline V1.6 (81318674)
> **统计**：共 78 条（48 条强制规则 `rule` + 30 条推荐建议 `recommendation`）
> **本机适配说明**：西门子官方 `NF001/NF005/NF006` 要求使用英文 `camelCasing`/`PascalCasing` 标识符。在本机常规业务工程中，若用户未指定英文标准，按 `tia-portal-ops` 默认采用直观中文变量名，但**作用域区分、常量全大写、接口规范、状态码与性能规则 100% 适用**。

## 3. TIA 博途中的设置 (ES001 - ES009)

### ES001 【规则 Rule】 用户界面语言 “English”
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：将 TIA Portal 用户界面语言设置为“English”，确保所有新建项目的编辑语言、参考语言及系统常量均统一为英语。
- **原理与理由**：若要求所有系统常量均以同一种通用语言生成并跨地区共享，用户界面语言必须设置为统一语言（English）。
- **正例 / 标准写法**：
``text
TIA Portal -> Options -> Settings -> General -> User interface language: English
``

### ES002 【规则 Rule】 助记符 “International”
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：将编程语言的助记符（Mnemonic）设置为“International”（国际标准，如 I/Q/M、TON/CTU），严禁使用德语助记符（E/A/M）。
- **原理与理由**：使所有系统语言和指令参数独立于区域设置，保证跨国或多团队编程人员之间无缝协作。
- **正例 / 标准写法**：
``text
使用国际助记符（如 I0.0, Q0.0, AND, OR, TON）
``
- **反例 / 禁止写法**：
``text
使用德语助记符（如 E0.0, A0.0, U, UN, =）
``

### ES003 【建议 Recommendation】 编辑器中的非比例字体
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：在代码编辑器中使用非比例（等宽）字体，推荐设置为“Consolas”，字号 10 pt。
- **原理与理由**：等宽字体保证所有字符宽度相同，使代码对齐、单词和缩进保持统一；Consolas 专门针对编程环境强化了相似字符（如 1/l/I、0/O）的视觉区分度。
- **正例 / 标准写法**：
``text
Font: Consolas, Size: 10 pt
``
- **反例 / 禁止写法**：
``text
使用比例字体（如 Arial、宋体）导致多行代码缩进与列对齐错位
``

### ES004 【规则 Rule】 带有两个空格的智能缩进
- **适用语言**：`SCL, STL`
- **规范要求**：文本编辑器缩进设置改为“Smart（智能）”，每级缩进使用 2 个空格，严禁在文本代码中使用制表符（Tab）。
- **原理与理由**：制表符（Tab）在不同编辑器和显示环境下宽度不一致，使用 2 个空格的智能缩进可确保跨工具显示样式完全统一。
- **正例 / 标准写法**：
``text
Indent: Smart, Tab width / Spaces: 2（禁止 Tab 字符）
``
- **反例 / 禁止写法**：
``text
使用 Tab 缩进或无缩进
``

### ES005 【规则 Rule】 操作数的符号表示
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：将操作数表示方式（Operand representation）设置为“Symbolic（符号）”。
- **原理与理由**：S7-1200/1500 程序设计完全基于符号寻址，配合优化块访问可消除物理地址依赖并获得最佳性能与可读性。
- **正例 / 标准写法**：
``text
Operand representation: Symbolic（如 "MachineData".isRunning）
``
- **反例 / 禁止写法**：
``text
使用绝对地址表示（如 %DB1.DBX0.0、%M10.0）
``

### ES006 【规则 Rule】 符合 IEC 的编程
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：在 PLC 编程设置中默认勾选“为每个新建程序块启用 IEC 检查（IEC check）”。
- **原理与理由**：启用 IEC 检查后，编译器将强制执行严格的数据类型兼容性和类型安全检查，避免隐式类型转换带来的截断或符号位错误。
- **正例 / 标准写法**：
``text
块属性勾选 IEC check，不同类型间使用显式转换函数（如 INT_TO_DINT、WORD_TO_UINT）
``
- **反例 / 禁止写法**：
``text
关闭 IEC 检查，将 Word 与 Int 或 DWord 与 Real 随意混用而不做显式转换
``

### ES007 【规则 Rule】 通过 HMI/OPC UA/Web API 显式数据访问
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：在 PLC 编程全局设置中，默认取消勾选新建元素的“可从 HMI/OPC UA/Web API 访问”和“可写”，仅对需要暴露的变量显式按需开启。
- **原理与理由**：限制外部应用对 PLC 内部控制数据的无权访问，降低通信负载并防止外部误写内部状态变量。
- **正例 / 标准写法**：
``text
全局默认禁用 Accessible/Writable from HMI/OPC UA/Web API，仅在专用 HMI/OPC 接口 DB 或特定变量上按需勾选
``
- **反例 / 禁止写法**：
``text
所有 FB 静态变量、内部临时标志全部默认向 HMI/OPC UA 暴露读写权限
``

### ES008 【规则 Rule】 启用自动值计算 (ENO)
- **适用语言**：`LAD, FBD, SCL`
- **规范要求**：默认开启指令的 EN/ENO 自动值边界与操作有效性评估机制（性能敏感的纯计算块可按 SE003/PE001 受控关闭并手动处理）。
- **原理与理由**：激活此设置后，系统自动对算术溢出、除零或数组越界等运行时错误设置 ENO=FALSE，防止错误结果向下游扩散。
- **正例 / 标准写法**：
``text
勾选块属性 Automatically set ENO，或显式评估指令调用后的 ENO 状态
``

### ES009 【规则 Rule】 自动计算数组边界
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：必须启用数组边界的自动计算与编译期检查功能。
- **原理与理由**：在编译阶段检查数组下标范围，防止运行时数组越界访问引发 CPU 编程错误中断。
- **正例 / 标准写法**：
``text
启用数组边界检查，并使用 LOWER_BOUND / UPPER_BOUND 动态获取可变数组边界
``

## 4. 全球化与多语言 (GL001 - GL003)

### GL001 【规则 Rule】 使用一致的语言
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：PLC 与 HMI 编程中各语言槽位的内容必须与所选语言严格一致（例如英语语言列中只能填入英文文本，中文语言列中只能填入中文文本）。
- **原理与理由**：确保多语言项目切换语言或导出翻译表时不会出现语种混杂或乱码。
- **正例 / 标准写法**：
``text
English (US) 槽位填英文，Chinese (PRC) 槽位填中文（本机 V20 中文工程注意 .s7res 必须同时具备 en-US 与 zh-CN 词条）
``
- **反例 / 禁止写法**：
``text
在 English (US) 语言环境下直接把中文注释写进英文槽位而未配置 zh-CN 项目语言
``

### GL002 【规则 Rule】 设置编辑参考语言为 “English （US） ”
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：若客户无特殊本地化要求，将项目的编辑语言（Editing language）和参考语言（Reference language）均设置为“English (US)”，包含代码注释。（注：本机中文工程按 tia-portal-ops 裁决默认使用中文注释，但 `.s7res` 多语言资源仍须保留 `en-US` 词条防校验报错）。
- **原理与理由**：英语是全球自动化工程协作的通用基准语言，且 TIA Openness 多语言导出导入校验常以 en-US 作为必选基准词条。
- **正例 / 标准写法**：
``text
Editing language: English (United States), Reference language: English (United States)
``

### GL003 【规则 Rule】 提供所有项目语言的文本
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：为项目中启用的所有项目语言提供完整的文本翻译（至少必须完整提供 English 文本）。
- **原理与理由**：避免切换项目显示语言或生成 HMI 报警时出现空白文本（Missing Text）。可在块编辑器的 Texts 选项卡中集中管理。
- **正例 / 标准写法**：
``text
在 Texts 选项卡中补全所有已激活项目语言的标题、注释与消息文本
``
- **反例 / 禁止写法**：
``text
启用了多语言但只填写了单一语言的块标题或报警文本
``

## 5. 命名与格式规范 (NF001 - NF014)

### NF001 【规则 Rule】 唯一且一致的英文标识符
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：遵循西门子国际标准时，标识符须使用唯一且一致的英文名称：FC/FB 以动词开头（Get/Set/Put/Find/Search/Calc）；数组名用复数（不可数名词如 data/information/content 保持单数）；表示状态的静态/临时 Bool 变量以 is/can/has 开头；不得保留 TIA 默认形参占位符（如 In1/Out1）。（注：本机常规业务工程若无特别要求，按 tia-portal-ops 默认采用直观中文符号名）。
- **原理与理由**：通过语义化、符合自然语序的命名，使开发者无需阅读内部实现即可快速理解块及输入输出的功能。
- **正例 / 标准写法**：
``text
数组: data, beltConveyors; 状态布尔: isConnected, canScan; 其他布尔: enable; 块名: GetMachineState, SearchDevices
``
- **反例 / 禁止写法**：
``text
数组: datas, beltConveyor; 状态布尔: connected, scan; 其他布尔: setEnable; 块名: MachineStateFC, FB_Device
``

### NF002 【规则 Rule】 使用有意义的注释和属性
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：必须为块标题、块注释、块接口参数、网络标题与注释、变量与常量、UDT 成员、PLC 变量表、报警文本列表及库属性编写有意义的描述注释。
- **原理与理由**：帮助调用者和维护人员通过工具悬停提示或接口列表直接理解组件意图、单位与取值范围。
- **正例 / 标准写法**：
``text
在块接口与变量表中详细注明物理意义、单位及有效范围（如 "Conveyor target velocity in [m/s] (0.0 .. 5.0)"）
``
- **反例 / 禁止写法**：
``text
接口参数或变量注释留空，或仅重复变量名（如 speed 注释写 speed）
``

### NF003 【规则 Rule】 记录开发人员信息
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：每个块必须在块属性中填写面向用户的信息，并在 SCL 代码顶部（REGION Description header）或 LAD/FBD 块注释中包含标准化块头模板（记录版权、标题、功能说明、所属库、作者、目标 PLC 及固件版本、TIA 版本、使用限制、硬件要求及版本修改日志）。
- **原理与理由**：即使块启用了专有技术保护（Know-how protection），外部用户仍可读取块属性；而块内部的详细修改日志与安全签名则受保护留存，便于版本追溯。
- **正例 / 标准写法**：
``text
REGION Description header
  //==================================================================================
  // Title:            FB_AxisControl
  // Comment/Function: Standard axis positioning state machine
  // Library/Family:   LMotion
  // Author:           Engineering Dept
  // Target System:    CPU 1516-3 PN/DP FW V2.9
  // Engineering:      TIA Portal V20
  // Restrictions:     Call in cyclic OB1
  // Requirements:     TO_PositioningAxis
  //----------------------------------------------------------------------------------
  // Version     | Date       | Expert in charge | Changes applied
  // 001.000.000 | 2026-11-05 | Engineer         | First released version
  //==================================================================================
END_REGION
``
- **反例 / 禁止写法**：
``text
新建 FB/FC 无任何头注释、无作者与适用环境说明、无版本变更记录
``

### NF004 【规则 Rule】 遵守库的前缀和结构
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：标准库标识符必须以前缀“L”开头，总长不超过 8 个字符（如 LGF、LCom）；库内所有元素均須带“<库名>_”前缀，并统一存放在以库标识符命名的子文件夹下。
- **原理与理由**：保持库名紧凑简短，并通过强制命名空间前缀避免同一项目引入多个库时发生块名、UDT 名或常量名冲突。
- **正例 / 标准写法**：
``text
库名: LExample; UDT: LExample_type<Name>; FB/FC/DB/OB/TagTable: LExample_<Name>; 全局常量: LEXAMPLE_<NAME>; 错误/警告常量: LEXAMPLE_ERR_<NAME> / LEXAMPLE_WARN_<NAME>
``
- **反例 / 禁止写法**：
``text
库名叫 Library_General_Functions（超8字符），或库内块不带前缀直接叫 PulseRelay
``

### NF005 【规则 Rule】 使用帕斯卡（PascalCasing）命名法
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：TIA 博途顶层对象（程序块 OB/FB/FC/DB、软件单元、工艺对象 TO、库、项目、PLC 变量表、PLC 报警文本列表、监控与强制表、轨迹 Trace 与测量）的标识符必须采用大驼峰（PascalCasing，首字母大写，每个单词首字母大写，单一概念不用下划线，结构化分组最多不超过 3 个下划线）。
- **原理与理由**：在视觉上将项目树中的全局容器对象（PascalCasing）与代码块内部的局部/数据元素（camelCasing）清晰区分开。
- **正例 / 标准写法**：
``text
HeatTank, CalculateTime, MachineData, InstHeater, GetAxisData_PosAxis
``
- **反例 / 禁止写法**：
``text
Get_Axis_Data_Pos_Axis（下划线过多）、heatTank（块名首字母小写）
``

### NF006 【规则 Rule】 对代码元素使用驼峰命名规则 camelCasing
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：代码内部元素的标识符（变量、PLC 数据类型 UDT、结构体 STRUCT、PLC 变量、块接口形参）必须使用小驼峰命名法（camelCasing：首字母小写，后续单词首字母大写，严禁使用连字符或下划线分隔）。
- **原理与理由**：保证代码内部变量、参数与类型名称风格统一，避免与全部大写的符号常量或大驼峰的块名混淆。
- **正例 / 标准写法**：
``text
motorSpeed, lightBarrierLeft, typeDiagnostics, stateNumber
``
- **反例 / 禁止写法**：
``text
Motor_Speed, Light_Barrier_Left, type_diagnostics
``

### NF007 【规则 Rule】 使用前缀
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：严格执行作用域前缀规则：块形参（Input/Output/InOut）、PLC 变量、全局 DB 及其成员变量、UDT 内部成员均【不加前缀】；FB/FC 内部临时变量加前缀 `temp`；FB 内部静态变量加前缀 `stat`；多重实例和参数实例加前缀 `inst`；单实例 DB 加前缀 `Inst`；PLC 数据类型（UDT）名称加前缀 `type`。
- **原理与理由**：在阅读代码时无需查看声明区即可立即分辨变量是外部传入的形参（无前缀）、仅当前周期有效的临时变量（temp）、跨周期保持的私有静态变量（stat）还是子块实例（inst），一眼识别非法跨界访问。
- **正例 / 标准写法**：
``text
In/Out/InOut形参: enable, error, conveyorAxis; 临时变量: tempIndex; 静态变量: statState; 多重实例: instWatchDogTimer, instWatchDogTimers(数组); 单实例DB: InstConveyorFeed; UDT名: typeDiagnostics (其成员 stateNumber 不加前缀)
``
- **反例 / 禁止写法**：
``text
在形参上加前缀 inEnable/outError，或在 Global DB 成员上加 stat，或 FB 静态变量不加 stat
``

### NF008 【规则 Rule】 用大写字母表示常量标识符
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：所有符号常量（全局用户常量与块内局部常量）的名称必须全部使用大写字母，单词或缩写之间用下划线“_”分隔（UPPER_CASE_WITH_UNDERSCORES）；布尔字面量 TRUE 和 FALSE 也必须大写。
- **原理与理由**：在表达式中无需查看声明即可将只读常量与可读写变量（camelCasing）彻底区分开。
- **正例 / 标准写法**：
``text
MAX_VELOCITY, MAX_NO_OF_AXES, BUFFER_UPPER_LIMIT, TRUE, FALSE
``
- **反例 / 禁止写法**：
``text
maxVelocity, Max_Velocity, true, false
``

### NF009 【规则 Rule】 限制标识符的字符集
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：遵循国际标准命名时，所有对象和代码标识符仅允许使用拉丁字母（a-z、A-Z）、阿拉伯数字（0-9）和下划线“_”，严禁包含空格或特殊字符（%@?"/\<>.:）。
- **原理与理由**：避免因空格或特殊字符导致必须加双引号转义，并防止与 WinCC / SiVArc / OPC UA 交互时因非法字符被自动剥离而引发项目不一致。
- **正例 / 标准写法**：
``text
tempMaxLength, motorSpeed, valveOpen
``
- **反例 / 禁止写法**：
``text
temporary Variable 1, Motor%Speed, Valve/Open
``

### NF010 【建议 Recommendation】 限制标识符的长度
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：单个标识符的总长度（含前缀、后缀或库标识符）建议不超过 24 个字符。
- **原理与理由**：当多层嵌套结构体或多重实例通过点号连接（如 `instFeedConveyor024.releaseTransportSect1.gappingTimeLeft`）时，过长的单个标识符会导致完整访问路径极长，折行影响可读性。
- **正例 / 标准写法**：
``text
instFeedConveyor024.releaseTransportSect1.gappingTimeLeft（单段均 ≤ 24 字符）
``
- **反例 / 禁止写法**：
``text
instFeedConveyorNumber024.releaseTransportSectionNumber1.maximumGappingTimeLeftInMilliseconds
``

### NF011 【建议 Recommendation】 每个标识符仅使用一个缩写
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：单个标识符中不得连续使用多个缩写，且应优先选用西门子标准缩略语表中的规范缩写。
- **原理与理由**：连续堆砌多个缩写会导致除原作者外无人能懂；统一使用官方标准缩写可在缩短字符数的同时保持团队可读性。
- **正例 / 标准写法**：
``text
标准缩写表: Min(Minimum), Max(Maximum), Act(Actual/Current), Next(Next value), Prev(Previous value), Avg(Average), Sum(Total sum), Diff(Difference), Cnt(Count), Len(Length), Pos(Position), Ris(Rising edge), Fal(Falling edge), Old(Old value for edge detection), Sim(Simulated), Dir(Direction), Err(Error), Warn(Warning), Cmd(Command), Addr(Address)
``
- **反例 / 禁止写法**：
``text
tempMaxActPosDiffCnt（连续堆叠5个缩写）
``

### NF012 【规则 Rule】 以对应的格式初始化变量
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：变量初始化与常量赋值必须严格匹配其数据类型的字面量格式（如 WORD 用满位宽十六进制 `16#7000`，BYTE 用 `16#01` 或 `2#1010_0101`，LReal 用 `0.0`，DInt 用十进制 `101`，Bool 用大写 `FALSE`）；代码中的非零初始化应使用局部符号常量。
- **原理与理由**：避免隐式类型歧义，让读者一眼看出变量是按位串掩码、十六进制状态字还是十进制数值使用，并消除前导零缺失导致的位宽误判。
- **正例 / 标准写法**：
``text
statTriggerOld(Bool):=FALSE; statStatus(Word):=16#7000; statStep(DInt):=101; statVelocity(LReal):=0.0; statCommand(Byte):=16#01; statFlags(Byte):=2#1010_0101
``
- **反例 / 禁止写法**：
``text
statTriggerOld(Bool):=false; statStatus(Word):=123; statStep(DInt):=16#0; statVelocity(LReal):=16#000; statCommand(Byte):=16#1; statFlags(Byte):=25
``

### NF013 【建议 Recommendation】 隐藏可选形参
- **适用语言**：`LAD, FBD, SCL`
- **规范要求**：在块接口定义中，将具有合理默认值且不常使用的可选形参设置为“隐藏（Hidden）”。
- **原理与理由**：在调用环境（LAD/FBD/SCL）中默认折叠非核心可选形参，使块调用视图保持最简，仅在需要时展开。
- **正例 / 标准写法**：
``text
为可选参数赋予默认初始值，并在接口属性中勾选 Hide parameter
``

### NF014 【规则 Rule】 有意义地格式化 SCL 代码
- **适用语言**：`SCL`
- **规范要求**：规范格式化 SCL 代码：1) 仅使用行注释 `//` 说明编写原因而非重复代码字面含义（调试屏蔽代码也只用 `//`）；2) 运算符前后必须加空格；3) 子表达式始终用括号 `()` 明确优先级；4) `THEN`、`ELSE`、`DO` 等条件关键字与执行语句之间必须换行；5) 多行复杂布尔条件在换行开头放置逻辑运算符（`AND`/`OR`）并缩进 2 个空格。
- **原理与理由**：消除长布尔表达式的优先级歧义，防止块注释 `(*...*)` 嵌套引发语法错误，并使深层控制结构在任何屏幕宽度下都清晰易读。
- **正例 / 标准写法**：
``text
#tempSetFlag := (#tempPositionAct < #MIN_POS) OR (#tempPositionAct > #MAX_POS);

IF #enable
  AND (
    (#turnLeft XOR #turnRight)
    OR (#statIsMaintenance AND #statIsManualMode)
  )
  AND #tempIsConnected
THEN
  #statRun := TRUE;
ELSE
  #statRun := FALSE;
END_IF;
``
- **反例 / 禁止写法**：
``text
IF#enable AND#isValid OR#override THEN #out:=TRUE;ELSE #out:=FALSE;END_IF;
``

## 6. 可重用性与库管理 (RU001 - RU008)

### RU001 【规则 Rule】 提供可以仿真的块
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：在项目属性（Protection -> Support simulation during block compilation）中激活块的仿真支持功能。
- **原理与理由**：只有激活该选项编译出的程序块（尤其是库块和含工艺/安全功能的块），才能在 S7-PLCSIM / PLCSIM Advanced 仿真环境中加载运行。
- **正例 / 标准写法**：
``text
在发布入库前，打开 Project properties -> Protection -> 勾选 Support simulation during block compilation 并编译
``
- **反例 / 禁止写法**：
``text
未勾选支持编译仿真就将块加密打包进库，导致下游用户在 PLCSIM Advanced 中无法仿真
``

### RU002 【规则 Rule】 完全使用库进行版本控制
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：所有无需用户在实例处修改的可重用 FC、FB 和 UDT 必须作为“类型（Types）”存储在库中，并采用语义化三段版本号 `Major.Minor.Patch`（从 `1.0.0` 起步：Bug 修复递增第 3 位；兼容性功能扩展递增第 2 位并清零第 3 位；重大更新或不兼容接口变更递增第 1 位并清零后两位）。
- **原理与理由**：利用 TIA Portal 库类型机制实现跨项目集中更新、强一致性依赖管理与历史变更追踪。注意：入库前须先设好自动编号、仿真支持与专有技术保护。
- **正例 / 标准写法**：
``text
1.0.0 (首次发布) -> 1.0.1 (错误修复/优化) -> 1.1.0 (向后兼容的功能扩展) -> 2.0.0 (重大更新或不兼容接口变更)
``
- **反例 / 禁止写法**：
``text
把通用 FB 作为普通主副本（Master copy）到处复制粘贴，升级时无法批量更新且版本号停留在 0.1
``

### RU003 【规则 Rule】 在已发布的项目中只保留已发布的类型
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：在正式交付或发布的项目与库中，所有库类型（FB、FC、UDT）必须处于“已发布（Released）”状态，严禁残留任何处于“测试中（In test）”或“处理中（In work）”状态的类型版本。
- **原理与理由**：确保交付工程中的全部调用实例均已绑定到经过测试并锁定的正式版本，保障项目一致性。
- **正例 / 标准写法**：
``text
发布所有编辑中的类型版本，更新全部实例，并清理未使用的旧草稿版本
``
- **反例 / 禁止写法**：
``text
项目库中仍留有带黄色感叹号标记的 In test 版本类型
``

### RU004 【规则 Rule】 只使用局部变量
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：可重用的 FC 和 FB 内部严禁直接读写任何全局数据（Global DB、单实例 DB、PLC 变量、M 区、全局定时器/计数器、全局常量）；所有外部数据必须通过块接口形参传入，确保块属性达成“对象满足库一致性”。
- **原理与理由**：彻底解除程序块对特定工程外部全局变量名的硬编码依赖，使块可在任何项目中零修改直接复用并多次实例化。
- **正例 / 标准写法**：
``text
将所需数据声明为 Input/Output/InOut 形参，块内部仅访问 `#形参`、`#stat`、`#temp` 和 `#局部常量`
``
- **反例 / 禁止写法**：
``text
在 FB 内部直接写 `"DB_Global".motorRun := TRUE;` 或直接读 `"Tag_EmergencyStop"`
``

### RU005 【规则 Rule】 使用本地符号常量
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：在块接口的 `Constant` 区定义局部符号常量，严禁在代码逻辑中直接使用除 `0`、`0.0`、`TRUE`、`FALSE` 以外的硬编码“魔数（Magic Numbers）”； এমনকি表示特定业务含义的 0（如 `STATUS_DONE := 16#0000`、`STANDSTILL_SPEED := 0.0`）也应定义为局部符号常量。
- **原理与理由**：局部常量随块一起封装发布，无需依赖外部变量表；由预处理器直接做文本替换，零内存与零性能开销，且修改阈值时只需改接口常量一处。
- **正例 / 标准写法**：
``text
VAR CONSTANT
  MAX_VELOCITY : LReal := 150.0;
  STATUS_BUSY : Word := 16#7002;
  STANDSTILL_SPEED : LReal := 0.0;
END_VAR
IF (#velocity < #MAX_VELOCITY) THEN
  #statVelocity := #velocity;
ELSE
  #statVelocity := #MAX_VELOCITY;
END_IF;
``
- **反例 / 禁止写法**：
``text
IF #velocity < 150.0 THEN ... status := 16#7002;
``

### RU006 【规则 Rule】 程序完全符号化
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：整个程序必须 100% 采用符号化寻址，严禁使用绝对物理地址或传统的 `ANY` / `POINTER` 指针；动态类型传递应使用 `VARIANT` 或 `REF_TO` 引用。
- **原理与理由**：符号化寻址配合优化块可获得最高性能与可读性；`VARIANT` 和 `REF_TO` 支持编译期与运行期类型安全校验，避免了 `ANY` 指针因内存偏移改动引发的致命寻址错位。
- **正例 / 标准写法**：
``text
使用符号变量、UDT 结构体、ARRAY[*]、VARIANT 或 REF_TO
``
- **反例 / 禁止写法**：
``text
P#DB10.DBX0.0 BYTE 20, %MW100, %DB5.DBD12
``

### RU007 【建议 Recommendation】 独立于硬件编程
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：仅使用符合 IEC 标准的硬件无关数据类型与指令（如用 `IEC_Timer` 替代 `S5-Timer`，用优化 Global DB 替代 M 位存储器），使得代码可在 S7-1200 与 S7-1500 之间无缝移植。
- **原理与理由**：S5 定时器和硬件特定系统变量受限于特定 CPU 架构（如 S7-1200 不支持 S5Time），使用 IEC 标准多重实例可保障跨平台兼容性。
- **正例 / 标准写法**：
``text
使用 IEC_Timer (TON/TOF/TP) 多重实例、IEC_Counter (CTU/CTD) 及 Global DB
``
- **反例 / 禁止写法**：
``text
使用 S5Time (S_ODT)、计数器 C0..C255 或 M 存储区
``

### RU008 【建议 Recommendation】 使用模板
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：开发新块时优先基于经过验证的标准化块模板（如 LGF 通用函数库中提供的 PLCopen `enable` 与 `execute` 函数块模板）进行构建。
- **原理与理由**：使所有开发人员编写的程序块拥有完全统一的接口参数、状态机结构、错误处理机制与文档头，大幅缩短开发与联调时间。
- **正例 / 标准写法**：
``text
基于 LGF / PLCopen 标准模板创建带 enable 或 execute 的标准化 FB
``
- **反例 / 禁止写法**：
``text
每个程序员各自发明一套启停引脚名、状态步号和错误返回方式
``

## 7. 引用对象与内存分配 (AL001 - AL004)

### AL001 【规则 Rule】 使用多重实例而不是单个实例
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：在 FB 内部调用其他 FB（包括 IEC 定时器 TON/TOF/TP、计数器、通信块及子功能 FB）时，必须将其声明在调用方 FB 的 `Static` 区作为多重实例（Multi-instance），严禁为内部子调用创建独立的全局单实例 DB（Single Instance DB）。
- **原理与理由**：将子实例数据直接内嵌在父 FB 的背景数据块中，实现真正的面向对象封装，大幅减少项目中独立 DB 的数量并提升数据局部性。
- **正例 / 标准写法**：
``text
在父 FB 的 Static 区声明 `instWatchdogTimer : TON_TIME;`，在代码中调用 `#instWatchdogTimer(IN := ..., PT := ...);`
``
- **反例 / 禁止写法**：
``text
在 FB 内部调用 TON 时生成独立的 `"IEC_Timer_0_DB"` 单实例 DB
``

### AL002 【建议 Recommendation】 定义从 0 到常数值的数组边界
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：数组下标边界应定义为从 `0` 开始、以 `DInt` 类型的符号常量作为上限（`Array[0..#UPPER_LIMIT] of ...`）；块内数组的上限常量在块接口 `Constant` 区定义，全局 DB 和 UDT 中数组的上限常量在 PLC 变量表 `User constants` 中定义。
- **原理与理由**：1) 模运算（MOD）等系统数学指令天然基于 0 索引；2) WinCC（Comfort/Advanced/Professional/Unified）脚本处理数组均以 0 为起始下标；3) 使用 DInt 常量避免索引运算时的类型转换。
- **正例 / 标准写法**：
``text
Constant: BUFFER_UPPER_LIMIT : DInt := 10;
Static: diagnostics : Array[0..#BUFFER_UPPER_LIMIT] of "typeDiagnostics";
``
- **反例 / 禁止写法**：
``text
Array[1..10] of Int（从1开始且上限使用硬编码魔数10）
``

### AL003 【建议 Recommendation】 将数组参数声明为数组 [*]
- **适用语言**：`LAD, FBD, SCL`
- **规范要求**：当需要将一维或多维数组作为形参传入 FC 或 FB 时，应将其声明为可变长度数组 `Array[*] of <Type>`，并在块内使用系统函数 `LOWER_BOUND` 和 `UPPER_BOUND` 动态获取其上下界。
- **原理与理由**：创建与数组长度无关的通用泛型函数块；当实参组大小改变时，无需修改或重新编译已加密（专有技术保护）的库块。
- **正例 / 标准写法**：
``text
InOut: diagnostics : Array[*] of "typeDiagnostics";
代码中: #tempLow := LOWER_BOUND(ARR := #diagnostics, DIM := 1); #tempHigh := UPPER_BOUND(ARR := #diagnostics, DIM := 1);
``
- **反例 / 禁止写法**：
``text
在通用求和或排序块的形参中写死 `data : Array[0..99] of Real`
``

### AL004 【建议 Recommendation】 指定所需的字符串长度
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：声明 `String` 或 `WString` 变量时，建议使用 `DInt` 符号常量显式指定实际所需的最大字符长度（如 `String[#MAX_MESSAGE_LENGTH]`），避免直接声明不带长度的默认 `String`。
- **原理与理由**：默认 `String` 总是固定占用 256 字节（254 字符 + 2 字节头），`WString` 默认占用高达上万字节；显式限制长度可显著节省 DB 内存并在块间复制字符串时提升性能。
- **正例 / 标准写法**：
``text
Constant: MAX_MESSAGE_LENGTH : DInt := 24;
Var: errorMessage : String[#MAX_MESSAGE_LENGTH];
``
- **反例 / 禁止写法**：
``text
errorMessage : String;（仅需存20个字符却默认浪费256字节）
``

## 8. 健壮性与运行安全 (SE001 - SE006)

### SE001 【规则 Rule】 验证实际值
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：在程序块执行核心逻辑前，必须对外部传入的所有实参值进行合法性校验（如除数非零、数组下标范围、设定值上下限、枚举模式有效性）；若实参无效，必须中止危险操作并通过 `error := TRUE` 和标准化 `status`（`16#8200..16#83FF` 参数错误范围）向调用方报错。
- **原理与理由**：防止非法输入导致除零、数组越界、死循环或执行机构失控动作。
- **正例 / 标准写法**：
``text
IF (#highLimit <= #lowLimit) THEN
  #error := TRUE;
  #status := #ERR_INVALID_LIMITS; // 16#8200
  RETURN;
END_IF;
``
- **反例 / 禁止写法**：
``text
不检查 highLimit <= lowLimit 就直接用 `(x - lowLimit) / (highLimit - lowLimit)` 计算线性标定
``

### SE002 【规则 Rule】 初始化临时变量
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：块中声明的每一个临时变量（`Temp`）在当前扫描周期首次被读取之前，必须先完成显式初始化写入（直接赋初值、通过指令输出赋值或赋类型常量）。
- **原理与理由**：临时变量分配在 CPU 本地数据栈（L 栈）中，调用结束后即释放复用；虽优化块对基础类型有默认清零，但非优化块或复杂结构中的未初始化 Temp 变量会残留其他块留下的随机脏数据，引发极难排查的偶发故障。注意：工艺块中小于 0.0 的值常代表采用 TO 默认配置，初始化时须选合适初值。
- **正例 / 标准写法**：
``text
在块开头统一初始化：`#tempIndex := 0; #tempStatus := 16#0000; #tempIsValid := FALSE;`
``
- **反例 / 禁止写法**：
``text
在条件分支 IF 中对 #tempResult 赋值，但在 ELSE 分支未赋值就直接将其赋给输出参数
``

### SE003 【规则 Rule】 处理 ENO
- **适用语言**：`LAD, FBD, SCL`
- **规范要求**：必须正确处理使能输出 `ENO`：当启用自动 EN/ENO 时，调用可能产生运行时错误的指令后应检查 `ENO`；若为提升性能关闭了块的自动 EN/ENO 计算，必须在块结束前手动对 `ENO` 显式赋值（正常完成赋 `ENO := TRUE;`，发生错误赋 `ENO := FALSE;`）。
- **原理与理由**：确保在 LAD/FBD 级联调用该块时，下游串联指令能够根据 `ENO` 信号状态正确获知本块是否成功执行。
- **正例 / 标准写法**：
``text
IF #statError THEN
  ENO := FALSE;
ELSE
  ENO := TRUE;
END_IF;
``
- **反例 / 禁止写法**：
``text
关闭了自动 ENO 却不在 SCL 代码中写 `ENO := ...;`，导致外部梯形图串联在该块后面的线圈状态不确定
``

### SE004 【规则 Rule】 有选择地激活 HMI/OPC UA/Web API 数据访问
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：默认禁用所有变量的 HMI/OPC UA/Web API 访问权限；严禁将 FB 的内部静态变量（`Static`）直接暴露给 HMI/OPC UA，必须通过专门定义的接口变量或全局 HMI 数据块进行读写。
- **原理与理由**：保护 FB 内部状态机不被 HMI/OPC 客户端异步篡改，减小符号表通信暴露面并提升网络安全与通信扫描效率。
- **正例 / 标准写法**：
``text
仅在专用 HMI 接口 DB 或 UDT 上按需勾选 Accessible/Writable from HMI/OPC UA/Web API，再通过 FB 形参传入
``
- **反例 / 禁止写法**：
``text
HMI 按钮直接绑定修改 FB 背景数据块（IDB）内部的 `statState` 步号变量
``

### SE005 【规则 Rule】 评估错误代码
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：凡是调用返回错误标志（`error` / `RET_VAL`）或状态码（`status`）的子 FC、FB 或系统函数，调用方必须对其进行评估处理；若当前层级无法自动恢复，必须将错误及下层状态码向上层传递报告（参见 DA013/DA015）。
- **原理与理由**：防止系统调用（如通信、文件读写、运动控制、数组拷贝）静默失败后程序仍按正常分支继续运行。
- **正例 / 标准写法**：
``text
#tempRetVal := MOVE_BLK_VARIANT(SRC := #buffer, COUNT := 1, SRC_INDEX := 0, DEST_INDEX := 0, DEST => #item);
IF (#tempRetVal <> 0) THEN
  #statError := TRUE;
  #statStatus := #ERR_MOVE_BLK;
  #statSubfunctionStatus := INT_TO_WORD(#tempRetVal);
END_IF;
``
- **反例 / 禁止写法**：
``text
调用 `MOVE_BLK_VARIANT` 或 `WRIT_DBL` 时将 `RET_VAL` 悬空或忽略 `#instSubBlock.error`
``

### SE006 【规则 Rule】 用评估逻辑写错误 OB
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：如果在项目中添加了错误处理组织块（如 `OB80` 时间错误、`OB82` 诊断中断、`OB86` 机架故障、`OB121` 编程错误、`OB122` I/O 访问错误），严禁将其留空！必须在错误 OB 内部编写故障评估、报警记录与安全降级逻辑。
- **原理与理由**：空的错误 OB 会掩盖严重的系统或硬件故障，使 CPU 在丧失关键 I/O 或发生寻址错误时盲目维持带病运行，极易引发安全事故。
- **正例 / 标准写法**：
``text
在错误 OB 中读取启动信息（LADDR / Event_Class / Fault_ID），置位全局安全故障标志并触发诊断报警记录
``
- **反例 / 禁止写法**：
``text
为了防止 PLC 停机而塞入空的 OB121 和 OB86，里面没有任何故障置位或安全停机代码
``

## 9. 设计指南与体系架构 / PLCopen 状态机 (DA001 - DA018)

### DA001 【规则 Rule】 对项目 / 库进行结构化和分组
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：对项目与库进行层次化组织：1) 将相关程序块归入同一文件夹/组；2) 按工艺或机械单元划分软件单元（Software Units）；3) 按逻辑功能拆分为模块化 FC/FB；4) 将关联数据封装为 PLC 数据类型（UDT）；5) 在 LAD/FBD 中使用程序段（NETWORK）并在 SCL 中使用区域（`REGION <名称> ... END_REGION`）对块内代码进行结构化分区。
- **原理与理由**：提升大型工程的可导航性与模块化程度；SCL 中的 REGION 支持左侧大纲视图快速跳转与代码折叠，作用等同于 LAD/FBD 的程序段标题。
- **正例 / 标准写法**：
``text
REGION Input validation
  // ...
END_REGION
REGION State machine
  // ...
END_REGION
REGION Output assignment
  // ...
END_REGION
``
- **反例 / 禁止写法**：
``text
将上百行未分区的 SCL 代码平铺在单个块中，或把所有块堆在 Program blocks 根目录
``

### DA002 【建议 Recommendation】 使用适当的编程语言
- **适用语言**：`LAD, FBD, SCL`
- **规范要求**：按任务特性选择最匹配的编程语言：1) 复杂算法、数据处理、循环与标准库功能块首选结构化文本（SCL/ST）；2) 顶层调用环境（如 OB 块互连）和纯布尔联锁逻辑优先使用图形化语言（LAD 或 FBD，或本机 V20 的 `.s7dcl` LAD）；3) 复杂工艺步序控制推荐使用 GRAPH（或 SCL `CASE` 状态机）。
- **原理与理由**：SCL 在算法表达与代码紧凑度上最优；LAD/FBD 在展示块间信号流与现场二进制联锁诊断时最直观；GRAPH 内置步互锁与监控机制。
- **正例 / 标准写法**：
``text
顶层 OB 及安全联锁用 LAD/FBD，内部算法/通信/队列/状态机 FB 用 SCL（或在 LAD 块中插入 SCL 程序段做算术计算）
``
- **反例 / 禁止写法**：
``text
在 LAD 中用十几个算术框拼凑复杂的多项式公式，或在纯位联锁网络中用复杂的嵌套文本
``

### DA003 【规则 Rule】 设置 / 评估块属性
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：发布或创建程序块时必须激活并核查以下块属性：1) 启用“自动编号（Automatic numbering）”（注意 OB 编号决定优先级）；2) 启用“IEC 检查（IEC check）”；3) 启用“优化的块访问（Optimized block access）”；4) 评估“ENO 自动设置”；5) FB 勾选“多重实例能力（Multiple instance capability）”；6) 满足“库一致性（Library conformance）”。
- **原理与理由**：自动编号避免合入库块时发生块号冲突；IEC 检查与优化访问保障类型安全与最高 CPU 执行效率；多重实例与库一致性是模块化复用的前提。
- **正例 / 标准写法**：
``text
{ S7_Optimized_Access := 'TRUE' } + 开启 IEC Check + 自动编号 + 多重实例能力
``
- **反例 / 禁止写法**：
``text
手动固定块编号导致导入冲突，或关闭优化块访问与 IEC 检查
``

### DA004 【规则 Rule】 使用 PLC 数据类型
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：凡是用于跨块交换的数据结构或具有整体业务含义的数据集合，必须定义为全局 PLC 数据类型（UDT，以 `type` 为前缀）；匿名结构体 `STRUCT` 仅允许在块内部私有本地数据（Static/Temp）中用于简单变量分组，严禁用于块接口参数交换。
- **原理与理由**：UDT 修改后会在所有引用位置自动同步更新，且支持通过 `InOut` 按引用高效传递以及与 HMI Faceplate 直接绑定；而匿名 STRUCT 无法跨块建立类型关联。
- **正例 / 标准写法**：
``text
先创建 UDT `typeMotorConfig`，再在 Global DB 和 FB 接口中声明 `config : "typeMotorConfig"`
``
- **反例 / 禁止写法**：
``text
在 FB 的 InOut 或 Global DB 中直接声明匿名 `STRUCT ... END_STRUCT` 用于跨块传参
``

### DA005 【规则 Rule】 只通过形参交换数据
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：多个 FB 或 FC 之间交换数据必须且只能通过块接口的形式参数（`Input`、`Output`、`InOut`）完成，严禁绕过接口在块内隐式读写共享全局变量。
- **原理与理由**：保证模块的纯粹封装与调用透明性，使调用方完全掌控数据流向，并防止多处交叉访问或中断抢占引发的数据不一致。
- **正例 / 标准写法**：
``text
在顶层调度块中将上游块的输出通过变量显式连接到下游块的 Input/InOut 形参
``
- **反例 / 禁止写法**：
``text
FB_A 把结果写进全局 DB，FB_B 不带形参直接从该全局 DB 里偷读数据
``

### DA006 【规则 Rule】 仅从块内访问静态变量
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：函数块（FB）的静态变量（`Static`）属于私有内部状态，只能在声明该变量的 FB 内部访问，严禁从块外部通过“实例DB名.静态变量名”直接读取或修改。
- **原理与理由**：外部直接读写 IDB 静态变量会破坏 FB 的面向对象封装性；一旦未来 FB 内部重构静态变量名或状态逻辑，外部跨界访问将导致编译失败或不可预测的状态机错乱。
- **正例 / 标准写法**：
``text
只能通过 FB 的 `Input`、`Output`、`InOut` 形参访问数据，内部 `stat*` 和 `inst*` 严禁外部触碰
``
- **反例 / 禁止写法**：
``text
在 OB1 中直接写 `"InstMotor".statCurrentState := 0;` 或读 `"InstMotor".statInternalTimer.Q`
``

### DA007 【建议 Recommendation】 形参组
- **适用语言**：`LAD, FBD, SCL`
- **规范要求**：当一个块需要传递大量参数（例如超过 10 个，如配置参数集、设定值组或诊断数据）时，应将这些参数聚合封装为一个或多个 UDT（PLC 数据类型），并声明为 `InOut` 形参以按引用传递。（注：频繁变化且需在 LAD/FBD 调用框外直观监控的核心控制位和状态字仍建议保留为独立基本类型形参）。
- **原理与理由**：避免块调用框拉得过长难以阅读，同时利用 `InOut` 结构化参数的引用传递机制消除大批量参数进出块时的值拷贝开销。
- **正例 / 标准写法**：
``text
将配置项封装为 `typePidConfig`，通过 `InOut: config : "typePidConfig"` 传入；核心 `enable`、`actualValue`、`output`、`status` 保持独立引脚
``
- **反例 / 禁止写法**：
``text
FB 接口声明了 25 个独立的配置参数（cfgKp, cfgTi, cfgTd, cfgMaxLimit, cfgMinLimit...）
``

### DA008 【规则 Rule】 输出参数只写一次
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：每个扫描周期内，块的所有输出参数（`Output`）和函数返回值（`Ret_Val`）只能在块末尾集中写入一次；严禁在块内部读取自己的 `Output` 参数参与逻辑运算（内部运算必须使用 `temp` 或 `stat` 变量暂存，最后统一赋给 `Output`）。
- **原理与理由**：确保块退出时所有输出信号在时间与逻辑上的绝对一致性，防止块执行中途被更高优先级中断 OB 抢占时外部读到半更新的中间态输出值。
- **正例 / 标准写法**：
``text
内部全用 `#tempDone` / `#statDone` 计算，在块末尾 `REGION Outputs` 中统一执行 `#done := #statDone; #status := #statStatus;`
``
- **反例 / 禁止写法**：
``text
在块开头写 `#done := FALSE;`，中间写 `#done := TRUE;`，后面又写 `IF #done THEN ...` 读取自己的 Output 参数
``

### DA009 【规则 Rule】 仅保留使用过的代码
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：正式发布的程序中只允许保留实际参与执行的有效代码，必须彻底清理所有死代码与冗余对象（包括：从未调用的块或工艺对象、未使用的变量/常量/形参、永不执行的分支、被注释掉的废弃代码段以及导入后残留的外部源文件）。
- **原理与理由**：减少 CPU 工作存储器与装载存储器占用，加快编译速度，并消除维护人员对“这段注释掉的代码还有没有用”的困惑。
- **正例 / 标准写法**：
``text
版本由库管理，块内只保留干净的现行有效代码，无未引用变量与残余外部源
``
- **反例 / 禁止写法**：
``text
块中留有大片被 `//` 注释掉的旧版逻辑、未使用的 Temp 变量或工程树里残留已生成的外部源文件
``

### DA010 【规则 Rule】 根据 PLCopen 开发异步块
- **适用语言**：`LAD, FBD, SCL`
- **规范要求**：所有跨越多个扫描周期执行的异步功能块（如通信、文件读写、闭环控制、运动控制或复杂多步序列 FB），必须严格遵循 PLCopen 标准状态机与接口规范（区分 `enable` 连续执行模型与 `execute` 单次触发模型）。
- **原理与理由**：统一所有多周期异步块的触发握手、忙状态指示与错误恢复时序，使上层调度程序能够用完全一致的模式编排任何异步块。
- **正例 / 标准写法**：
``text
按任务性质遵循 DA011（enable 电平连续型）或 DA012（execute 边沿单次型）PLCopen 标准接口
``
- **反例 / 禁止写法**：
``text
自定义的异步 FB 没有 busy/done/valid/error 标准握手信号，调用方无法判断何时执行完毕或何时出错
``

### DA011 【规则 Rule】 带 “enable” 的连续异步执行
- **适用语言**：`LAD, FBD, SCL`
- **规范要求**：对于启动后持续保持运行并随时响应输入变化的功能块（如通信服务器、温度控制、连续监控），必须使用电平触发输入 `enable (Bool)`，并至少提供互斥的输出参数 `valid (Bool)`、`busy (Bool)`、`error (Bool)`（可选：`commandAborted (Bool)`、`status (Word)`、`diagnostics (UDT)`）。时序铁律：1) `enable` 上升沿初始化并启动块，复位旧诊断信息，`busy` 置 TRUE；2) 运行正常且输出有效时 `valid=TRUE, error=FALSE`；3) 发生可自愈错误时 `error=TRUE, valid=FALSE, busy=TRUE`（故障消除后 `valid` 自动恢复 TRUE）；4) 发生需人工干预的致命错误时 `error=TRUE, valid=FALSE, busy=FALSE`，只能通过将 `enable` 置 FALSE（下降沿）确认复位；5) 当 `enable` 复位为 FALSE 时，`valid`、`busy`、`error` 必须同步复位。
- **原理与理由**：提供标准化的电平使能连续运行握手协议，使调用方能清晰区分“正在初始化（busy=1, valid=0）”、“正常有效输出（busy=1, valid=1）”、“可自愈故障（busy=1, error=1）”与“致命故障停机（busy=0, error=1）”。
- **正例 / 标准写法**：
``text
接口参数表:
Input: enable (Bool, 电平激活)
Output: valid (Bool, 输出有效, 与error互斥), busy (Bool, 正在执行), error (Bool, 错误标志, 与valid互斥), commandAborted (Bool, 可选), status (Word, 可选, 16#7000..16#FFFF), diagnostics (typeDiagnostics, 可选)
``
- **反例 / 禁止写法**：
``text
enable 置 FALSE 后 valid 或 busy 仍挂在 TRUE，或 valid 与 error 同时为 TRUE
``

### DA012 【规则 Rule】 带 “execute” 的单次异步执行
- **适用语言**：`LAD, FBD, SCL`
- **规范要求**：对于每次触发仅执行一遍完整作业的功能块（如客户端发送一次请求、文件单次读写、轴单次定位），必须使用上升沿触发输入 `execute (Bool)`（可选 `continuousUpdate (Bool)`），并至少提供四个严格互斥的输出参数 `done (Bool)`、`busy (Bool)`、`error (Bool)`（及可选 `commandAborted (Bool)`、`status (Word)`、`diagnostics (UDT)`）。时序铁律：1) `execute` 上升沿锁存输入参数、清除旧 `diagnostics`、启动任务并将 `busy` 置 TRUE；2) `execute` 提前变 FALSE 绝不中止正在执行的任务；3) 任务结束时置位 `done`、`error` 或 `commandAborted` 之一，同时 `busy` 复位为 FALSE；4) 若任务结束时 `execute` 仍为 TRUE，则 `done/error/commandAborted` 保持 TRUE 直到 `execute` 下降沿才复位；若任务结束前 `execute` 已变 FALSE，则 `done/error/commandAborted` 必须且只能置位维持精确的 1 个扫描周期！
- **原理与理由**：确保单次异步作业从触发、执行中到完成/报错的全周期状态单义性，无论调用方给的是长电平还是单周期脉冲都能可靠捕获完成信号。
- **正例 / 标准写法**：
``text
接口参数表:
Input: execute (Bool, 上升沿触发), continuousUpdate (Bool, 可选)
Output (done/busy/commandAborted/error 四者严格互斥): done (Bool), busy (Bool), commandAborted (Bool, 可选), error (Bool), status (Word, 可选), diagnostics (typeDiagnostics, 可选)
``
- **反例 / 禁止写法**：
``text
execute 一变 FALSE 就中途强行掐断正在进行的异步任务，或 execute 为单周期脉冲时 done 连一个周期都不输出
``

### DA013 【规则 Rule】 通过 “status”/“error” 返回状态 / 错误
- **适用语言**：`LAD, FBD, SCL`
- **规范要求**：异步块与复杂函数必须通过输出参数 `status (Word)` 和 `error (Bool)` 报告内部状态与错误代码（为兼容 SIMATIC 系统块，用 `status` 替代 PLCopen 的 `errorID`）；所有状态码必须在块接口 `Constant` 区定义为局部符号常量；`status` 的最高位（Bit 15，即 `16#8000` 及以上）必须与 `error = TRUE` 严格对应。
- **原理与理由**：`status` 字最高位（半字节 3）直接编码状态分类（`16#0`=完成、`16#7`=执行中或空闲、`16#8`=标准错误、`16#9..F`=用户定义错误），既能传递无错误时的详细运行阶段，又能在出错时精准定位故障源。
- **正例 / 标准写法**：
``text
#error := #statStatus.%X15; // Bit 15 为 1 (16#8000..16#FFFF) 时 error 必为 TRUE
状态半字节分类:
16#0xxx = 执行完成
16#7xxx = 空闲或正在执行
16#8xxx = 执行时出错
16#9xxx..16#Fxxx = 用户定义错误
``
- **反例 / 禁止写法**：
``text
发生错误时 error=TRUE 但 status=16#0001（最高位不是1），或直接在代码里写裸数字状态码而不定义局部常量
``

### DA014 【规则 Rule】 “status” 使用标准化的取值范围
- **适用语言**：`LAD, FBD, SCL`
- **规范要求**：输出参数 `status (Word)` 的状态码与错误码必须严格落在西门子标准化十六进制区间内，严禁混用区间语义。
- **原理与理由**：全工程及所有库块采用统一的十六进制状态码段，使运维人员与上位机仅凭状态码前缀即可立即判断块是空闲（7000）、刚触发（7001）、运行中（7002）、参数错（82xx）、外部I/O错（84xx）还是内部系统调用错（86xx）。
- **正例 / 标准写法**：
``text
标准化 status 取值范围表:
- 16#0000 : 命令完成，无警告，无进一步详细信息 (STATUS_EXECUTION_FINISHED / STATUS_NO_ERROR)
- 16#0001..16#0FFF : 命令完成，附带详细信息
- 16#7000 : 没有正在执行的命令 / 空闲初始值 (STATUS_NO_CALL)
- 16#7001 : 收到新命令后的第一次调用 / 上升沿开启执行 (STATUS_FIRST_CALL)
- 16#7002 : 命令激活后续调用执行期间，无详细信息 (STATUS_SUBSEQUENT_CALL)
- 16#7003..16#7FFF : 命令激活后续调用执行期间，附带详细信息或非中断性警告
- 16#8001..16#81FF : 函数块操作错误（如触发信号时序非法）
- 16#8200..16#83FF : 参数设定错误（如形参超限、类型不匹配）
- 16#8400..16#85FF : 从外部执行时出错（如错误的外部 I/O 信号、轴未归位、缓冲区满）
- 16#8600..16#87FF : 执行过程中出现内部错误（如内部调用的系统函数/子块报错）
- 16#8800..16#8FFF : 保留区间
- 16#9000..16#FFFF : 用户定义的错误类
``
- **反例 / 禁止写法**：
``text
把参数超限错误定义为 16#0005 或 16#7005，或把未启动状态定义为 16#0000
``

### DA015 【建议 Recommendation】 传递下层信息
- **适用语言**：`LAD, FBD, SCL`
- **规范要求**：当一个块内部调用了其他子函数/系统块且子块发生错误时，应将当前块状态码、下层子块的原始返回状态码及错误发生时的内部状态机步号打包写入输出参数 `diagnostics`（类型为 `LGF_typeDiagnostics` 或扩展诊断 UDT）中。
- **原理与理由**：当主块返回 `16#86xx`（内部系统调用错误）时，现场工程师无需在线逐步跟踪即可从 `diagnostics.subfunctionStatus` 和 `diagnostics.stateNumber` 一眼锁定是哪一步的哪条底层指令报了什么错。该结构还可设为掉电保持以支持断电后故障追忆。
- **正例 / 标准写法**：
``text
简单诊断结构 (LGF_typeDiagnostics):
- status (Word) : 当前块的状态码/错误码
- subfunctionStatus (Word/DWord) : 下层被调用 FB/FC/系统函数的原始状态或返回值
- stateNumber (DInt) : 发生错误时块内部状态机的状态/步骤编号
(扩展诊断结构可追加 timeStamp : DTL 及 additionalValue1..X)
``
- **反例 / 禁止写法**：
``text
内部调用 TCON 或 MOVE_BLK_VARIANT 报错时只输出笼统的 error=TRUE，丢失了底层 RET_VAL 和出错步号
``

### DA016 【建议 Recommendation】 用 CASE 指令代替 ELSIF 分支
- **适用语言**：`SCL`
- **规范要求**：在存在多个离散分支或状态调度的场景下，优先使用 `CASE ... OF` 指令代替包含多个 `ELSIF` 的长链 `IF` 语句。
- **原理与理由**：使状态机与多路分支结构更清晰易读，且编译器可将密集的 CASE 分支优化为跳转表，避免长链 ELSIF 的逐条顺序比较开销。
- **正例 / 标准写法**：
``text
CASE #statState OF
  #STATE_IDLE:
    ;
  #STATE_RUN:
    ;
  ELSE
    ;
END_CASE;
``
- **反例 / 禁止写法**：
``text
IF #statState = 0 THEN ... ELSIF #statState = 1 THEN ... ELSIF #statState = 2 THEN ... ELSIF #statState = 3 THEN ...
``

### DA017 【规则 Rule】 在 CASE 指令中创建 ELSE 分支
- **适用语言**：`SCL`
- **规范要求**：每一个 `CASE` 语句必须无条件包含 `ELSE` 默认分支，并在 `ELSE` 分支中编写未定义状态的错误处理与报警逻辑（如置位 `error := TRUE`、记录 `status := #ERR_UNDEFINED_STATE`）。
- **原理与理由**：捕获运行期因意外赋值或新增枚举漏处理而落入未知状态的异常情况，防止状态机静默卡死。
- **正例 / 标准写法**：
``text
CASE #stateSelect OF
  #CMD_INIT: // Comment
    ; // Statement
  #CMD_READ: // Comment
    ; // Statement
  ELSE // default statement
    #statError := TRUE;
    #statStatus := #ERR_UNDEFINED_STATE; // Generate error message
END_CASE;
``
- **反例 / 禁止写法**：
``text
CASE 语句只有离散值分支而没有 ELSE 分支
``

### DA018 【建议 Recommendation】 避免跳转和标签
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：在程序中应避免使用跳转指令（`JMP` / `GOTO`）和跳转标签（`LABEL`）。
- **原理与理由**：跳转指令会破坏结构化编程的单向控制流，极易导致死循环（触发看门狗超时停机）或跳过关键的状态复位代码。
- **正例 / 标准写法**：
``text
使用结构化的 IF/ELSE、CASE、FOR/WHILE 循环及状态机步号转移控制流程
``
- **反例 / 禁止写法**：
``text
在 SCL 或 LAD 中使用 GOTO / JMP 来回跳跃控制流程
``

## 10. 性能优化指南 (PE001 - PE016)

### PE001 【建议 Recommendation】 禁用 “ 创建扩展状态信息 ”
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：在正式生产运行环境中，建议在块属性中取消勾选“创建扩展状态信息（Create extended status information）”。
- **原理与理由**：激活该选项会生成用于在线监视的额外诊断机器码并增加扫描耗时；仅在开发调试阶段按需开启，投产时关闭可获得更佳性能。
- **正例 / 标准写法**：
``text
块属性 Compilation -> 取消勾选 Create extended status information
``
- **反例 / 禁止写法**：
``text
所有生产环境高频块均开启扩展状态信息，额外消耗代码内存与 CPU 周期
``

### PE002 【建议 Recommendation】 避免 “ 在 IDB 中设置 ”
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：在优化 FB 的块接口中，应避免将变量的保持性设置为“在 IDB 中设置（Set in IDB）”（该选项通常是为了在优化块中强行使用 `AT` 覆盖结构而勾选）；需要位/字拆解时应改用片段访问（`.%X0`）或系统指令 `SCATTER` / `GATHER`。
- **原理与理由**：勾选“在 IDB 中设置”会导致系统在优化背景数据块内部创建一块非优化的混合存储区（大端序、固定偏移），访问该区域数据会迫使 CPU 执行格式转换与数据拷贝，显著降低性能。
- **正例 / 标准写法**：
``text
保持纯优化块，使用片段访问 `#statWord.%X0` 或 `SCATTER(IN := #statWord, OUT => #statBitArray)`
``
- **反例 / 禁止写法**：
``text
为了在优化 FB 中用 AT 覆盖拆解状态字而勾选 Set in IDB
``

### PE003 【建议 Recommendation】 使用引用传递结构化参数
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：传递结构化参数（`ARRAY`、`STRUCT`、`UDT`）时，应确保采用“按引用传递（Call by Reference）”模式：在 `FB` 中必须将大型结构化参数声明在 `InOut` 区（FB 的 `Input` 和 `Output` 对结构化参数总是执行全量深拷贝 Copy！）；在 `FC` 中结构化参数在 `Input/Output/InOut` 均按引用传递。同时必须确保调用方与被调用块均为“优化的块访问”。
- **原理与理由**：按引用传递仅传输指针引用而不复制实际数据，内存与运行耗时极小；若在 FB 的 Input/Output 传递大型结构体，或跨“优化块”与“非优化块”传递结构体，系统每次调用都会全量复制整个结构体，甚至撑爆块的 Temp 局部内存栈。
- **正例 / 标准写法**：
``text
S7-1200/1500 形参传递机制矩阵 (表 10-1):
| 块类型 | 形参方向 | 基本数据类型 (Elementary) | 结构化数据类型 (Structured: UDT/ARRAY/STRUCT) |
|---|---|---|---|
| FC | Input | Copy (按值拷贝) | Reference (按引用传递) |
| FC | Output | Copy (按值拷贝) | Reference (按引用传递) |
| FC | InOut | Copy (按值拷贝) | Reference (按引用传递) |
| FB | Input | Copy (按值拷贝) | Copy (按值全量拷贝至IDB!) |
| FB | Output | Copy (按值拷贝) | Copy (按值全量拷贝至IDB!) |
| FB | InOut | Copy (按值拷贝) | Reference (按引用传递，推荐!) |
``
- **反例 / 禁止写法**：
``text
在 FB 的 VAR_INPUT 或 VAR_OUTPUT 中声明 2KB 大小的数组或大 UDT，或者将优化 DB 的结构体传给非优化 FB
``

### PE004 【建议 Recommendation】 避免 Variant 形参
- **适用语言**：`LAD, FBD, SCL`
- **规范要求**：除非开发需要处理未知动态类型的通用通信、序列化或泛型缓冲区系统函数，否则应避免使用 `Variant` 形参，建议优先为不同数据类型创建专用的强类型块（如 `LGF_SearchMinMax_DInt`、`LGF_SearchMinMax_LReal`）。
- **原理与理由**：`Variant` 参数需要在运行时动态反射解析类型信息并执行分支拷贝，存在显著的 CPU 运行时性能损耗。
- **正例 / 标准写法**：
``text
针对高频调用的确定类型（如 DInt、LReal）分别提供强类型专用 FC/FB，仅在通用 FIFO/CRC 等容器块中使用 Variant
``
- **反例 / 禁止写法**：
``text
普通业务数学运算块为了省事把所有输入都声明成 Variant
``

### PE005 【建议 Recommendation】 避免形参 “mode”
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：避免通过输入参数（如 `mode : Int`）在单个巨型块内部用分支切换完全不同的业务功能；应遵循单一职责原则，将不同功能拆分为各自独立的程序块。
- **原理与理由**：调用方通常将 `mode` 静态固定为某一个常数，意味着该块内其余模式的大量代码成了永远不执行却占用工作内存的“死代码”；拆分独立块可减小体积、提高命名可读性并方便独立维护。
- **正例 / 标准写法**：
``text
按单一职责拆分为独立的功能块（如 LGF_CalendarWeek_ISO 与 LGF_CalendarWeek_US 分开）
``
- **反例 / 禁止写法**：
``text
写一个万能块 FB_AllInOne(mode := 3)，内部按 mode=1..10 包含十种互不相干的功能代码
``

### PE006 【建议 Recommendation】 首选临时变量
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：凡是仅在当前单个扫描周期内使用的中间计算变量，必须声明为临时变量（`Temp`）；若在块内需要频繁读取某个 `Input` 或高频读写某个 `InOut` 形参，建议先将其拷入 `Temp` 变量作为本地高速缓存。（注意：Temp 变量无法在监控表/强制表中跨周期监控）。
- **原理与理由**：CPU 访问分配在高速本地栈中的临时变量速度最快，且不占用背景数据块（IDB）的持久工作内存；对 InOut 引用参数使用 Temp 缓存可消除每次读写时的间接指针解引用开销。
- **正例 / 标准写法**：
``text
中间变量一律放 VAR_TEMP，并在块入口初始化后使用
``
- **反例 / 禁止写法**：
``text
把无需跨周期保持的循环计数器 i 或中间算术暂存值声明在 FB 的 Static 区
``

### PE007 【建议 Recommendation】 将重要的测试变量声明为静态
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：对于需要在块执行完毕后仍能在在线监控或诊断中观察其当前状态的关键测试与状态变量，应将其声明在 FB 的静态变量区（`Static`）。
- **原理与理由**：`Temp` 变量在块退出瞬间即失效释放，无法在外部监视表中观察；将关键诊断状态声明为 `Static` 可在周期结束后持久保留其值供调试分析。
- **正例 / 标准写法**：
``text
在 VAR (Static) 中声明 `statLastErrorStep : DInt;` 供在线诊断观察
``
- **反例 / 禁止写法**：
``text
把关键故障触发瞬间的诊断快照变量声明在 Temp 区，导致在线监控时看不到值
``

### PE008 【建议 Recommendation】 将控制 / 索引变量声明为 “DInt”
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：所有用于循环控制（`FOR`）、迭代计数和数组下标索引的变量，以及定义数组上下限和循环边界的符号常量，均应声明为 32 位整数 `DInt` 类型。
- **原理与理由**：S7-1200/1500 的 32 位处理器原生按 32 位寄存器进行地址偏移计算；使用 `DInt` 无需在每次循环迭代和数组寻址时插入从 16 位 `Int` 到 32 位的隐式类型扩展转换指令，处理性能最高。
- **正例 / 标准写法**：
``text
VAR_TEMP
  tempIndex : DInt;
END_VAR
VAR CONSTANT
  MAX_ARRAY_ELEMENTS : DInt := 100;
END_VAR
``
- **反例 / 禁止写法**：
``text
使用 Int 或 UInt/USInt 作为 FOR 循环变量和数组索引：`#i : Int;`
``

### PE009 【建议 Recommendation】 避免多个相同的索引访问
- **适用语言**：`SCL`
- **规范要求**：当在循环或连续语句中需要多次读写数组同一索引位置的元素（尤其是结构体数组 `#statArray[#tempIndex]` 的多个子成员）时，必须先将该数组元素整体复制到同类型的 `Temp` 临时变量中操作，处理完毕后再一次性写回数组。
- **原理与理由**：每次通过变量下标 `#statArray[#tempIndex].member` 访问数组时，CPU 系统底层都会执行一次运行期数组边界检查与基址偏移乘法；使用 Temp 缓存可将 N 次边界检查与地址重算压缩为读入、写回仅 2 次，大幅缩短循环耗时。
- **正例 / 标准写法**：
``text
FOR #tempIndex := 0 TO #MAX_ARRAY_ELEMENTS DO
  // Copy to temporary variable
  #tempCurrentData := #statArray[#tempIndex];
  // Reset all member variables
  #tempCurrentData.element1 := FALSE;
  #tempCurrentData.element2 := FALSE;
  #tempCurrentData.element3 := FALSE;
  #tempCurrentData.element4 := FALSE;
  #tempCurrentData.element5 := FALSE;
  // Write back the changes made
  #statArray[#tempIndex] := #tempCurrentData;
END_FOR;
``
- **反例 / 禁止写法**：
``text
FOR #tempIndex := 0 TO #MAX_ARRAY_ELEMENTS DO
  #statArray[#tempIndex].element1 := FALSE;
  #statArray[#tempIndex].element2 := FALSE;
  #statArray[#tempIndex].element3 := FALSE;
  #statArray[#tempIndex].element4 := FALSE;
  #statArray[#tempIndex].element5 := FALSE;
END_FOR;
``

### PE010 【建议 Recommendation】 使用片段访问代替掩码
- **适用语言**：`LAD, FBD, SCL`
- **规范要求**：访问 Byte/Word/DWord/LWord 中的单个或少数几个独立位时，应优先使用符号化片段访问（Slice access，如 `#trigger.%X1`）；当需要将一个位模式同时与整个变量中的多个位进行整体比对时，则应采用位掩码（`AND #PATTERN_MASK`）比较。
- **原理与理由**：访问少量独立位时，片段访问 `.%X` 可读性与单指令性能最优；而同时比对多位组合状态时，一次掩码与比较运算比拼接多个 `.%X` 布尔表达式更快。
- **正例 / 标准写法**：
``text
// 1. 访问少量独立位 (Bit1 = TRUE 且 Bit0 = FALSE) -> 用片段访问:
#tempIsTriggered := (#trigger.%X1 AND NOT #trigger.%X0);

// 2. 将多位模式与完整变量比对 -> 用常量掩码:
// Constant: PATTERN_MASK : Byte := 2#0000_0011; PATTERN : Byte := 2#0000_0010;
#tempIsTriggered := ((#trigger AND #PATTERN_MASK) = #PATTERN);
``
- **反例 / 禁止写法**：
``text
访问单个位时写复杂的移位与掩码，或同时比对8个位模式时写8个 `%X` 的 AND 串联
``

### PE011 【建议 Recommendation】 简化 IF/ELSE 指令
- **适用语言**：`SCL`
- **规范要求**：当 `IF/ELSE` 分支仅仅是根据布尔条件对某个布尔变量赋 `TRUE` 或 `FALSE` 时，必须将其简化为一行直接的布尔逻辑赋值表达式。
- **原理与理由**：消除条件跳转分支指令开销，减少代码内存占用并提升 CPU 流水线执行效率与代码紧凑度。
- **正例 / 标准写法**：
``text
// Check for rising edge (正确正例)
#tempIsTrigger := #trigger AND NOT #statTriggerOld;
// Store trigger for next cycle
#statTriggerOld := #trigger;
``
- **反例 / 禁止写法**：
``text
// Check for rising edge (错误反例)
IF #trigger AND NOT #statTriggerOld THEN
  #tempIsTrigger := TRUE;
ELSE
  #tempIsTrigger := FALSE;
END_IF;
#statTriggerOld := #trigger;
``

### PE012 【建议 Recommendation】 根据预期对 IF/ELSIF 分支进行排序
- **适用语言**：`SCL`
- **规范要求**：编写 `IF ... ELSIF ...` 多分支判断时，必须按照各条件在正常运行中发生的概率从高到低排序，将最可能成立的常规分支放在最前面的 `IF` 处，将极少发生的错误或异常分支放在后面的 `ELSIF` 处。
- **原理与理由**：一旦排在前面的高概率条件成立，CPU 将直接跳过后续所有 `ELSIF` 条件的求值计算，从而缩短平均扫描周期时间。
- **正例 / 标准写法**：
``text
// Check if connection is established (高概率理想情况排第一)
IF #instConnect.done = TRUE THEN
  // Connection is established - set next state
// Check if TCON throws an error (低概率异常排后面)
ELSIF #instConnect.error = TRUE THEN
  // TCON throws an error - do error handling
END_IF;
``
- **反例 / 禁止写法**：
``text
把极少发生的罕见错误分支放在第一个 IF，把 99% 周期都命中的正常状态放在最后一个 ELSIF
``

### PE013 【建议 Recommendation】 避免内存密集型指令
- **适用语言**：`LAD, FBD, SCL`
- **规范要求**：尽量避免或高频调用运行时读取符号字符串的反射指令：`GetSymbolName`、`GetSymbolPath`、`GetInstanceName`、`GetInstancePath`。
- **原理与理由**：使用上述指令会迫使编译器将完整的长符号名称字符串编入 CPU 工作存储器中；调用越频繁、符号名越长，消耗的宝贵工作存储器空间就成倍剧增。
- **正例 / 标准写法**：
``text
使用文本列表（Text Lists）配合数字索引 ID 或 ProDiag / Program_Alarm 标准报警机制代替运行时字符串反射
``
- **反例 / 禁止写法**：
``text
在每个基础设备 FB 中都调用 GetInstanceName 和 GetSymbolName 动态拼装报警文本
``

### PE014 【建议 Recommendation】 避免运行时密集指令
- **适用语言**：`LAD, FBD, SCL`
- **规范要求**：将运行时间密集型指令（如处理大数据的 `Serialize` / `Deserialize`，以及访问慢速 SIMATIC 存储卡的 `WRIT_DBL`、`READ_DBL`、`FileRead`、`FileWrite`）的调用频次降至最低，严禁在每个周期无条件连续触发；访问存储卡归档或配方优先使用 `DataLog` 和 `Recipe` 系统功能。
- **原理与理由**：大数据序列化与 SMC 闪存卡异步读写会消耗大量 CPU 时间并延长扫描周期，高频写 SMC 卡还会迅速耗尽闪存擦写寿命。
- **正例 / 标准写法**：
``text
仅在事件触发上升沿按需调用，并使用 DataLog / Recipe 管理历史数据与配方
``
- **反例 / 禁止写法**：
``text
在循环 OB1 中不加边沿限制每周期调用 Serialize 或 WRIT_DBL
``

### PE015 【建议 Recommendation】 SCL/LAD/FBD 用于运行时间敏感的应用
- **适用语言**：`LAD, FBD, SCL`
- **规范要求**：对于执行时间要求极严苛的高速控制程序段、循环中断（如 OB30）或密集算法，应使用 `SCL`、`LAD` 或 `FBD` 编写，避免在此类时间关键路径上使用 `GRAPH`。
- **原理与理由**：`GRAPH` 顺序功能图在编译时会自动生成大量额外的步激活监控、互锁评估与 HMI 诊断信息代码，其单步运行耗时高于等效的 SCL/LAD/FBD。
- **正例 / 标准写法**：
``text
常规机器主流程顺序控制推荐使用 GRAPH；高速响应或时间关键算法使用 SCL/LAD/FBD
``
- **反例 / 禁止写法**：
``text
在 1ms 高速循环中断中使用 GRAPH 编写快速响应逻辑
``

### PE016 【建议 Recommendation】 检查最小循环时间的设置
- **适用语言**：`LAD, FBD, SCL, STL`
- **规范要求**：根据应用负载特性在 CPU 硬件属性中合理配置“最小循环时间（Minimum cycle time）”：对于无高通信负载且追求极速 I/O 响应的时间关键型应用，应关闭或调小最小循环时间；对于存在高并发 HMI/OPC UA/S7 通信负载的应用，可启用并适当提高最小循环时间。
- **原理与理由**：关闭最小循环时间可让 OB1 结束后立即开启下一扫描周期，实现最快响应；而提高最小循环时间可为 CPU 操作系统预留充足的周期剩余时间片来集中处理异步通信报文，提高通信吞吐量。
- **正例 / 标准写法**：
``text
高速响应场景：取消勾选 Enable minimum cycle time for cyclic OBs；高通信吞吐场景：勾选并设置合理的最小循环时间（ms）
``



---

## 11. 实机编译避坑与工业顺控反模式补充规约 (CP001 - CP005 / LP001 - LP004)

> **来源**：TIA Portal V20 + S7-1500 真实环境 15 个工业标准 FB/FC 及配套 UDT 通宵流水线编译与安全终审实战（`D:\TIA_MCP\benchmarks\tia_compile_anti_patterns.md`）。

---

### CP001 【规则 Rule】 严禁回读 VAR_OUTPUT 输出参数 (DA008 编译级铁律)
- **适用语言**：`SCL`
- **规范要求**：在块内任何表达式右侧（RHS）、`IF/CASE` 条件或指令实参中，**严禁读取任何 `VAR_OUTPUT` 输出参数**！所有输出状态必须先在 `VAR`（`#stat...`）或 `VAR_TEMP`（`#temp...`）中完成运算，并在块末尾集中执行一次单向写入赋值。
- **原理与理由**：西门子 S7-1200/1500 优化块中 `VAR_OUTPUT` 参数是单向写出接口。编译器静态分析器若在代码中发现回读 `VAR_OUTPUT`，且无法证明在所有控制流分支读取前都已赋值，就会抛出 `The parameter '#xxx' might not be initialized` 编译警告。
- **正例 / 标准写法**：
```scl
VAR_OUTPUT
    contactorFwd : Bool;
    running      : Bool;
END_VAR
VAR
    statContactorFwd : Bool;
END_VAR
VAR_TEMP
    tempRunning : Bool;
END_VAR

// 1. 在内部静态/临时变量中完成逻辑计算
IF #cmdFwd AND #interlockOk THEN
    #statContactorFwd := TRUE;
ELSE
    #statContactorFwd := FALSE;
END_IF;

#tempRunning := #statContactorFwd; // 读取内部变量，合法

// 2. 在块末尾集中单向写出到 VAR_OUTPUT
#contactorFwd := #statContactorFwd;
#running      := #tempRunning;
```
- **反例 / 禁止写法**：
```scl
// 错误反例：直接在逻辑中写输出参数，随后又在右侧回读
#contactorFwd := #cmdFwd AND #interlockOk;
#running := #contactorFwd; // 报 Warning: The parameter '#contactorFwd' might not be initialized.
```

---

### CP002 【规则 Rule】 VAR_TEMP 临时变量必须在 BEGIN 首段全量赋初值 (SE002 编译级铁律)
- **适用语言**：`SCL`
- **规范要求**：在 `BEGIN` 关键字之后的第一段，必须无条件对 `VAR_TEMP` 中声明的**每一个变量**显式赋予安全初值（`Bool := FALSE;`、`Int := 0;`、`Real := 0.0;`、`Time := T#0s;`），严禁仅在 `IF/CASE` 分支内局部赋值。
- **原理与理由**：`VAR_TEMP` 分配在 CPU 本地数据栈（L 栈）中，每次块调用后内存即释放复用。若仅在条件分支中赋值，当条件不满足时会残留上一扫描周期其它程序块写入的脏数据，引发执行机构偶发幽灵动作，并触发编译警告。
- **正例 / 标准写法**：
```scl
VAR_TEMP
    tempCmdFwd  : Bool;
    tempCmdRev  : Bool;
    tempIndex   : DInt;
    tempTimeout : Time;
END_VAR

BEGIN
    // 首行无条件全量显式初始化
    #tempCmdFwd  := FALSE;
    #tempCmdRev  := FALSE;
    #tempIndex   := 0;
    #tempTimeout := T#0s;
```
- **反例 / 禁止写法**：
```scl
BEGIN
    // 错误反例：未全量初始化，直接在分支中部分赋值
    IF #modeAuto THEN
        #tempCmdFwd := #autoReqFwd; // 若 modeAuto=FALSE，#tempCmdFwd 值为 L 栈随机残留值！
    END_IF;
    #contactorFwd := #tempCmdFwd;
```

---

### CP003 【规则 Rule】 FC 严禁声明 VAR 静态段，FB 定时器必用 VAR 多重背景并在空闲/故障显式复位 (AL001 编译级铁律)
- **适用语言**：`SCL`
- **规范要求**：
  1. `FUNCTION`（FC）严禁包含 `VAR ... END_VAR` 静态变量段；FC 跨周期状态记忆必须通过挂载于 `VAR_IN_OUT` 的 `"UDT_HMI_xxx"` 结构体传入。
  2. `FB` 内部所有定时器/计数器必须在 `VAR` 段声明为 `TON_TIME` 多重背景实例；且必须在 `IDLE`、`FAULT` 或复位分支显式执行 `#instTimer(IN := FALSE, PT := ...)` 复位。
- **原理与理由**：FC 没有专属背景数据块，声明 VAR 直接引发博途语法错误。若定时器调用塞在 `IF` 单边分支里，当使能条件变为 FALSE 时定时器得不到扫描无法复位输入引脚，导致下一次无法重新触发计时。
- **正例 / 标准写法**：
```scl
// FB 中声明多重背景定时器
VAR
    instDeadbandTimer : TON_TIME;
END_VAR

// 在 IDLE 或状态复位时显式复位定时器
IF (#statState = #STATE_IDLE) OR #statError THEN
    #instDeadbandTimer(IN := FALSE, PT := #tDeadband);
ELSIF (#statState = #STATE_DEADBAND) THEN
    #instDeadbandTimer(IN := TRUE, PT := #tDeadband);
    IF #instDeadbandTimer.Q THEN
        #statState := #STATE_IDLE;
    END_IF;
END_IF;
```
- **反例 / 禁止写法**：
```scl
// 错误反例 1：在 FUNCTION 中声明静态段
FUNCTION "FC_Test" : Void
VAR
    statCount : DInt; // 报语法错误：'VAR' is not allowed in a FUNCTION.
END_VAR

// 错误反例 2：定时器只在单边分支调用，无法复位
IF (#statState = #STATE_DEADBAND) THEN
    #instDeadbandTimer(IN := TRUE, PT := #tDeadband);
END_IF;
```

---

### CP004 【规则 Rule】 TIME/DINT/REAL 严禁隐式混算与浮点数直接判等 (PE008 编译级铁律)
- **适用语言**：`SCL`
- **规范要求**：
  1. `Time` 类型与整数运算时，必须调用显式类型转换函数 `TIME_TO_DINT(...)`。
  2. 浮点运算常量必须带小数点（写 `0.0`、`1.0`，严禁写 `0`、`1`）。
  3. 严禁对 `REAL` 浮点数使用 `=` 或 `<>` 直接判等；边界与零值判断必须使用 `<= 0.0`、`>= 0.0` 或容差比较 `ABS(#a - #b) <= 1.0e-6`。
- **原理与理由**：博途启用严格 IEC 类型检查后，不支持跨类型隐式算术运算；IEEE 754 浮点数存在二进制精度舍入，直接用 `=` 判等极易因微小尾数差异导致分支永远不命中。
- **正例 / 标准写法**：
```scl
// 显式转换 Time 为毫秒整数 DInt 进行周期累加
#tempDebounceMs := TIME_TO_DINT(#debounceTime);
#statElapsedMs  := #statElapsedMs + #scanCycleMs;

// 浮点数安全比较与计算
IF (#rawMax <= #rawMin) OR (#engMax <= #engMin) THEN
    #error := TRUE;
    #status := 16#8200;
ELSIF ABS(#actualValue - #setpoint) <= 1.0e-4 THEN
    #inDeadband := TRUE;
END_IF;
```
- **反例 / 禁止写法**：
```scl
// 错误反例：Time 直接与整数相加，浮点数用 = 判等
#statElapsed := #statElapsed + #debounceTime; // 报 Invalid data type for operator '+'
IF #actualValue = 100.0 THEN                 // 浮点直接判等不可靠！
    ...
```

---

### CP005 【规则 Rule】 TIA V20 Openness 外部源导入依赖顺序与符号双引号/井号铁律
- **适用语言**：`SCL`, `SimaticML`, `Openness`
- **规范要求**：
  1. **依赖顺序**：必须先导入并编译 `UDT_HMI_xxx` 数据类型，再导入编译引用该 UDT 的 `FB/FC`。
  2. **局部变量井号 `#`**：块内所有局部变量（形参、静态变量、临时变量、局部常量）在代码体中 100% 强制带 `#` 前缀（如 `#eStopOk`、`#statState`）。
  3. **全局符号双引号 `""`**：所有全局数据块名、PLC 变量名与 UDT 类型名 100% 强制带英文双引号（如 `ioHmi : "UDT_HMI_MotorRevCtrl";`）。
- **原理与理由**：TIA V20 外部源编译器按编译单元独立解析。缺少双引号或井号会导致符号解析歧义并报 `Undefined identifier`；未按拓扑依赖顺序导入会导致 `Data type unknown` 编译致命错误。
- **正例 / 标准写法**：
```scl
// 引用全局 UDT 类型带双引号
VAR_IN_OUT
    ioHmi : "UDT_HMI_MotorRevCtrl";
END_VAR

// 代码中局部变量 100% 带 #
#ioHmi.bRunningFwd := #statContactorFwd;
#error := (#statState = #STATE_FAULT);
```

---

### LP001 【规则 Rule】 电机正反转状态机严禁旁路灭弧冷却死区 (工业逻辑反模式 L1)
- **适用语言**：`SCL`
- **规范要求**：正反转控制状态机中，**反向启动请求判断必须优先于正常停止退出条件**；且电机从运行态（正转或反转）离开时，无论是收到停止命令还是反向命令，均必须强制转移至 `STATE_DEADBAND` 冷却态（延时至少 1.0s），冷却计时未到严禁直接切回 `STATE_IDLE`。
- **工业危害分析**：若停止条件 `IF NOT reqFwd THEN statState := IDLE` 排在换向判断之前，当操作员将旋钮从正转直接切为反转时，第 1 周期正转停止回到 `IDLE`，第 2 周期立即从 `IDLE` 启动反转，**接触器 1s 灭弧冷却死区被完全绕过**，前一接触器电弧尚未熄灭导致主回路发生相间短路爆弧！
- **正例 / 标准写法**：
```scl
CASE #statState OF
    #STATE_FWD:
        // 核心：必须将反向请求或换向死区强制排在停止退出前！
        IF (NOT #interlockOk) OR (NOT #eStopOk) OR (NOT #thermalTripOk) THEN
            #statState := #STATE_FAULT;
        ELSIF #tempReqRev THEN
            // 换向请求：先进入灭弧死区，并记录目标方向为反转
            #statTargetDir := 2;
            #statState     := #STATE_DEADBAND;
        ELSIF NOT #tempReqFwd THEN
            // 正常停机：同样强制进入灭弧死区冷却
            #statTargetDir := 0;
            #statState     := #STATE_DEADBAND;
        END_IF;

    #STATE_DEADBAND:
        #instDeadbandTimer(IN := TRUE, PT := #tReverseDeadband);
        IF #instDeadbandTimer.Q THEN
            #instDeadbandTimer(IN := FALSE, PT := #tReverseDeadband);
            IF (#statTargetDir = 2) AND #tempReqRev AND #interlockOk THEN
                #statState := #STATE_REV;
            ELSIF (#statTargetDir = 1) AND #tempReqFwd AND #interlockOk THEN
                #statState := #STATE_FWD;
            ELSE
                #statState := #STATE_IDLE;
            END_IF;
        END_IF;
```
- **反例 / 禁止写法**：
```scl
// 危险反例：停止退出排在反向之前，导致换向死区被旁路
#STATE_FWD:
    IF (NOT #interlockOk) OR (NOT #tempReqFwd) THEN
        #statState := #STATE_IDLE; // 第1周期直接回 IDLE，第2周期从 IDLE 瞬间吸合反转！
    ELSIF #tempReqRev THEN
        #statTargetDir := 2;
        #statState := #STATE_DEADBAND;
    END_IF;
```

---

### LP002 【规则 Rule】 PLCopen Execute 单次作业完成步严禁同周期跳回 IDLE 吞掉 done 脉冲 (工业逻辑反模式 L2)
- **适用语言**：`SCL`
- **规范要求**：遵循 PLCopen `Execute` 握手规范（`DA012`），单次异步作业步序在进入 `STEP_DONE` 后，必须保持 `done := TRUE` 至少 1 个完整扫描周期，等待调用方将输入 `execute` 置为 `FALSE` 确认后才可跳回 `STEP_IDLE`；且 `done` 与 `busy` 必须严格互斥。
- **工业危害分析**：若在进入 `STEP_DONE` 分支的同一个扫描周期内立即将步号修改为 `#STEP_IDLE`，块末尾计算 `#done := (#statStep = #STEP_DONE)` 结果恒为 `FALSE`。上位主调度状态机永远捕获不到单次执行完成的握手脉冲，造成整线顺控永久卡死。
- **正例 / 标准写法**：
```scl
CASE #statStep OF
    #STEP_EXEC_OPERATION:
        IF #operationComplete THEN
            #statStep := #STEP_DONE;
        END_IF;

    #STEP_DONE:
        // 维持在 STEP_DONE，直到外部 execute 信号跌落确认
        IF NOT #tempExecReq THEN
            #statStep   := #STEP_IDLE;
            #statStatus := #STATUS_NO_CALL; // 16#7000
        END_IF;
END_CASE;

// 块尾集中计算互斥的 PLCopen 输出
#done := (#statStep = #STEP_DONE);
#busy := (#statStep <> #STEP_IDLE) AND (#statStep <> #STEP_DONE) AND NOT #statError;
```
- **反例 / 禁止写法**：
```scl
// 错误反例：同周期立即跳回 IDLE，吞掉 done 完成脉冲
#STEP_DONE:
    #ioHmi.diStoredCount := #ioHmi.diStoredCount + 1;
    #statStep := #STEP_IDLE; // 同周期立即改回 0！

// 块尾计算时 #statStep 已经是 0，#done 永远输出 FALSE！
#done := (#statStep = #STEP_DONE);
```

---

### LP003 【规则 Rule】 外部接触器 EDM 常闭辅助触点反馈回路严禁写入吸合保持条件 (工业逻辑反模式 L3)
- **适用语言**：`SCL`
- **规范要求**：安全继电器与急停控制中的外部设备监控回路（EDM / `feedbackLoopOk`）串联的是外部接触器的**常闭（NC）辅助触点**。该信号仅允许在复位上升沿（`STATE_WAIT_RESET -> STATE_RUN_SAFE`）作为吸合前置校验；在吸合运行期间严禁将 `NOT feedbackLoopOk` 作为持续切断条件。
- **工业危害分析**：主接触器吸合后其常闭辅助触点必然断开，`feedbackLoopOk` 立即变为 `FALSE`。若将其作为持续运行条件，会导致安全继电器刚吸合输出一个周期，下一周期就被自身接触器的常闭辅助断开动作自切，产生高频震荡接触器打火。
- **正例 / 标准写法**：
```scl
CASE #statState OF
    #STATE_WAIT_RESET:
        // feedbackLoopOk 仅在复位上升沿作为闭合前置校验（确认接触器未发生熔焊粘连）
        IF #tempResetRis AND #ch1Ok AND #ch2Ok AND #feedbackLoopOk THEN
            #statState := #STATE_RUN_SAFE;
        END_IF;

    #STATE_RUN_SAFE:
        // 运行期间持续切断条件仅判定双急停回路，绝不判定 feedbackLoopOk！
        IF (NOT #ch1Ok) OR (NOT #ch2Ok) THEN
            #statState := #STATE_FAULT_TRIPPED;
        END_IF;
END_CASE;

#safetyOutput := (#statState = #STATE_RUN_SAFE);
```
- **反例 / 禁止写法**：
```scl
// 错误反例：将 feedbackLoopOk 放入吸合后的持续切断条件
#STATE_RUN_SAFE:
    IF (NOT #ch1Ok) OR (NOT #ch2Ok) OR (NOT #feedbackLoopOk) THEN
        #statState := #STATE_FAULT_TRIPPED; // 接触器一吸合，NC 触点一开，下一周期立即自杀断开！
    END_IF;
```

---

### LP004 【规则 Rule】 顺序控制状态机严禁声明到位限位却漏判悬空或预备步漏开驱动 (工业逻辑反模式 L4)
- **适用语言**：`SCL`
- **规范要求**：顺序控制状态机的每一个步骤转移条件，必须闭环核对所有声明的到位与限位传感器（如 `atEntry`、`atExit`、`posAtLimit`）及双限位冲突互锁（`limit0 AND limit90`）；在等待进料预备步中必须保持入口输送辊道运转，禁止出现“声明了传感器却不判读”的悬空引脚或预备步漏开驱动。
- **工业危害分析**：等待工件到达预备步若把入口驱动辊道停掉，仅靠工件惯性无法触发入口传感器导致工序停摆卡料；若声明了升降挡料板到位限位却未等待 `posAtLimit=TRUE` 即启动推料/出料，会导致机械结构在气缸未到位前强行干涉撞机。
- **正例 / 标准写法**：
```scl
CASE #statStep OF
    #STEP_WAIT_ENTRY:
        // 1. 预备步保持入口驱动开启，确保托盘能稳定送达传感器
        #tempEntryConv := TRUE;
        IF #atEntry THEN
            #statStep := #STEP_FEED_INTO_TURNTABLE;
        END_IF;

    #STEP_EJECT:
        // 2. 先等待限位到位传感器闭环确认，再启动出料电机
        #posRaise := TRUE;
        IF #posAtLimit THEN
            #convBases := TRUE; // 挡料板完全抬起后才启动传送带，杜绝撞机
            IF #partLeaving THEN
                #statStep := #STEP_DONE;
            END_IF;
        END_IF;
END_CASE;
```
- **反例 / 禁止写法**：
```scl
// 错误反例：预备步停转入口辊道，且动作步不判限位
#STEP_WAIT_ENTRY:
    #tempEntryConv := FALSE; // 托盘在交界处失去动力停摆，卡在入口前
    IF #atEntry THEN #statStep := 30; END_IF;

#STEP_EJECT:
    #posRaise  := TRUE;
    #convBases := TRUE; // 挡料板还在上升途中就直接开皮带，拉扯工件撞坏工装！
```
