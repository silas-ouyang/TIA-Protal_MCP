---
name: tia-portal-ops
description: 本机三套 TIA Portal MCP（A=v1.4.1 47工具LAD优先 / B=v2.7.8 238工具全量 / C=Czarnak 19工具批量+内容哈希）的统一操作规则、选型决策、工具映射与冲突裁决。任何涉及博途、TIA Portal、S7-1200/1500、WinCC、PLC 程序读写编译下载的任务，先按本规则选服务器、再按铁律执行。
---

# TIA Portal MCP 统一操作规则（三服务器版）

三套 MCP 设计哲学完全不同，规则互相冲突。本文件是**唯一裁决层**：
先按 §2 选服务器，再守 §3 铁律，工具名查 §7，冲突查 §8。

## 0. 现在只有一个入口：网关 D

三个宿主（opencode / DSH / WorkBuddy）都只挂了 **D**（`D:\TIA_MCP\gateway-d\gateway.js`），
D 内部再路由到 A/B/C。所以实际调用的是 `d_*` 这 15 个工具，不是 §7 表里的原始工具名。

```
d_status     看谁起来了、谁在独占
d_doctor     体检：锁 / A / 版本 / Openness 组 / B / C
d_connect    按版本自动路由并连接（最常用）
d_tree       工程结构
d_read_block 读块（B 给梯形图骨架）
d_write_block 写块（自动处理 BOM，默认只出计划）
d_compile / d_save / d_offline / d_finish
d_download   下载（缺参数直接报错，不猜）
d_call       任意上游任意工具的透传 —— 兜底，ABC 有的都能用
d_list_tools 查某上游有哪些工具
d_use        强制切上游
d_versions   看装了哪些 TIA
```

要点：

- **写块先出计划**：`d_write_block` 不带 `confirm:true` 只返回 plan，确认后再重放。
- **编码不用你操心**：含中文的 `.scl` 自动加 BOM，`.s7dcl`/`.xml` 一律加 BOM。
- **B 的 L2 工具**：可见列表只有 65 个，但 `d_call` 会自动走 B 的 `CallTool` 转发，
  不会因为"列表里没有"就失败。
- **跨宿主互斥**：第二个宿主**无论调哪个上游都会被锁挡住**（v1.2 起不再区分上游——两个进程同时连 TIA 一定抢会话）。提示"另一个网关实例正在占用 TIA"。
  这是有意的，别绕，先结束那边会话。
- **审计**：每次调用写 `D:\TIA_MCP\gateway-d\runtime\d.log`，排查问题先看它。

下面的 §1–§9 是 D 背后三套服务器的差异与裁决，D 已经把它们编码进路由和参数映射；
只有当你用 `d_call` 绕过 D 的统一动词、或者要判断"这件事该落到哪台"时才需要读。

## 1. 三台服务器

| | **A：tia-portal-mcp v1.4.1** | **B：TIA_MCP_Delivery v2.7.8** | **C：Czarnak tia-portal-mcp** |
|---|---|---|---|
| 位置 | `E:\BaiduNetdiskDownload\tia-portal-mcp-1.4.1-release\` | `D:\TIA_MCP\TIA_MCP_Delivery_v2.7.8\` | GitHub `Czarnak/tia-portal-mcp`（需自建） |
| 实现 | Python / PyInstaller | .NET 4.8 | .NET 10 宿主 + .NET 4.8 worker（双进程） |
| 传输 | HTTP，固定 8000 | stdio 或 HTTP 8765 | stdio（NuGet `TiaMcpServer`） |
| 支持版本 | **V15 – V21.1** | **V20 / V21** | **仅 V21** |
| 工具数 | 47，全量 | 全量 238，默认 lite 65 + `FindTools` | **19**（只读模式 8） |
| 粒度 | 一工具一动作 | 一工具一动作 + 反射取用 | **批量：单工具最多 50 个操作** |
| 写安全 | 显式确认参数 | `dryRun` | **`bind_project` 绑定 + `expectedContentHash` 乐观锁 + `dryRun`** |
| 失败语义 | 单次调用失败 | 逐元素收集，关键步抛错 | **首错即停，绝不回滚** |
| 已接入 | opencode、DSH | WorkBuddy | 未接入 |
| 独有 | 紧凑 LAD + 中文网络注释 | HMI 设计、`ScaffoldProject` 一键建工程、OPC UA、报警 | 跨引用诊断、网络设备开通、多用户/项目服务器、VCI 独立工作区 |

**本机只装了 V16 + V20，没有 V21 —— C 现在用不了。** 除非将来装 V21，否则实际只有 A、B 可用。

## 2. 选型决策

```
工程版本是 V21？
├─ 否（V15–V20）→ 只能用 A 或 B
│   ├─ 要建整套工程 / 做 HMI / 版本控制 → B
│   ├─ 要 LAD 为主、中文注释、小步改 → A
│   └─ 只读巡检、看块逻辑 → A 的 export 或 B 的 DescribeBlockLogic
└─ 是（V21）→ 三台都能用
    ├─ 批量改几十个块/变量、要并发安全 → C（绑定 + 内容哈希）
    ├─ 建工程 / HMI / 一键脚手架 → B
    └─ 精细 LAD 编辑 → A
