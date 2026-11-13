# TIA Gateway D

把 A / B 两套（预留 C）TIA Portal MCP 收进**一个** stdio MCP 服务器。宿主只认 D，D 内部按版本、工程后缀与环境能力路由。

```text
AI 客户端（Antigravity / Claude Desktop / Claude Code / Cursor / VS Code / Codex / Gemini CLI / WorkBuddy / opencode / DeepSeek Harness）
        │  stdio (MCP)
        ▼
   ┌──────────┐
   │    D     │  15 个 d_* 工具 + d_call 全量透传
   └────┬─────┘
        ├── A  tia-portal-mcp v1.4.1   HTTP 127.0.0.1:8000   47 工具            V15–V21.1
        └── B  TIA_MCP_Delivery v2.7.8 stdio 子进程           238 工具(lite 65)   V20/V21
```

零第三方 npm 依赖，仅需 Node 18+（包内自带 `runtime/node.exe`）。

## 为什么要有 D

三套 MCP 各管一段：A 会写紧凑 LAD、B 能建整套工程和 HMI、C 有内容哈希和跨引用。但它们是**互斥**的——同一时刻只能有一个进程 attach TIA Openness，否则抢会话报随机 rc 错误。

D 把会话与事务护栏收进代码：切上游自动断开上一个受管会话、跨进程锁与失锁停机、8000 端口指纹守卫、SCL 删前备份与编译门回滚、收尾防脏保存，以及 UTF-8/BOM 编码坑兜底。

## 模块结构（`1+5` 零第三方依赖）

- `gateway.js`：薄入口，唯一持有 `{ active, upstreams, callQueue }`、`TOOLS` schema、`statusSnapshot`、`ensureUpstream` / `deactivate` / `setActive` / `callAnyTool`、轻处理器及 stdio 主循环，`module.exports` 透传纯函数供单测。
- `lib/utils.js`：无状态常量与纯函数（`slug`、`stripRoot`、`writeBlockFile`、`compileHasErrors`、`normalizeBlockTarget`、`versionFromPath` 等）。
- `lib/upstreams.js`：`Upstream` / `HttpUpstream`（A）/ `StdioUpstream`（B/C）、`killTree` 与 `probePort8000` 端口指纹探测。
- `lib/lock.js`：`createLockManager`，管理 `active.lock`、`d.log` 审计与 `pending_recovery.json` 恢复挂起标记。
- `lib/connect.js`：`probeLocalTia`（单次 PowerShell 零进程采集注册表/PublicAPI/Portal/Openness 组，缓存 60s）、`routeCandidates`、`handleDoctor`、`handleVersions`、`handleConnect`。
- `lib/blocks.js`：`handleReadBlock`、`handleWriteBlock`（Phase 0 预检 + XML 备份 + `CompileAndDiagnosePlc` 编译门 + 自动 XML 回滚 Saga）、`runPlan` 与纯函数导出。

## 工具面（15 个）

| 工具 | 作用与关键参数 |
|---|---|
| `d_status` | 查看启动状态、独占锁、外部接管标记（`external`）、`pendingRecovery` 与版本信息 |
| `d_doctor` | 一次性体检（`exclusive-lock`、`pending-recovery`、`port-8000`、`tia-installed`、`openness-group`、`running-portals`、`upstream-a/b/c`）。默认快速零拉起；支持 `deep`（实起 A）、`refresh`（跳过 60s 缓存）、`with_server_info`（探 MCP `serverInfo` 并配对 `DELETE` 清会话）、`clear_pending_recovery` |
| `d_versions` | 零进程探测已装 TIA 版本与路由建议；支持 `refresh` |
| `d_use` | 强制切到 `a` / `b` / `c`，自动断开上一个受管会话 |
| `d_list_tools` | 列出某上游的可见工具；B 上带 `filter` 时同时调 `FindTools` 查全量 238 工具 |
| `d_call` | **透传任意上游工具**；B 不在 lite 档的工具自动走 `CallTool` 转发；支持 `timeoutMs`、`retries` 指数退避 |
| `d_connect` | 按 `version` 或 `project_file_path`（`.apXX`）自动路由并连接；B 在进入 `OpenProject` 前遇基础设施失败自动保锁回落 A（传 `fallback: false` 可禁用）；支持 `plc_name` |
| `d_tree` | 读工程结构（`get_plc_inventory` / `GetProjectTree` / `browse_project_tree`） |
| `d_read_block` | 读块逻辑：`block`、`group`、`plc`、`format`、`fallback_to_xml`。B 默认走 `DescribeBlockLogic`；传 `format: "s7dcl"` 时自动用 `GetBlocksWithHierarchy` 定位子组并导回，遇 V20 SCL 抛 `EngineeringNotSupportedException` 默认报错引导改用 `xml`（或传 `fallback_to_xml: true` 自动回退 `ExportBlock`） |
| `d_write_block` | 写块：支持 `block`、`format`（`scl`/`s7dcl`/`xml`/`lad-spec`）、`content`/`source_path`、`res_content`、`plc`、`group`、`overwrite`、`allow_ob_source`、`allow_unbacked_overwrite`、`allow_multi_block`、`on_compile_error`（`rollback` \| `keep`）、`confirm`。默认 dry-run；B 侧 `.scl` `confirm: true` 走全事务备份与回滚 |
| `d_compile` | 编译并返回诊断（A: `compile_plc` / B: `CompileAndDiagnosePlc` / C: `compile_check`）；`plc` |
| `d_save` | 保存工程；存在 `pending_recovery.json` 时默认阻断，支持 `allow_dirty_save` 与 `clear_pending_recovery` |
| `d_offline` | 转离线（`plc`） |
| `d_download` | 下载到 PLC（缺网卡/IP 直接报错；A 需 `allow_physical_plc: true`；支持 `allow_cpu_stop`、`start_cpu_after_download`、`confirm`） |
| `d_finish` | 收尾三连：转离线 → 编译（`requireZeroErrors` 默认 `true`）→ 保存；存在 `pending_recovery.json` 时默认阻断保存（支持 `allow_dirty_save`） |

