# TIA Gateway D

把 A / B 两套（预留 C）TIA Portal MCP 收进**一个** stdio MCP 服务器。宿主只认 D，D 内部按版本和任务路由。

```
AI 客户端（opencode / DSH / WorkBuddy）
        │  stdio (MCP)
        ▼
   ┌─────────┐
   │    D    │  15 个 d_* 工具 + d_call 全量透传
   └────┬────┘
        ├── A  tia-portal-mcp v1.4.1   HTTP 127.0.0.1:8000   47 工具   V15–V21.1
        └── B  TIA_MCP_Delivery v2.7.8 stdio 子进程           238 工具  V20/V21
```

零外部依赖，仅需 Node 18+（包内自带 `runtime/node.exe`）。

## 为什么要有 D

三套 MCP 各管一段：A 会写紧凑 LAD、B 能建整套工程和 HMI、C 有内容哈希和跨引用。但它们是**互斥**的——同一时刻只能有一个进程 attach TIA Openness，否则抢会话报随机 rc 错误。以前靠人记着先断开谁，无人值守时没人记。

D 把这层收进代码：切服务器自动断开上一个、进程生命周期自己管、收尾动作固化成一条命令、编码坑由网关兜住。

## 工具面（15 个）

| 工具 | 作用 |
|---|---|
| `d_status` | 谁启动了、谁在独占、各自工具数与版本 |
| `d_doctor` | 体检：锁、A 能否起、已装版本、Openness 组、B 运行时、C 是否启用 + 修复建议 |
| `d_versions` | 探测已装 TIA 版本 + 每个版本可用的上游 |
| `d_use` | 强制切到 a / b / c，自动断开上一个 |
| `d_list_tools` | 列出某上游的真实工具（支持过滤） |
| `d_call` | **透传任意上游的任意工具** —— ABC 有的 D 全有 |
| `d_connect` | 按版本自动路由并连接（V≤19→A，V20/21→B，V21 且装 C 才用 C）；传工程路径时从 `.ap20` 后缀推断版本 |
| `d_tree` | 读工程结构 |
| `d_read_block` | 读块逻辑（B 给可读梯形图骨架，A 导出并带回内容） |
| `d_write_block` | 写块：自动处理编码 + 生成执行计划，`confirm:true` 才落库；支持 `group`（写进分组，自动 编译→移动）、`overwrite`、`res_content`（配对 .s7res）、`allow_ob_source` |
| `d_compile` | 编译并返回诊断 |
| `d_save` | 保存 |
| `d_offline` | 转离线 |
| `d_download` | 下载到 PLC（缺网卡/接口参数直接报错；A 需 `allow_physical_plc:true` 才写真机） |
| `d_finish` | 收尾三连：离线 → 编译 0 错 → 保存 |

`d_call` 是"全功能"的保证：`d_list_tools` 查名字，`d_call` 执行，参数原样透传。
B 上如果某个工具不在 lite 档（默认只列 65 个），D 会自动改用 B 的 `CallTool` 转发，不会因为"列表里没有"就失败。

## 编码由网关兜住

`.scl` 含中文不加 BOM 会被博途按 GBK 读成乱码 + 假语法错误，这是踩得最多的坑。`d_write_block` 按规则自动处理：

| 格式 | 规则 |
|---|---|
| `.scl` 纯 ASCII | 不加 BOM |
| `.scl` 含中文 | 自动加 BOM（`utf-8-sig`） |
| `.s7dcl` / `.s7res` / `.xml` | 一律加 BOM |

文件落在 `runtime/inbox/<时间戳>_<块名>/<块名>.<ext>`，块名同时用作 B 的外部源名，避免生成一堆时间戳命名的块。

## 无人值守相关

- **跨进程独占锁** `runtime/active.lock`：多个宿主各自跑 D 时，**第二个进程无论用哪个上游都会被挡住**（两个进程同时连 TIA 一定会抢会话）。原子创建（`O_EXCL`）+ 30 秒心跳续期，5 分钟无心跳视为失效。
- **审计日志** `runtime/d.log`：每次调用一行 JSON（时间、pid、上游、工具、耗时、成功与否、错误）。超过 5MB 自动滚到 `d.log.1`。
- **自动恢复**：A 的 HTTP 服务被外部杀掉时，D 会把上游标记为未就绪，下次调用自动重启，不需要人工干预。
- **重试**：`d_call` 支持 `retries` 参数，传输层失败按 1s/2s/4s 指数退避重试。

## 配置

`d.config.json`：

- `defaultVersion` — B 的默认运行时版本（20 / 21）
- `upstreams.a.spawn` — A 的 exe 路径；端口没监听时由网关拉起
- `upstreams.b.byVersion` — B 按版本选 `runtime/v20` 或 `runtime/v21`
- `upstreams.c.installed` — 装好 C 之后改成 `true`，命令改成 `TiaMcpServer`

`runtime/node.exe` 是随包携带的 Node 22，宿主不需要系统装 Node。

## 宿主接入

宿主只需要一条 stdio 命令，路径按你的实际解压位置替换：

```json
{
  "command": "<安装目录>\\gateway\\runtime\\node.exe",
  "args": ["<安装目录>\\gateway\\gateway.js"]
}
```

三个客户端的配置文件位置：

- opencode：`~/.config/opencode/opencode.json` → `mcp.servers.tia`
- DSH：`~/.dsh/profiles/desktop/cordis.patch.yml` → `transport: stdio`
- WorkBuddy：`~/.workbuddy-ai/mcp.json` → `mcpServers.tia-gateway`（需在界面点一次「信任」）

包里的 `install.js` 会自动探测并写入这三处（改前备份），一般不用手动配。

## 测试

```bash
D:\TIA_MCP\gateway-d\runtime\node.exe smoke-test.js
```

**35 项**断言，覆盖协议、路由、编码、计划生成、锁、编译判据、L2 工具可达性、工具失败判定。**不需要 TIA 正在运行**——但 `d_connect` 会真的去连 TIA，测试里不跑。

## 已知边界

- **C 没装**：本机没有 TIA V21，`d_call('c', …)` 会明确报"未安装"。装好 V21 后把 `installed` 改 `true`。
- **不合并语义**：A 的 LAD spec、B 的 S7DCL、C 的 XML 是三种表达，D 不做互转，只做路由和透传。
- **独占是约定**：D 只在切服务器时主动断开。用户在 TIA 界面里手动开工程，D 不会去抢。
- **写块默认 dry-run**：`d_write_block` 不给 `confirm:true` 只返回计划，避免误写。
