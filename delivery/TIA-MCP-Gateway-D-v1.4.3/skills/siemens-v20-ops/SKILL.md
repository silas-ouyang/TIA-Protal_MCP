---
name: siemens-v20-ops
description: 西门子 TIA Portal V20 的实操约束与坑位清单。涉及 V20 工程的块读写、LAD 生成、硬件改参、在线下载、WinCC Unified 绑定时先读本文件，避免用 V21 的做法在 V20 上踩空。含本机路径、程序集结构、编码规则、版本分水岭与排错顺序。
---

# TIA Portal V20 实操规则

V20 和 V21 不是"版本号差 1"，是**两套 API 形态**。很多在 V21 上理所当然的做法，在 V20 上直接失败。
本文件只记 V20 的差异和坑，通用工程规则见 `plc-skill`，MCP 操作规则见 `tia-portal-ops`。

每条规则后面标了来源：`[A]` = tia-portal-mcp v1.4.1 的服务端指令，`[B]` = TIA_MCP_Delivery v2.7.8 的 skill/能力矩阵，`[实测]` = 本机验证。

## 1. 本机事实（先记住，省很多试错）

| 项 | 值 | 来源 |
|---|---|---|
| 安装根 | `D:\TIA_Portal_v20\Portal V20`（**非标准路径**，不在 `C:\Program Files\Siemens`） | 实测 |
| Openness 目录 | `D:\TIA_Portal_v20\Portal V20\PublicAPI\V20`（**没有 `net48` 子目录**，DLL 直接在这层） | 实测 |
| 程序集 | `Siemens.Engineering.dll` + `Siemens.Engineering.Hmi.dll`，版本 `2000.0.9501.1` | 实测 |
| 程序集形态 | **单体 DLL**，没有 V21 的 `Base` / `Step7` / `WinCCUnified` 拆分 | [B] + 实测 |
| 同机其它版本 | V16 在 `E:\tia16\1\Portal V16` | 实测 |

**推论**：任何按 V21 拆分程序集写的工具（比如 Czarnak 那套要求 `Siemens.Engineering.Base.dll`）在 V20 上**加载即失败**，不是配置问题。要用 V20，只能选按单体 DLL 编译的实现（B 的 `runtime/v20`，或 A）。

## 2. 语言与编码

### 2.1 默认语言（**分上游，不要一刀切**）

V20 工程在网关 D 上**默认路由到 B**，所以不能把 A 的策略当全局规则：

- **走 A 时**：默认 LAD + 中文网络注释 + 全部逻辑进 Main(OB1)。要改 SCL 必须说明理由。`[A]`
- **走 B 时**：按 UDT + GlobalDB + FB/FC 模块化组织，LAD 与 SCL 按网络职责分工，**不强制 LAD** `[B]`
- **无论走谁**：`McpGuides.cs:89` 严禁把 OB1 放进 B 的 `.scl` 外部源——会和 CPU 自动生成的 OB1 冲突，整批原子回滚。B 上写 OB 只能走 `.s7dcl` 或 XML。

### 2.2 编码（这是 V20 上翻车最多的地方）

| 文件 | 编码 | 后果 |
|---|---|---|
| `.scl` 纯 ASCII | UTF-8 **无 BOM** | 正常 |
| `.scl` 含中文 | UTF-8 **带 BOM** | 不加 BOM 会被按 GBK 读成乱码，然后报**假语法错误**（`BEGIN invalid` 之类），浪费大量时间 | 
| `.s7dcl` / `.s7res` | UTF-8 **带 BOM** | 同上 |
| 块 / UDT / 变量表 XML | UTF-8 **带 BOM** | 同上 |

`[B]` 的 `WritePlcSclSourceFile` 描述里明确写 "UTF-8 WITH BOM, so Chinese comments are not imported as mojibake/乱码"。

**实操建议**：含中文的块优先走 `.s7dcl` 或 XML，别用 `.scl` 赌编码。网关 D 的 `d_write_block` 已按此规则自动加 BOM。

## 3. LAD 生成：V20 有 Update 分水岭

