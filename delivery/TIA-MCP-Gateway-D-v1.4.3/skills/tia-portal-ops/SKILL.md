---
name: tia-portal-ops
description: 本机三套 TIA Portal MCP（A=v1.4.1 47工具LAD优先 / B=v2.7.8 238工具全量 / C=Czarnak 19工具批量+内容哈希）的统一操作规则、选型决策、工具映射与冲突裁决。任何涉及博途、TIA Portal、S7-1200/1500、WinCC、PLC 程序读写编译下载的任务，先按本规则选服务器、再按铁律执行。
---

# TIA Portal MCP 统一操作规则（三服务器版）

三套 MCP 设计哲学完全不同，规则互相冲突。本文件是**唯一裁决层**：
先按 §2 选服务器，再守 §3 铁律，工具名查 §7，冲突查 §8。

## 0. 现在只有一个入口：网关 D

已接入宿主默认挂载统一网关 **D**（`1+5` 零第三方依赖架构：`<交付包>/gateway/gateway.js` + `gateway/lib/{utils,upstreams,lock,connect,blocks}.js`），
D 内部再路由到 A/B/C。所以实际调用的是 `d_*` 这 15 个工具，不是 §7 表里的原始工具名。

```text
d_status      看上游启动态、独占锁、external 接管标记与 pendingRecovery 告警
d_doctor      体检：锁 / pending_recovery / 端口 8000 / 零进程 TIA 探测 / Openness 组 / B·C（deep:true 才实起 A）
d_versions    零进程探测本机已装 TIA 版本与路由建议（refresh 跳过 60s 缓存）
d_connect     按版本/.apXX 自动路由并连接（OpenProject 前 B 基础设施失败保锁回落 A；fallback:false 可禁）
d_use         强制切上游（自动断开上一个受管会话，不杀外部接管会话）
d_tree        工程结构
d_read_block  读块（B 默认 DescribeBlockLogic；s7dcl 自动查子组；xml 不传 group 仅查根目录；V20 SCL 失败可传 fallback_to_xml:true 回退 xml）
d_write_block 写块（自动处理 BOM，默认只出计划；B .scl confirm:true 走 XML 备份+CompileAndDiagnosePlc+回滚 Saga）
d_compile     编译并返回诊断（B 走 CompileAndDiagnosePlc）
d_save        保存（遇 pending_recovery.json 默认阻断；支持 allow_dirty_save / clear_pending_recovery）
d_offline     转离线
d_download    下载（缺参数直接报错，不猜；A 上 V15–V20 填 PLC IP、V21 填接口名；B 上固定映射 targetIpAddress，V20/V21 一律填 PLC IP）
d_finish      收尾三连（转离线→编译 0 错→保存；遇 pending_recovery.json 默认阻断，支持 allow_dirty_save）
d_call        任意上游任意工具透传（支持 timeoutMs 与 retries 退避）
d_list_tools  查某上游可见工具（B 带 filter 时同步查全量 238 工具）
```

要点：

- **体检零拉起 & 端口 8000 守卫**：`d_doctor` 与 `d_versions` 默认不拉起 A/B（需实起 A 才传 `deep:true`，查外部 MCP `serverInfo` 传 `with_server_info:true`）。端口 8000 被外部进程占用时默认 **fail-closed 拒绝静默接管**；仅当 `d.config.json` 中 `upstreams.a.adoptExternal:true`（或 `reclaimOrphan:true`）时接管并标 `external:true`（断开/退出绝不 `killTree` 外部服务）。
- **连接锁与安全回退**：第二个宿主**无论调哪个上游都会被 `active.lock` 挡住**，提示“另一个网关实例正在占用 TIA”，失锁时立即通过 `onLockLost` 停掉托管子进程。`d_connect` 仅在 `OpenProject` 之前遇到 B 基础设施故障时保锁自动回退 A；一旦进入 `OpenProject` 后严禁强杀切回。
- **读块与 V20 SCL / 子组边界**：`d_read_block(format:'s7dcl')` 在 B 上未传 `group` 时自动检索 `GetBlocksWithHierarchy` 补齐子组；若为 SCL 块导致 V20 `ExportAsDocuments` 抛 `EngineeringNotSupportedException`，默认 fail-closed 报错引导改用 `format:'xml'` 或显式传 `fallback_to_xml:true`（返回体将标 `actual_format:'xml', fallback_used:true`）。注意 B 原生 `ExportBlock(xml)`（`GetBlock`）与 `ExportAsDocuments` 相同，不传 `group` 时只查根目录不递归子组，子组块直接传 `format:'xml'` 时应显式传 `group`。
- **下载 `target_interface` 上游差异**：`d_download` 在 **A** 上透传 `target_interface`（`V15–V20` 填 PLC IP，`V21` 填目标接口名如 `PN/IE_1` / `1 X1`）；在 **B** 上固定映射为 `DownloadToPlc(targetIpAddress)`，因此 **V20 与 V21 一律填 PLC IP**（传接口名会报找不到匹配 IP 路由）。
- **PLCSIM Advanced V7.0 仿真独立于网关 D**：`d_*` 不含虚拟 PLC 启停工具；若在源码仓配合 `plcsim-adv-bridge` 使用（CLI / `--mcp` 13 工具，kebab-case 字符串参数），需有 `--mcp` 或 PLCSIM GUI 常驻持有 `SimulationRuntimeManager`，否则短生命周期 CLI 退出后实例丢失且 `networkMode` 退回 `Softbus`。S7 102（`Sharp7`）读 DB 需 `TCPIPSingleAdapter` + 非优化 DB + `Put/Get`；注意规避宿主机 `192.168.0.0/24` 网卡冲突、APIPA 网卡改静态网段需管理员 UAC 提权，以及 V20 CPU FW V4.0 的默认安全向导（机密组态保护 / 安全通信 / UMAC 访问控制）。
- **写块先出计划 + 事务回滚 + 脏保存阻断**：
  - `d_write_block` 不带 `confirm:true` 只做 Phase 0 只读预检并返回 plan。
  - B 侧 `.scl` 带 `confirm:true` 先校验顶层声明名（默认禁多块源，放行需 `allow_multi_block:true`）、禁 `Software units/` 与 `OB1/Main`，再导出删前 XML 备份（旧块 `IsConsistent=false` 默认 fail-closed，强覆盖需 `allow_unbacked_overwrite:true`），写入后一律走 **`CompileAndDiagnosePlc`**（绝不走 `InvokeService('ICompilable','Compile')`）。目标块报错时默认 `on_compile_error:'rollback'` 自动清残片并 `ImportBlock` 回滚（可设 `'keep'`）。
  - 若连回滚也失败，将写 `pending_recovery.json` 并在 `d_status`/`d_doctor` 暴露 `pendingRecovery`；此时 **`d_save`/`d_finish` 默认拒绝保存**以保住磁盘原 `.apXX` 旧块，直到重写写通该块自动清标，或人工恢复后传 `clear_pending_recovery:true`（强行覆写磁盘才传 `allow_dirty_save:true`）。
