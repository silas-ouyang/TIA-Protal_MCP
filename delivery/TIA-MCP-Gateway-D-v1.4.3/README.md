# TIA MCP 网关 D v1.4.3

把三套西门子 TIA Portal 的 MCP 服务器收进**一个入口**，让 AI（Antigravity / Claude Desktop / Claude Code / Cursor / VS Code / Codex / Gemini CLI / WorkBuddy / opencode / DeepSeek Harness）能读写 PLC 程序、编译、下载。

**这个包是完整的**：`1+5` 模块化网关 + 两套上游运行时（V20/V21 都在）+ 六个 skill + 10 宿主全量配置安装器，解压即用。

支持 **TIA Portal V15–V21.1**（V15–V19 只能走上游 A；V20/V21 优先走 B，默认 `lite` 65 工具 + `CallTool` 透传全量 238 工具）。
V20 和 V21 有几处实质差异（下载参数、HMI 连接方式），见 `快速开始.md` 的「V20 和 V21 的差异」。

---

## 三十秒看懂

```text
你用的 AI 客户端（10 类主流宿主均支持）
        │  stdio (MCP 协议)
        ▼
   ┌──────────┐
   │  网关 D  │  15 个 d_* 工具 + d_call 全量透传（1+5 零第三方依赖模块）
   └────┬─────┘
        ├── 上游 A   HTTP 127.0.0.1:8000   47 个工具            V15–V21.1
        └── 上游 B   stdio 子进程           238 工具（默认 lite 65） V20/V21
```

**为什么要网关**：A 和 B 都能连博途，但**同一时刻只能有一个连上**（两个进程同时 attach 会抢 Openness 会话，报随机 rc 错误）。网关把这层收进代码：切上游自动断开上一个、进程生命周期与 8000 端口守卫自己管、跨进程锁防止多个 AI 客户端互抢，并在写入 SCL 块时提供备份与编译失败回滚保护。

---

## 包里有什么

| 目录 | 内容 | 要不要动 |
|---|---|---|
| `gateway/` | `gateway.js` + `lib/{utils,upstreams,lock,connect,blocks}.js` + Node 运行时 + `smoke-test.js` + `d.config.json` | 一般不改（需外部接管 8000 时可配 `adoptExternal`） |
| `upstreams/a/` | 上游 A（tia-portal-mcp v1.4.1，47 工具，V15–V21.1） | 不改 |
| `upstreams/b/` | 上游 B（TIA_MCP_Delivery v2.7.8，238 工具 / lite 65，V20/V21，含 C# 源码） | 不改 |
| `skills/` | 六个 AI 规则库（见下） | 安装时自动复制 |
| `configs/` | 配置样例说明（实际模板运行安装脚本后生成到 `生成的配置/`） | 参考 |
| `scripts/` | 启动/停止上游 A 的脚本 | 按需用 |
| `安装.bat` | **双击这个**（调用 `install.js`，支持 CLI 参数） | 必须运行一次 |

### 六个 skill 是什么

| skill | 作用 |
|---|---|
| `tia-portal-ops` | 三服务器统一操作规则：选型、9 条铁律、工具映射、冲突裁决、网关 D 事务契约 |
| `siemens-v20-ops` | V20 实操坑位：LAD Update 4 分水岭、编码 BOM、`.s7dcl`/`.s7res`、SCL 读取限制、HMI 边界 |
| `siemens-s7-1200-1500-programming` | SIMATIC S7-1200/1500 编程风格指南（V2.0，78 条规则）、编程指南（V1.6）与 LGF 函数库规范 |
| `plc-skill` | 第三方 PLC 工程知识库（状态机、联锁、扫描周期、10 个厂商模块） |
| `tia-golden-blocks` | 15 个 TIA V20 实测 `0E/0W` 黄金标准块、配套 `UDT_HMI_*` 与 Factory I/O 7 大场景顺控蓝本 |
| `tia-spec-first` | 复杂/多块任务"强模型出规格书 → 弱模型单块实施 → 强模型审查"三段低成本工作流 |