- **紧凑 LAD 自动路径要求 V20 Update 4 及以上**。`[A]`
- V15–V19 只能导入**同版本 TIA 导出的 LAD SimaticML XML**，不能走自动生成。`[A]`
- 只有用户明确同意才改用 SCL，不得静默换语言。`[A]`

**所以第一件事是确认 Update 号**：Update 4 以下，LAD 只能"照抄一份同版本导出的 XML 再改"，不能指望工具从零生成。

## 4. 块导入导出：V20 **支持** .s7dcl，不要退回手写 XML

> 修订说明：本节初版根据 B 工具描述里的 "PREFERRED on V21+" 反推"V20 不该用 s7dcl"，**这个推论是错的**。
> 经核对 B 的源码（`Portal.Blocks.cs`、`Capability.cs`）：`ExportAsDocuments` / `ImportFromDocuments`
> 的版本判断是 `TiaMajorVersion >= 20`，**V20 就正式支持**，"PREFERRED on V21+" 只是沿用的历史文案。

正确结论：

- **V20（含 Update 4+）完全支持 `.s7dcl`（SIMATIC SD 格式）的导入导出。** `[B 源码]`
- 无论 V20 还是 V21，**都不要手写 LAD 的 SimaticML FlgNet XML**——UId 进制与连线图极易报错，是导入失败的头号原因。`[B]`
- V20 **拒绝**带 V21 token 的 SimaticML XML。`[B]`

写块的正确优先级：

| 场景 | 用什么 |
|---|---|
| 简单块 / DB / UDT / 变量表 | `PlcBuildAndImport`（声明式，最稳） |
| 已有 LAD 逻辑要改 | `.s7dcl` + 配对的 `.s7res`（**含标题/中文注释时两个文件都必须有**） |
| 只有 V20 Update 4 以下，或要回灌原样导出的 XML 备份 | `ImportBlock` / `import_program_blocks`（XML） |
| 复杂算法 | SCL（含中文必须带 BOM） |

**`.s7dcl` 的四条硬约束**（全部来自 B 源码，违反任一条都会失败或静默出错）：

1. **`S7_NetworkTitle` / `S7_BlockTitle` 绝对不能直接内联中文**——会导致**静默导入 0 个块**（不报错，但什么都没进去）。标题里的中文必须放进 `.s7res` 的 `MLC_*` 引用。`[B: McpGuides.cs:57]`
2. **`.s7res` 是 YAML 格式，不是 XML**。每个多语言条目必须包含 `en-US` 词条，否则 B 的 `S7ResScanner.GetMissingEnUsIds` 会报 `missingEnUsIds` 警告。`[B: McpServer.Documents.cs:250,535]`
3. **每个 NETWORK 前面必须紧跟一行 pragma**：`{ S7_Language := "LAD" }`（或 `"SCL"`），漏掉必报语法错误。`[B: McpGuides.cs:108]`
4. SCL 正文里的 `//` 中文注释**可以**内联，不受第 1 条限制。

**关键约束**：`.s7dcl` 里只要有 `MLC_*` 引用（标题、中文注释都会产生），同一目录下必须同时有
UTF-8 带 BOM 的 `<块名>.s7res`，否则 `ImportFromDocuments` 必败。网关 D 的 `d_write_block`
用 `res_content` 参数处理这一点。

**另一个坑**：块名里的点（如 `FB_Motor.V2`）在 B 上是**有意义的**——`ImportFromDocuments` 用传入的
`fileNameWithoutExtension` 去工程里反查原块号，名字被改掉就会丢原编号并被重新编号。所以网关 D 的
`slug()` 只过滤连续点号和首尾点，**保留块名中间的单点**。

另外两条来自 B 源码的硬事实：

- `ImportPlcExternalSource` 对**已存在的同名外部源**会报 `"The name is not unique"`——必须先 `DeletePlcExternalSource`。
- `GenerateBlocksFromExternalSource` **不会覆盖工程中已有的同名块**（只更新时间戳，代码仍是旧的），
  更新已有块要走 `ImportFromDocuments(importOption: 'Override')` 或先删块。