- **编码不用你操心**：含中文的 `.scl` 自动加 BOM，`.s7dcl`/`.s7res`/`.xml` 一律加 BOM。
- **B 保持默认 `lite` 档（65 可见工具）**：大多数不在 lite 档的 L2 工具由 `d_call` 自动走 B 的 `CallTool` 转发；但 B 源码 `McpServer.ToolBridge.cs` 会拒绝经 `CallTool` 转发 `InvokeObject`/`InvokeService(..., allowWrite:true)`（`DirectOnly` 工具亦不走 `CallTool`），且正向 `.scl` 覆盖后手动固定块号（`AutoNumber=false`）将重置并由网关提前告警（回滚走 XML 可原生保号）。
- **审计**：每次调用写 `<交付包>/gateway/runtime/d.log`（或 `D_RUNTIME_DIR/d.log`），排查问题先看它。

下面的 §1–§9 是 D 背后三套服务器的差异与裁决，D 已经把它们编码进路由和参数映射；
只有当你用 `d_call` 绕过 D 的统一动词、或者要判断"这件事该落到哪台"时才需要读。

## 1. 三台服务器

| | **A：tia-portal-mcp v1.4.1** | **B：TIA_MCP_Delivery v2.7.8** | **C：Czarnak tia-portal-mcp** |
|---|---|---|---|
| 位置 | `<交付包>/upstreams/a/`（tia-portal-mcp v1.4.1） | `<交付包>/upstreams/b/`（TIA_MCP_Delivery v2.7.8） | GitHub `Czarnak/tia-portal-mcp`（需自建） |
| 实现 | Python / PyInstaller | .NET 4.8 | .NET 10 宿主 + .NET 4.8 worker（双进程） |
| 传输 | HTTP，固定 8000 | stdio 或 HTTP 8765 | stdio（NuGet `TiaMcpServer`） |
| 支持版本 | **V15 – V21.1** | **V20 / V21** | **仅 V21** |
| 工具数 | 47，全量 | 全量 238，默认 lite 65 + `FindTools` | **19**（只读模式 8） |
| 粒度 | 一工具一动作 | 一工具一动作 + 反射取用 | **批量：单工具最多 50 个操作** |
| 写安全 | 显式确认参数 | `dryRun` | **`bind_project` 绑定 + `expectedContentHash` 乐观锁 + `dryRun`** |
| 失败语义 | 单次调用失败 | 逐元素收集，关键步抛错 | **首错即停，绝不回滚** |
| 已接入 | 统一经网关 D 接入（`install.js` 支持 10 类主流客户端） | 统一经网关 D 接入（同左） | 默认未启用（需 V21 + 安装 C 后改 `d.config.json`） |
| 独有 | 紧凑 LAD + 中文网络注释 | HMI 设计、`ScaffoldProject` 一键建工程、OPC UA、报警 | 跨引用诊断、网络设备开通、多用户/项目服务器、VCI 独立工作区 |

**若当前机器未安装 TIA V21 且未部署 C（例如仅有 V16 / V20），实际只有 A、B 可用。** 仅当安装 TIA V21、完成 `dotnet tool install -g TiaMcpServer` 并在 `d.config.json` 启用 C 后才可路由到 C。

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
- `GenerateBlocksFromExternalSource` **不覆盖**已有块（只更新时间戳，代码仍是旧的）→ 更新块要用
  `ImportFromDocuments(importOption: 'Override')`，或先删块再生成（走网关 `d_write_block(format:'scl', confirm:true)` 时，网关已内置删前 XML 备份 + 删除重建 + `CompileAndDiagnosePlc` 编译门 + 失败自动 XML 回滚保护）

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
| 下载 | `download_to_plc`（V15–V20 `target_interface` 填 PLC IP；V21 填接口名） | `CheckDownloadReadiness` → `DownloadToPlc`（`targetIpAddress` 始终填 PLC IP） | ❌ 无（无 PLC 启停） |
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