```

补充判据：
- **要 HMI、要 `ScaffoldProject`、要 V21 版本控制** → 只有 B、C 有，B 更成熟
- **要跨引用（cross-reference）诊断** → B 有 `GetCrossReferences`（在默认 lite 档里），C 的 `read_cross_references` 支持更细的过滤；两家都能做，C 更细
- **要一次改很多对象且怕覆盖别人的改动** → 只有 C 有内容哈希
- **V16 老工程** → 只有 A

## 3. 铁律（三台通用）

1. **先建立并验证绑定，再动手**
   A：`check_openness_prerequisites` → `connect_tia`；B：`Bootstrap` → `Connect`/`AttachToOpenProject`；C：`bind_project`（未绑定一切读写都 `binding_conflict`）。
2. **绝不自动点 UAC / Openness 授权窗**。弹窗是 Siemens 安全机制，必须提醒用户人工点"是，全部接受"。B 的 `Doctor(fix=true)` 会自动加组并可能弹 UAC —— 先问用户，同意后才用。
3. **改工程前先离线**：`go_offline` / `GoOffline`。在线状态下写块、改硬件一律拒绝。
4. **写前必读，且读同一对象、同一格式**
   C 把这条变成硬约束（`plc_write` 要 `expectedContentHash`，对不上就 `state_changed`）；A/B 上同样执行：读完立刻写，中间不插入其他写操作。
5. **写完必编译**：`compile_plc` / `CompileAndDiagnosePlc` / `compile_check`，必须 0 错。编译不过不许保存、不许下载。
6. **编译过才保存**：`save_project` / `SaveProject`。不保存等于没做。
7. **批量写要小、失败先复核再重试**
   C 明确"首错即停、绝不回滚"；B 也是逐元素收集。所以：批量前先 `dryRun`，批量后必读回复核，失败不要盲目重试同一批。
8. **破坏性操作显式确认**：删除块/设备、下载到 PLC、写在线值、覆盖导入 —— 参数必须用户明确给出，不替用户猜网卡、IP、目标接口、PLC 授权。
9. **路径用绝对路径**，备份导出放服务安装目录之外。路径只从工程树工具拿（`get_plc_inventory` / `GetProjectTree` / `browse_project_tree`），**不准猜、不准编**。

## 4. 写操作的统一流程（三台都照这个走）

```
1. 绑定 / 连接并验证         （A: connect_tia  B: Connect  C: bind_project）
2. 读目标对象，拿现状 + 哈希  （A: export_program_blocks  B: GetBlockInfo/DescribeBlockLogic  C: plc_read）
3. 预览                      （B/C: dryRun=true；A: 无 dryRun，改用小步单对象写）
4. 执行最小改动
5. 编译 0 错
6. 读回复核
7. 保存
```

**同批写操作里不要依赖未确认的中间状态**——C 允许后项使用前项新建的对象，A/B 不保证。

**B 上的额外前置**：导出/读取块（`DescribeBlockLogic`、`ExportAsDocuments`）要求该块当前
`IsConsistent = true`（已编译通过）且处于离线状态，否则直接报错。块不一致时先编译一次再读。

**B 上更新已有块的两个陷阱**（源码确认）：
- `ImportPlcExternalSource` 遇到同名外部源报 `"The name is not unique"` → 先 `DeletePlcExternalSource`
- `GenerateBlocksFromExternalSource` **不覆盖**已有块（只更新时间戳，代码还是旧的）→ 更新块要用
  `ImportFromDocuments(importOption: 'Override')`，或先删块再生成

## 5. 默认语言与代码风格

A 原本强制、B 不强制、C 无立场。**按上游分开裁决**，不要一刀切：

**在 A 上**（有把 JSON spec 编译成 OB1 LAD 的 `write_lad_block`）：

- 用户没指定语言时，默认 **LAD + 中文网络注释 + 全部逻辑进 Main(OB1)**
- 只有逻辑无法在 OB1 里安全/正确/可维护地表达时，才拆 FB/FC/DB 或改 SCL，且必须说明理由

**在 B 上**（按模块化组织，LAD 与 SCL 分工）：

- 工程结构按 **UDT + GlobalDB + FB/FC** 模块化，不强行把所有逻辑塞进 OB1
- **按网络职责分语言**：联锁、限位、指示灯用 LAD；算术标定、状态机、多参数调用用 SCL。B 的 SKILL.md 原话是 "Do not force LAD"
- 写 LAD 时严格用导入态原语（`Contact` / `Coil` / `GT_Contact`，不是导出态的 `Gt`），且必须配 `.s7res`
- 简单块 / DB / UDT / 变量表优先用 `PlcBuildAndImport`，不要手搓文本

**在 C 上**：无语言立场，按用户要求；写块只能走 XML 格式 + 内容哈希。

**三台共通**：变量名、块注释、网络注释一律中文；不得静默改语言，换语言必须说明理由。

## 6. 编码规则（B 的坑，三台都要守）

| 文件类型 | 编码 |
|---|---|
| `.scl` 纯 ASCII | UTF-8 **无 BOM** |
| `.scl` 含中文 | UTF-8 **带 BOM**（`utf-8-sig`），否则按 GBK 读成乱码 + 假语法错误 |
| `.s7dcl` / `.s7res` | UTF-8 **带 BOM** |
| 块/UDT/变量表 XML | UTF-8 **带 BOM** |

含中文的块优先 `.s7dcl` 或 XML，别用 `.scl` 赌编码。

> **写 LAD 别手写 FlgNet XML。** `.s7dcl` 本身就是一套紧凑 DSL（`Contact` / `I_Contact` / `S_Coil` /
> `R_Coil` / `PBox` / `TONR{...}(...)`），机械可预测；XML 要手算 `UId`/`Wire`/`NameCon` 连通图，
> 实测会多花 40 分钟。完整语法表 + 可编译模板见 `siemens-v20-ops` §4.4。

## 7. 工具映射表

| 意图 | A（v1.4.1） | B（v2.7.8） | C（Czarnak） |
|---|---|---|---|
| 环境自检 | `check_openness_prerequisites`、`detect_tia_installations` | `Bootstrap`、`Doctor` | `get_project_status`、`bind_project(list_*)` |
| 绑定 / 连接 | `connect_tia` / `disconnect_tia` | `Connect` / `AttachToOpenProject` | **`bind_project`**（`forceRebind` 切换） |
| 工程树 | `get_plc_inventory` | `GetProjectTree`、`GetSoftwareTree` | `browse_project_tree`（游标分页 v3） |
| 读块逻辑 | `export_program_blocks` | `DescribeBlockLogic` | `plc_read(get_block_content)` |
| 写 LAD | `prepare_lad_block` → `write_lad_block`（`allow_overwrite:true`） | **`.s7dcl` 紧凑 DSL** + `.s7res` → `ImportFromDocuments(importOption:Override)`，语法见 `siemens-v20-ops` §4.4 | `plc_write(update_block_logic, format=xml)` |
| 写 SCL | `write_program_blocks`（带 `allow_overwrite` / `cleanup_external_source`） | `DeletePlcExternalSource` → `ImportPlcExternalSource` → `GenerateBlocksFromExternalSource` → 清理 | `plc_write(update_block_logic, format=source)` |
| 变量表 | `import_plc_tag_tables` | `PlcBuildAndImport(kind=tagtable)` | `plc_write(create_tag/update_tag)` |
| UDT | `import_udts` | `PlcBuildAndImport(kind=udt)` | `plc_write(update_type_content)` |
| 编译 | `compile_plc` | `CompileAndDiagnosePlc` | `compile_check` |
| 下载 | `download_to_plc` | `CheckDownloadReadiness` → `DownloadToPlc` | ❌ 无（无 PLC 启停） |
| 在线 | `go_online`、`compare_plc_to_online` | `GoOnline`、`CompareSoftwareToOnline` | ❌ 无 |
| 硬件 | `add_device_from_aml` | `AddDeviceWithFallback`、`SearchHardwareCatalog` | `network_read` / `network_write` |
| 跨引用 | ❌ | `GetCrossReferences` | `read_cross_references`（独有细化） |
| HMI | ❌ | `ApplyUnifiedHmiScreenDesignJson` | `hmi_read` / `hmi_write` |
| 整套工程 | ❌ 只能建空工程 | **`ScaffoldProject`** | ❌ |
| 版本控制 | ❌ | `CreateVersionControlWorkspace` | `vci_read` / `vci_write` |
| 保存 | `save_project` | `SaveProject` | `save_project` |

B 上先 `FindTools('你要做的事')` 再断言做不到——可见列表只有 65 个，全量 238 个。
C 上先 `bind_project` 再调任何读写——未绑定必失败。

## 8. 冲突裁决表

| 议题 | A | B | C | 统一裁决 |
|---|---|---|---|---|
| 默认语言 | 强制 LAD+中文+OB1 | 不强制，倾向 SCL | 无立场 | 按 §5 **分上游裁决**：A 上默认 LAD+中文+OB1；B 上按 UDT+DB+FB/FC 模块化、LAD 与 SCL 按网络职责分工，不强制 LAD |
| LAD 载体 | `write_lad_block` 紧凑 spec（V20U4+） | S7DCL 文本，禁手写 FlgNet XML | 只有 XML 格式 | **V20/V21 都能用 B 的 S7DCL**（V20 从 20 起就支持 `ImportFromDocuments`）；A 的紧凑 LAD 需 V20U4+；C 只能 XML。三者都不许手写 FlgNet XML |
| 起点 | `check_openness_prerequisites` | `Bootstrap` | `bind_project` | 各按所在服务器走，不跨服务器照搬 |
| 项目绑定 | 无此概念 | 无此概念 | **fail-closed，必须先绑** | 统一心智：先建立并验证会话绑定再操作 |
| 写并发 | 无保护 | 无保护 | **`expectedContentHash` 乐观锁** | 有 C 用 C；A/B 上靠"读完立刻写"降风险 |
| 预览 | 无 dryRun | `dryRun=true` | `dryRun=true` | 有 dryRun 必须先预览；A 上用小步单对象替代 |
| 批量失败 | 单次失败即止 | 逐元素收集 | **首错即停、不回滚** | 批量要小；失败先读回复核再决定重试 |
| Openness 组 | 只告知 | `Doctor(fix=true)` 自动加 | 未明说 | 先问用户，同意才自动修 |
| 权限模式 | 全量 | lite/full 档 | **read-only / read-write / full** | 只读巡检优先 read-only（C）/ lite（B）；写入再升档 |
| 在线/下载 | 支持 | 支持 | **不支持（无 PLC 启停）** | 要下载或在线监控，只能用 A 或 B |

## 9. 收尾检查清单

- [ ] 已离线（若之前在线）
- [ ] 编译 0 错
- [ ] 已保存
- [ ] 批量写后已读回复核
- [ ] 备份/导出在服务目录外，绝对路径
- [ ] 下载/在线类操作已由用户确认目标接口与 PLC

逻辑设计规范（状态机、联锁、扫描周期、I/O 归属）见 `plc-skill`，本文件只管 MCP 操作层。