### 4.1 怎么零翻车拿到 `.s7dcl` / `.s7res` 模板

`.s7res` 必须含 `en-US` 词条、`MLC_*` 引用要一一对应——凭记忆写几乎必错。三条口诀：

1. **能不用 `.s7res` 就不用**。中文写在 SCL 正文或 RUNG 的 `//` 注释里，**不需要**多语言资源文件。
   只有块标题 / 网络标题要显示中文时才必须上 `.s7res`（`S7_BlockTitle` / `S7_NetworkTitle` 里不能内联中文）。
2. **不需要多语言标题时，`.s7res` 直接给 `<root />` 就行**。
   真机实测：V20 导出的无多语言词条的 `.s7res` 内容就是这 8 个字符（UTF-8 带 BOM），
   传 `res_content: '<root />'` 就能通过 `ImportFromDocuments` 的校验。**这一步可以省掉"先导出抄模板"**。
3. **需要多语言标题时，先导出抄模板**。`ExportAsDocuments` 导一个工程里现成的块（如 `Main`），
   照抄它生成的 `.s7dcl` + `.s7res` 结构，**不要自己猜字段名**。
   网关 D 上：`d_call({server:'b', tool:'ExportAsDocuments', arguments:{softwarePath, blockPath, exportPath}})`。

真机导出的 `.s7dcl` 骨架长这样（注意每个 NETWORK 前都有 `{ S7_Language := "LAD" }`）：

```
{
    S7_Optimized := "TRUE";
    S7_Language := "LAD";
}
ORGANIZATION_BLOCK "Main"
    {
      S7_Language := "LAD"
    }
    NETWORK
        RUNG wire#powerrail
        END_RUNG
    END_NETWORK
END_ORGANIZATION_BLOCK
```

### 4.1.1 读块的限制：块调用读不出来

`DescribeBlockLogic`（网关 `d_read_block` 走的就是它）只渲染 **FlgNet 梯形图**，
**不渲染 Call 指令**。如果某个网络里只有一句 `"实例DB"()` 或 `"FC名"()`，读回来会是：

```
── 程序段 2  [LAD]
   (无 FlgNet / 不支持的语言)
```

这不是块坏了，是它本来就只有调用。真机上 `Main` 就是这个情况。

**绕法**：改用 `ExportAsDocuments` 导出 `.s7dcl` 看原文，或 `GetBlockInfo` 看块属性。
真实工程里 OB1 常常只有一个 FB 调用，所以读 OB1 前先有心理准备。

### 4.2 写进分组：先编译，再移动

`GenerateBlocksFromExternalSource` 永远把块生成在 `Program blocks` **根目录**，不会进指定分组。
要进分组必须再调 `MoveBlockToGroup`。但——

> **`MoveBlockToGroup` 内部是"导出 → 重导入"，而刚生成还没编译的块是 inconsistent 状态，
> Openness 会拒绝导出**：`Inconsistent blocks and PLC data types (UDT) cannot be exported.`

所以顺序必须是 **生成 → 编译 → 移动**。真机实测：加了编译这一步之后，块正确落到
`程序块/工位A/子功能/FC_GRP`，编译 0 错。

另外 `ImportPlcExternalSource` 的 `groupPath` 指的是**外部源文件夹**，不是程序块组，**固定传空**。
网关 D 的 `d_write_block` 已按这个顺序生成计划。

### 4.3 块名不要带根容器前缀

`Program blocks`（中文显示为 `程序块`）这个容器**不是路径的一部分**。根级块必须用裸名 `Main`，
带上前缀 `程序块/Main` 反而会去找一个叫"程序块"的用户文件夹然后失败（`McpGuides.cs:148`）。
B 的报错信息里会显示 `程序块/Main`，照抄回传就会踩这个坑——网关 D 的 `stripRoot()` 已经帮你剥掉。

### 4.4 在 B 上写 LAD：用 `.s7dcl` 紧凑 DSL，**不要手写 XML**