除 `plc-skill` 来自 [MIGO-OvO/plc-skill](https://github.com/MIGO-OvO/plc-skill)（MIT）外，其余五个为本项目配套/整理。

---

## 怎么装

**前置条件**：

- Windows 10/11（64 位）
- 装了 **TIA Portal V20 或 V21**（V21 才支持全部功能；V15–V19 只能走上游 A）
- 当前 Windows 用户在 **`Siemens TIA Openness`** 用户组里（不在的话：计算机管理 → 本地用户和组 → 组 → 添加 → 注销重登）

**两步**：

1. **解压到一个固定位置**（别放桌面，路径最好不含空格；以后不要移动，否则西门子会重新弹授权）
2. **双击 `安装.bat`** —— 它会自动把 `skills/` 同步到 `~/.agents/skills/` 与已检测宿主的 skills 目录（含 Antigravity `~/.gemini/config/skills/`、WorkBuddy `~/.workbuddy-ai/skills/`、Claude Code `~/.claude/skills/`），**安全探测并幂等合并**本机已装的 10 类 AI 客户端配置（Antigravity / Gemini CLI / Claude Desktop / Claude Code / Cursor / VS Code / Codex / WorkBuddy / opencode / DeepSeek Harness）：
   - 防父目录误报，保留你原有的其他 MCP server 与 `env`；
   - 路径未变化跳过且不产生多余 `.bak-*` 备份；路径变化时先备份 `.bak-时间戳` 再原子写入；
   - 在 `生成的配置/` 输出全部 10 份客户端模板与 `使用说明.txt`，并执行 11 项包完整性自检。
   - 高级命令行选项：`gateway\runtime\node.exe install.js [--list] [--dry-run] [--configs-only] [--host <id[,id]>] [--update] [--out <dir>]`。

装完重启你的 AI 客户端就能用。

> **WorkBuddy 用户注意**：它不会自动启用新加的 MCP，需要去「专家技能连接器 → 自定义连接器」里点一次「信任」。
> **Antigravity 与 Gemini CLI 路径区别**：Antigravity 活跃配置在 `%USERPROFILE%\.gemini\config\mcp_config.json`，Gemini CLI 在 `%USERPROFILE%\.gemini\settings.json`，安装器已严格区分不会误写。

详细步骤和排错见 `快速开始.md`。

---

## 怎么用（给 AI 的话术）

配置好之后，在 AI 里直接说人话就行：

```text
用 D 连 V20，看一下工程里有什么
给 PLC_1 写一个电机启停程序，带急停和过载保护
把这段逻辑编译一下，有错就改
```

AI 会自动走 `d_connect` → `d_tree` → `d_write_block` → `d_compile` → `d_finish`。

**收尾动作固定是 `d_finish`**：转离线 → 编译（要求 0 错）→ 保存。编译不过或存在未清除的 `pending_recovery.json` 时**拒绝保存**，这是故意的。

---

## 15 个工具速查

| 工具 | 作用 |
|---|---|
| `d_status` | 谁起来了、谁在独占、锁状态、`external` 接管态与 `pendingRecovery` 恢复阻塞告警 |
| `d_doctor` | 体检：独占锁 / `pending-recovery` / 端口 8000 守卫 / 零进程注册表探测 TIA 版本 / Openness 组 / B·C 运行时。默认快速零拉起，传 `deep:true` 才实起 A（支持 `refresh` / `with_server_info` / `clear_pending_recovery`） |
| `d_versions` | 零进程探测已装 TIA 版本与各版本可用上游（支持 `refresh` 跳过 60s 缓存） |
| `d_connect` | 按版本或 `.apXX` 路径自动路由并连接；B 在进入 `OpenProject` 前遇基础设施失败自动保锁回落 A（支持 `fallback:false` 关闭） |
| `d_use` | 强制切上游（自动断开上一个受管会话，不误杀外部接管会话） |
| `d_list_tools` | 列工具（B 上带 `filter` 时同时查 lite 65 与全量 238 个工具） |
| `d_call` | **透传任意上游任意工具**（B 不在 lite 档的工具自动走 `CallTool` 转发，支持 `retries` 指数退避；注：lite 下 `InvokeObject/InvokeService(allowWrite:true)` 仍受 B 的 `ToolBridge` 拦截） |
| `d_tree` | 工程结构 |
| `d_read_block` | 读块逻辑（B 默认可读梯形图骨架；传 `format:'s7dcl'` 自动解析子组，遇 V20 SCL 不支持 `s7dcl` 时默认精准报错引导改用 `xml` 或传 `fallback_to_xml:true`；注意原生 `ExportBlock(xml)` 不传 `group` 同样只查根目录，子组块读 `xml` 建议显式传 `group`） |
| `d_write_block` | 写块（自动加 BOM + 默认 dry-run 计划；B 侧 `.scl` `confirm:true` 走声明校验、删前 XML 备份、`CompileAndDiagnosePlc` 编译门与失败自动 XML 回滚；支持 `group`/`res_content`/`allow_ob_source`/`allow_unbacked_overwrite`/`allow_multi_block`/`on_compile_error`） |
| `d_compile` / `d_save` / `d_offline` | 编译 / 保存（受 `pending_recovery.json` 阻断保护，支持 `allow_dirty_save` 与 `clear_pending_recovery`） / 离线 |
| `d_download` | 下载到 PLC（缺网卡/IP 参数直接报错，不猜；A 上 `target_interface` 填 PLC IP(V15–V20) 或接口名(V21，如 `PN/IE_1` / `1 X1`)，B 上固定映射 `targetIpAddress`、V20/V21 一律填 PLC IP；A 需 `allow_physical_plc:true` 才写真机） |
| `d_finish` | 收尾三连（转离线 → 编译 0 错 → 保存；遇 `pending_recovery.json` 默认阻断保存） |

---

## 安全设计（重点看这段）

| 机制 | 说明 |
|---|---|
| **写前 dry-run 与事务回滚** | `d_write_block` 不给 `confirm:true` 只返回计划；B 侧 `.scl` 实写先备份 XML 再改块，过 `CompileAndDiagnosePlc` 编译门，失败自动回滚 XML；连回滚都失败则写 `pending_recovery.json` 锁死保存 |
| **编译 0 错与脏保存阻断** | `d_finish` 编译有错拒绝保存；`d_save` / `d_finish` 检测到 `pending_recovery.json` 默认拒绝覆盖磁盘原工程 |
| **端口 8000 守卫与安全回退** | 启动 A 前精准识别占用者 PID/指纹，外部 MCP 默认 fail-closed 拒绝静默接管；`B -> A` 回退严格限定于 `OpenProject` 之前，并保持 `active.lock` 不丢失 |
| **下载必须显式确认** | `d_download` 要求 `confirm:true`，且 A 上还要 `allow_physical_plc:true` 才写实体 PLC |
| **跨进程独占锁与审计** | 多个 AI 客户端同时跑时只允许一个持有 `active.lock`（丢失时立即停掉本进程托管子进程）；每次调用写 `gateway/runtime/d.log` |
| **不猜参数** | 网卡、IP、目标接口必须用户明确给出，缺了直接报错 |

---

## PLCSIM Advanced V7.0 与主机环境注意

- **PLCSIM 生命周期独立于网关 D**：网关 D 的 `d_*` 工具不管理 PLCSIM 虚拟 CPU 实例；若在完整源码仓配套使用 `plcsim-adv-bridge`（CLI / `--mcp` 13 工具，参数为 kebab-case 字符串），注意短生命周期 CLI 退出后若无常驻持有者（`--mcp` 或 PLCSIM GUI），实例不会保留且 `networkMode` 会回退为 `Softbus`。通过 S7 端口 102（`Sharp7`）读 DB 需满足：**`TCPIPSingleAdapter` 模式**（非 `Softbus`）、目标 DB 关闭优化访问（**非优化 DB**）并启用 `Put/Get`。
- **Windows 网卡网段冲突与 UAC**：若宿主机其他网卡已占用 `192.168.0.0/24`，TIA 默认 CPU IP `192.168.0.1` 会出现"PN-DCP 可发现但 TCP 连接报不兼容"；`Siemens PLCSIM Virtual Ethernet Adapter` 默认为 APIPA `169.254.x.x/16`，使用 `netsh` 配置独立冷门网段（如 `192.168.250.1/24`）需**管理员权限终端**（受 UAC 限制）。
- **TIA V20 CPU 固件 V4.0 安全向导与白名单**：V20 中如 `6ES7 513-1AM03-0AB0` 默认固件 `V4.0` 会默认开启「保护机密 PLC 组态数据」「仅支持安全 PG/PC 和 HMI 通信」与访问控制（UMAC），仅调 `SetPutGetAccess(true)` 不足以放行。Openness 注册表白名单仅授权 `TiaMcpServer.exe` 与 `tia-portal-mcp.exe`。

---

## 出问题怎么办

1. 先让 AI 调 `d_doctor` —— 快速零拉起体检会告诉你哪一环不对（需实起 A 时再传 `deep:true`）
2. 看 `gateway/runtime/d.log` —— 每次调用的时间/上游/工具/耗时/成败都在里面
3. 常见问题见 `快速开始.md` 末尾的排错表

---

## 版本与来源

- 网关 D：v1.4.3，零第三方依赖 Node（`1+5` 模块化结构：`gateway.js` 薄入口 + `gateway/lib/{utils,upstreams,lock,connect,blocks}.js`）
- 上游 A：tia-portal-mcp v1.4.1（Python / PyInstaller）
- 上游 B：TIA_MCP_Delivery v2.7.8（.NET Framework 4.8，MIT；含 `upstreams/b/tools` C# 源码参考）
- 已在 TIA Portal V20 上验证：连接、读工程树、读写块（SCL / S7DCL / 中文分组）、编译、收尾保存、安全门（坏块拒绝保存）、HMI 设备与画面、多进程并发锁
- 自检：隔离 `D_RUNTIME_DIR` 运行 `gateway/runtime/node.exe gateway/smoke-test.js`，覆盖 `1+5` 纯函数单测、`F1–F14` Mock 故障注入矩阵与离线 B 检查（不依赖 TIA 在运行，具体断言数量与通过情况以脚本末尾实测输出为准）