`d_call` 是全功能的保证，B 维持默认 **`lite` 档（65 个可见工具）**：不在 lite 档的绝大多数 L2 工具会通过 B 的 `CallTool` 转发；但 B 源码 `McpServer.ToolBridge.cs` 会拒绝经 `CallTool` 转发 `InvokeObject`/`InvokeService(..., allowWrite: true)`，且编译门始终使用 `lite` 档内置的 `CompileAndDiagnosePlc`。

## 编码由网关兜住

`.scl` 含中文不加 BOM 会被博途按 GBK 读成乱码 + 假语法错误。`d_write_block` 按规则自动处理：

| 格式 | 规则 |
|---|---|
| `.scl` 纯 ASCII | 不加 BOM |
| `.scl` 含中文 | 自动加 BOM（`utf-8-sig`） |
| `.s7dcl` / `.s7res` / `.xml` | 一律加 BOM |

文件落在 `runtime/inbox/<时间戳>_<块名>/<块名>.<ext>`，块名保留单点（如 `FB_Motor.V2`）并用 `stripRoot()` 剥除 `Program blocks`/`程序块` 根前缀。

## 事务回滚、端口守卫与无人值守保护

- **跨进程独占锁** `runtime/active.lock`：原子创建（`O_EXCL` + Windows `renameSync` 短重试）+ 30 秒心跳续期（5 分钟无心跳判过期）。检测到失锁时，立即通过 `onLockLost` 清空 `active` 并停掉本进程托管的所有子进程。
- **SCL 覆盖事务与 `pending_recovery.json`**：
  1. B 侧 `.scl` `confirm: true` 先做 Phase 0 探测（`GetBlocksWithHierarchy` + `GetBlockInfo` + `DeletePlcBlock(dryRun: true)` + `parseSclDeclarations`），拦截 `Software units/`、`OB1/Main`、声明块名不匹配及多块源；若旧块 `IsConsistent=false` 默认 fail-closed（除非 `allow_unbacked_overwrite: true`）；手动固定块号会给出重置提示。
  2. 删前用 `ExportBlock` 导出 XML 备份至 `runtime/outbox/<stamp>_<slug>_backup/` 并校验 `<Document` 与 `sha256`；写入后用 `CompileAndDiagnosePlc` 验收；失败按 `on_compile_error`（默认 `rollback`）清残片并用备份 XML `ImportBlock` 恢复原组（组不存在先 `CreatePlcBlockGroup`，仍失败则退回根目录 `restored_to_root`）。
  3. 若连回滚都失败或中途失锁，落盘 `runtime/pending_recovery.json`（含 `manualRecovery` 指引），自动阻断 `d_save` 与 `d_finish`，直到同块重新写通自动清理、或人工恢复后传 `clear_pending_recovery: true`。
- **端口 8000 精确区分（`probePort8000`）**：`HttpUpstream` 启动前做 600ms TCP + `netsh excludedportrange` + `Win32_Process`/`netstat` + 无副作用 `POST /mcp` 指纹探测，区分 `free` / `excluded_by_os` / `own_managed` / `own_orphan` / `foreign_mcp` / `foreign_non_mcp`。非 MCP 占用或系统保留端口 `<2s` 早失败；外部 MCP 默认 fail-closed 拒接管，仅配置 `adoptExternal: true` 时接管（标 `external: true`，断开与清理时绝不 `killTree`）。
- **审计日志** `runtime/d.log`：每行 JSON 记录调用、锁失能、回 fallback 与恢复状态；超 5MB 自动轮转 `d.log.1`。