这是本项目踩过最贵的一个坑：AI 想写 LAD，先试 `.s7dcl` 语法写错（失败 25 次），
转去手写 Openness FlgNet XML，又花了 40 分钟试错才通。

**真相是：`.s7dcl` 本身就是一套紧凑 DSL，机械、可预测，几分钟就能写对。**
XML 里要手写 `Part`/`UId`/`Wire`/`NameCon` 的连通图，纯属绕远路。

#### 指令语法表（真机导出 + 实测编译通过）

| 你要的 | 写法 |
|---|---|
| 常开触点 | `Contact( "Tag" )` |
| 常闭触点 | `I_Contact( "Tag" )` ← **不是** `Contact` 加取反 |
| 上升沿 | `PBox( "边沿存储位" )` ← 参数是**边沿位**，不是被检测的信号 |
| 普通线圈 | `Coil( "Tag" )` |
| 置位线圈 | `S_Coil( "Tag" )` |
| 复位线圈 | `R_Coil( "Tag" )` |
| 并联（OR） | 见下方"并联" |
| 定时器 | `"背景DB".实例名.TONR{ time_type := Time }( R := ..., PT := T#6s, ET =>  )` |
| 计数器 | `"背景DB".实例名.CTU{ value_type := Int }( R := ..., PV := Int#12, CV =>  )` |

**三条硬规则**：

1. **定时器/计数器必须用"背景 DB + 实例名 + 指令"三段式**，不能写成裸 `TON`。
   `{ time_type := Time }` / `{ value_type := Int }` 这个模板参数不能省。
2. **常量要带类型前缀**：时间 `T#6s`、整数 `Int#12`、实数 `Real#1.5`。
   写 `PV := 12` 会报类型错误。
3. **每个 NETWORK 前面必须紧跟** `{ S7_Language := "LAD" }`，漏了必报语法错。

#### 并联：用 `wire#` 命名节点

```
RUNG wire#powerrail
    Contact( "St1" )
    wire#w1                 ← 分支点
    I_Contact( "Pause" )
    Coil( "KM1_Conveyor" )
END_RUNG
RUNG wire#powerrail         ← 支路 1
    Contact( "St5" )
END_RUNG wire#w1            ← 汇合回 w1
RUNG wire#powerrail         ← 支路 2
    Contact( "St6" )
END_RUNG wire#w1
```

主干 RUNG 中间放一个 `wire#名字` 作为节点，支路 RUNG 从 `wire#powerrail` 起、
用 `END_RUNG wire#名字` 汇合。**不需要手算 UId，也不需要 XML。**

#### 可直接改的最小模板（实测：导入成功 + 编译 0 错）

```s7dcl
{
    S7_Optimized := "TRUE";
    S7_Language := "LAD";
}
FUNCTION "FC_LAD_TEMPLATE" : Void

    {
      S7_Language := "LAD"
    }
    NETWORK
        RUNG wire#powerrail
            Contact( "SB1_Start" )
            Coil( "CmdStart" )
        END_RUNG
    END_NETWORK

    {
      S7_Language := "LAD"
    }
    NETWORK
        RUNG wire#powerrail
            I_Contact( "SB4_Stop" )
            S_Coil( "Run" )
        END_RUNG
    END_NETWORK

    {
      S7_Language := "LAD"
    }
    NETWORK
        RUNG wire#powerrail
            Contact( "SB1_Start" )
            PBox( "EdgeStart" )
            wire#w1
            I_Contact( "Pause" )
            R_Coil( "StopReq" )
        END_RUNG
        RUNG wire#powerrail
            Contact( "SB3_Resume" )
        END_RUNG wire#w1
    END_NETWORK

    {
      S7_Language := "LAD"
    }
    NETWORK
        RUNG wire#powerrail
            Contact( "St2" )
            I_Contact( "Pause" )
            "DB_Timer".T1_Fill.TONR{ time_type := Time }(
                R := "T1_Rst", 
                PT := T#6s, 
                ET =>  
            )
        END_RUNG
    END_NETWORK

    {
      S7_Language := "LAD"
    }
    NETWORK
        RUNG wire#powerrail
            Contact( "B2_BottleOut" )
            "DB_Count".C1_Bottle.CTU{ value_type := Int }(
                R := "ClrCnt", 
                PV := Int#12, 
                CV =>  
            )
            Coil( "CntOK" )
        END_RUNG
    END_NETWORK

END_FUNCTION
```

配合 `res_content: '<root />'` 即可（无中文标题时不需要 `.s7res` 条目）。

#### 写之前先导一份出来抄

最稳的做法：工程里随便找个同类块 `ExportAsDocuments` 导出，照它的写法改。

```
d_call({server:'b', tool:'ExportAsDocuments',
        arguments:{softwarePath:'PLC_1', blockPath:'Main', exportPath:'<目录>'}})
```

会得到 `Main.s7dcl`（逻辑）+ `Main.s7res`（多语言，无中文时就是 `<root />`）。
**照着真实导出的格式改，比凭记忆写靠谱十倍。**

### 4.5 暂停 / 继续（断点续行）怎么做

顺序控制里"暂停后从断点继续"是经典难点。**用 `TONR`，不要用 `TON`，也不要自己造时基。**

| 定时器 | IN 断开时 ET |
|---|---|
| `TON` | **清零** —— 暂停就前功尽弃 |
| `TONR` | **保持** —— 继续后接着累加 |

做法：

- 定时器 `IN` = `该步激活 AND NOT 暂停`（暂停时 IN 断开，ET 冻结）
- 定时器 `R`（复位）= `NOT 该步激活`（离开该步时清零，保证下一件从零开始）
- 所有输出串 `NOT 暂停`（暂停期间执行机构失电）

真机验证：灌装到 3.5s 时暂停，继续后只需再灌 2.5s，不会重新计 6s。

### 4.6 顺序控制的四个经典坑（真机审查出来的）

一个"啤酒传输带"顺序控制程序（36 段 LAD，编译 0 错）实测跑完，发现四个逻辑缺陷。
**编译通过 ≠ 逻辑正确**，这四条都是编译器不报、仿真才看得出来的。

#### 坑 1：把「停止请求」串进步转移条件 → 卡步 + 空跑

```scl
// 错：未满12瓶回步1 时串了 /停止请求
"步1"(S) ⇐ "计数脉冲" · /"计数满12瓶" · /"停止请求"
```

在「等计数」那一步按停止，转移被挡住 → **卡在该步**。而该步传输带还在跑，
后续空瓶经过光电但不会灌装，却被当成成品计数 → 凑满 12 瓶才包装停机。
**结果：停机前多包装一批空瓶。**

正确做法：**停止请求只锁存，不参与步转移**；在「步1」用 `停止请求 · 步1` 触发停机，
或在包装完成那一刻用 `停止请求 · 包装完成` 触发。

#### 坑 2：同一地址既用 `S_Coil` 又用 `Coil` → 后者覆盖前者

```scl
段4:  "计数清零"(S) ⇐ "启动脉冲"          // 想启动时清零
段28: "计数清零"( ) ⇐ "步7" · 包装完成     // 普通线圈，后执行，直接覆盖
```

普通线圈每个扫描周期都写，把前面的置位**立刻冲掉**。TIA 不一定报双线圈警告。

正确做法：**合并成一个并联线圈**，两个触发源并联：

```scl
"计数清零"( ) ⇐ ("步7" · "DB_Timer".T5_Pack.Q · /"暂停" + "启动脉冲")
```

#### 坑 3：`PBox` 放在使能条件之前 → 暂停/停机时吞掉边沿

```scl
// 错：PBox 在 /暂停 之前
Contact("步6") · Contact("二号光电") · PBox("沿_成品") · I_Contact("暂停") → Coil("计数脉冲")
```

暂停时边沿被 `/暂停` 挡掉，但 `PBox` **已经把边沿消费掉了**。恢复后信号一直是 1，
不再产生新边沿 → 这一件**永久漏计**（一批变成 13 件）。

正确做法：**`PBox` 放在所有使能条件之后**，只对「真正要动作的那一下」取沿：