## 配置（`d.config.json`）

- `defaultVersion` — B 的默认运行时版本（`"20"` / `"21"`）
- `upstreams.a` — HTTP 端口 8000 与 `spawn` 配置；可选 `"adoptExternal": true`（接管已有外部 MCP A）或 `"reclaimOrphan": true`
- `upstreams.b.byVersion` — 按版本选 `runtime/v20` 或 `runtime/v21`（保持默认 `lite` 模式，不传 `--profile full`）
- `upstreams.c.installed` — 装好 V21 + C 之后改成 `true`，命令为 `TiaMcpServer`

`runtime/node.exe` 为随包携带的 Node 22，宿主不需要系统装 Node。可通过环境变量 `D_GATEWAY_CONFIG` 与 `D_RUNTIME_DIR` 覆盖配置与运行期目录（便于测试隔离）。

## 宿主接入（10 类客户端）

包根目录 `install.js`（由 `安装.bat` 调用）支持 10 类主流客户端，防父目录误报、剥离 UTF-8 BOM、路径未变不写多余 `.bak-*`、更新时保留原有 `env` 并用临时文件 + `rename` 原子写：

| 宿主 ID | 客户端 | Windows 配置文件路径 | 格式风格 |
|---|---|---|---|
| `antigravity` | Antigravity | `%USERPROFILE%\.gemini\config\mcp_config.json`（兼容旧版 `.gemini\antigravity\mcp_config.json`） | `mcpServers` + 同步 skills |
| `gemini-cli` | Gemini CLI | `%USERPROFILE%\.gemini\settings.json`（仅文件存在时探测） | `mcpServers` |
| `claude-desktop` | Claude Desktop | `%APPDATA%\Claude\claude_desktop_config.json` | `mcpServers` |
| `claude-code` | Claude Code | `%USERPROFILE%\.claude.json`（仅查 `.claude.json` 或 `.claude` 目录） | `mcpServers`（可选同步 skills） |
| `cursor` | Cursor | `%USERPROFILE%\.cursor\mcp.json` | `mcpServers` |
| `vscode` | VS Code | `%APPDATA%\Code\User\mcp.json` | `servers`（含 `type: "stdio"`） |
| `codex` | Codex | `%USERPROFILE%\.codex\config.toml` | TOML `[mcp_servers.tia-gateway]`（单引号字面量 + `startup_timeout_sec = 120`） |
| `workbuddy` | WorkBuddy | `%USERPROFILE%\.workbuddy-ai\mcp.json` | `mcpServers` + 同步 skills（需界面点「信任」） |
| `opencode` | opencode | `%XDG_CONFIG_HOME%\opencode\opencode.json` / `%USERPROFILE%\.config\opencode\opencode.json` | `mcp.servers.tia` |
| `dsh` | DeepSeek Harness | `%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml` | YAML `- insert` (`id: mcp-tia-gateway`) |

常用安装器命令：
```powershell
.\runtime\node.exe ..\install.js --list
.\runtime\node.exe ..\install.js --dry-run
.\runtime\node.exe ..\install.js --host cursor,vscode --update
```

## 测试

```powershell
$env:D_RUNTIME_DIR = "$env:TEMP\tia_smoke"
.\runtime\node.exe .\smoke-test.js
```

全量运行**纯函数单测**（`utils`/`connect`/`blocks`）、**`F1–F14` Mock 故障注入矩阵**（基于临时 `D_RUNTIME_DIR`、临时 `D_GATEWAY_CONFIG` 与 `127.0.0.1:0` Mock StreamableHTTP/Mock B，覆盖事务回滚、`pending_recovery`、`B -> A` 回落、端口 8000 探测、`F12–F14` 编译/s7dcl/多块边界）以及 **B 离线校验**，**不需要 TIA 正在运行且不干扰宿主机 8000 端口**（具体断言总数与通过情况以脚本末尾输出为准）。

## 已知边界

- **C 没装**：本机没有 TIA V21 并完成启用时，`d_call('c', …)` 会明确报"未安装"。
- **不合并语义**：A 的 LAD spec、B 的 S7DCL、C/SimaticML 的 XML 是不同表达，D 不做互转；仅当 `d_read_block` 显式传 `fallback_to_xml: true` 且 B 在 V20 下读 SCL 命中 `EngineeringNotSupportedException` 时回退 `ExportBlock(xml)`。
- **独占是约定**：D 只在切服务器时主动断开受管会话。用户在 TIA 界面里手动开工程，D 不会去抢。
- **写块默认 dry-run**：`d_write_block` 不给 `confirm: true` 只返回计划，避免误写。