```scl
Contact("步6") · Contact("二号光电") · I_Contact("暂停") · PBox("沿_成品") → Coil("计数脉冲")
```

#### 坑 4：用 `TON` 做暂停 → 计时清零（见 §4.5）

顺带一提：这个程序用的是 `TONR`，这一条它做对了。

### 4.7 编辑已有块：`.s7dcl` 往返会丢网络标题和注释

**实测踩到的坑**：把块 `ExportAsDocuments` 导出成 `.s7dcl` → 改几行 → `ImportFromDocuments(Override)`
导回去，编译 0 错，但**36 段的网络标题和中文注释全部变成空**。

原因：

| 载体 | 带网络标题/注释吗 |
|---|---|
| `.s7dcl` | ❌ **不带**（导出时就没有，导入自然也没有） |
| `.xml`（SimaticML） | ✅ 带（`<ObjectList>` 里的 `MultilingualText`，CompositionName = `Title` / `Comment`） |

所以：

- **只改逻辑、不在乎注释** → 用 `.s7dcl`，快、语法简单
- **要保住标题/注释** → 必须走 `.xml`：导出 XML → 改 `<NetworkSource>` 里的逻辑 →
  保留 `<ObjectList>` 原样 → `ImportBlock` 导回
- **注释已经丢了想补回来** → 编辑 XML 里每个 `<MultilingualText>` 的 `<Text />`，再 `ImportBlock` 导入

### 4.8 变量命名用中文，别用英文缩写

工控现场看梯形图，`"启动按钮"` 一眼就懂，`"SB1_Start"` 得查表。默认就用中文符号名：

| 类型 | 推荐 | 不推荐 |
|---|---|---|
| 按钮 | `启动按钮` / `暂停按钮` / `停止按钮` | `SB1_Start` |
| 光电 | `一号光电_空瓶到位` / `二号光电_成品` | `B1_BottleIn` |
| 电机 | `传输带电机` / `包装电机` | `KM1_Conveyor` |
| 阀 | `灌酒电磁阀` / `压盖电磁阀` | `YV1_FillValve` |
| 步位 | `步1`…`步7` | `St1`…`St7` |
| 边沿位 | `沿_启动` / `沿_成品` | `EdgeStart` |

改名的做法：`ExportPlcTagTable` 导出变量表 XML → 改 `<Name>` 和 `<Text>`（注释）→
`ImportPlcTagTable` 导回；同时把程序块 XML 里的 `<Component Name="旧名" />` 全部替换 → `ImportBlock` 导回。
**两边必须同时改**，否则编译报未定义变量。

## 5. 硬件与设备

### 5.1 新增设备只能走 AML

桥接层没有 `CreateWithItem`，真正能建出设备与模块的是 **CAx(AML) 导入**。`[A]`

- 有模板：`add_device_from_template`
- 没模板：先从含目标机型的工程 `export_project_aml` 导出，再改 IP/子网掩码后导入
- 导入前可改写 PROFINET IP 与子网掩码

### 5.2 已存在设备改 IP —— Openness 不支持

对**已存在**设备直接改写 IP 不被 Openness 支持，返回 **rc=20**。只能随 AML 导入写入。`[A]`
必须如实告诉用户，不要反复试。

### 5.3 硬件属性：先读真实属性名，别硬编码

- 先用 `get_hardware_inventory` 读目标对象**真实属性名**，再 `set_hardware_properties` 写入 `[A]`
- 写入必须**离线**、显式确认、写后回读 + 硬件编译
- 不同 CPU/固件的 HSC 属性名**不得硬编码** `[A]`
- 若返回 `hsc_properties_reachable=false` 或 `filter_matched_nothing`，说明该参数不在桥接层暴露的属性里（**可达性边界，不是名字映射问题**）——如实告知需在 TIA 里人工组态，不要反复猜 `[A]`

## 6. 在线与下载

- **`target_interface` 在 V15–V20 填 PLC 的 IP**；V21 才填目标接口名。`[A]`
- 调用 `go_online` 时若用户没指定连接方式，**让用户选仿真还是物理接口**；物理接口的网卡名必须由用户填。`[A]`
- 工具返回 `needs_input` 时，先问用户再重试，不要猜。`[A]`
- 下载是破坏性操作，参数（网卡类型、网卡名、目标接口）必须用户明确给出。

## 7. WinCC Unified 在 V20 的边界（差异最大的一块）

| | V21 | **V20** |
|---|---|---|
| 连接形态 | integrated（集成） | **non-integrated**，`Partner/Station/Node` **只读** `[B]` |
| 符号绑定 | `plcTag = Conveyor.Start` 可用 | **不可用**，必须用绝对地址 `[B]` |
| 绑定写法 | 符号或绝对地址 | `address: %DB100.DBX0.0`，且目标 DB 必须**非优化** `[B]` |
| 替代方案 | — | 让用户在 TIA GUI 里手工建集成连接，再把连接名传给工具 `[B]` |

其它 Unified 硬约束（V20/V21 通用）`[B]`：

- PLC 侧的 tag / DB 成员**必须先存在**，否则 HMI 绑定会**静默丢弃**——先建 PLC 侧，再建 HMI
- 一个连接、一个驱动：驱动由 CPU `TypeIdentifier` 自动选，不要手写驱动名，也不要让两个变量表指向不同连接名
- 采集周期：交互控件 100ms，只读显示 1s，别全留默认
- 画面尺寸按面板原生分辨率（Unified PC 默认 800×480），否则被裁切

## 8. 版本共存

本机 V16 + V20 同时装：

- **必须显式指定版本**，不要让工具"自动猜" `[A]`
- A 的 `connect_tia(version=...)` 要显式传 `V20`
- B 的运行时按版本分目录：`runtime/v20` / `runtime/v21`，启动参数 `--tia-major-version 20`
- 多版本同时运行时，新建工程前先用 `list_running_tia_portals` 确认当前启动的是哪个版本 `[A]`

## 9. 排错顺序（照这个走，别乱试）

```
1. check_openness_prerequisites / Bootstrap   → 环境对不对、Openness 组在不在
2. detect_tia_installations / d_versions       → 装的到底是不是 V20、Update 几
3. list_running_tia_portals                    → TIA 开没开、开的是哪个版本
4. connect_tia(version="V20") / Connect        → 连上
5. 首次连接弹 Openness 授权窗 → 让用户人工点"是，全部接受"，绝不代点
6. 读工程树，拿真实路径和块名
7. 干活 → 编译 0 错 → 保存
```

## 10. 不要做的事

- ❌ 不要手写 LAD 的 SimaticML FlgNet XML（V20/V21 都一样，UId 进制与连线极易报错）
- ❌ 不要在 `.s7dcl` 含标题/中文注释时漏掉配对的 `.s7res`
- ❌ 不要指望 `GenerateBlocksFromExternalSource` 覆盖已有块（它不覆盖，要 Override 或先删块）
- ❌ 不要对已存在设备改 IP（rc=20，只能随 AML 导入）
- ❌ 不要硬编码 HSC 属性名，不要反复猜不可达的属性
- ❌ 不要自动点 UAC / Openness 授权窗
- ❌ 不要用符号绑定去连 V20 的 Unified HMI（non-integrated，只能用绝对地址 + 非优化 DB）
- ❌ 不要在 HMI 绑定前就建 HMI 变量（PLC 侧不存在会静默丢弃）
- ❌ 不要把 `.scl` 的中文注释不加 BOM 就导进去
- ❌ 不要在在线状态下写块或改硬件（必须先离线）

## 11. 来源说明

- `[A]` tia-portal-mcp v1.4.1 的 MCP `instructions` 字段（1844 字，随 `initialize` 下发）
- `[B]` TIA_MCP_Delivery v2.7.8 的 `skill/SKILL.md`（1152 行）与 `docs/tool-capability-matrix.md`
- `[实测]` 在本机 `D:\TIA_Portal_v20` 上核对目录结构、程序集名与版本号

本文件不覆盖 V21 的差异（V21 请直接看 B 的 SKILL.md），也不替代西门子官方文档。
