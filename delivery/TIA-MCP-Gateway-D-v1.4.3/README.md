# TIA MCP 网关 D v1.4.3

把三套西门子 TIA Portal 的 MCP 服务器收进**一个入口**，让 AI（opencode / DeepSeek Harness / WorkBuddy）
能读写 PLC 程序、编译、下载。

**这个包是完整的**：网关 + 两套上游运行时（V20/V21 都在）+ 四个 skill + 配置模板，解压即用。

支持 **TIA Portal V15–V21.1**（V15–V19 只能走上游 A；V20/V21 走 B，功能最全）。
V20 和 V21 有几处实质差异（下载参数、HMI 连接方式），见 `快速开始.md` 的「V20 和 V21 的差异」。

---

## 三十秒看懂

```
你用的 AI 客户端（opencode / DSH / WorkBuddy）
        │  stdio (MCP 协议)
        ▼
   ┌─────────┐
   │  网关 D  │  15 个 d_* 工具 + d_call 全量透传
   └────┬────┘
        ├── 上游 A   HTTP 127.0.0.1:8000   47 个工具   V15–V21.1
        └── 上游 B   stdio 子进程           238 个工具  V20/V21
```

**为什么要网关**：A 和 B 都能连博途，但**同一时刻只能有一个连上**（两个进程同时 attach 会抢 Openness
会话，报随机 rc 错误）。网关把这层收进代码：切上游自动断开上一个、进程生命周期自己管、跨进程锁
防止多个 AI 客户端互抢。

---

## 包里有什么

| 目录 | 内容 | 要不要动 |
|---|---|---|
| `gateway/` | 网关主程序 + Node 运行时 + 全部文档 | 不改 |
| `upstreams/a/` | 上游 A（tia-portal-mcp v1.4.1，47 工具，V15–V21.1） | 不改 |
| `upstreams/b/` | 上游 B（TIA_MCP_Delivery v2.7.8，238 工具，V20/V21） | 不改 |
| `skills/` | 四个 AI 规则库（见下） | 安装时自动复制 |
| `configs/` | 三个宿主的配置样例（参考） | 参考 |
| `scripts/` | 启动/停止上游 A 的脚本 | 按需用 |
| `安装.bat` | **双击这个** | 必须运行一次 |

### 四个 skill 是什么

| skill | 作用 |
|---|---|
| `tia-portal-ops` | 三服务器统一操作规则：选型、9 条铁律、工具映射、冲突裁决 |
| `siemens-v20-ops` | V20 实操坑位：LAD Update 4 分水岭、编码 BOM、`.s7dcl`/`.s7res`、HMI 边界 |
| `plc-skill` | 第三方 PLC 工程知识库（状态机、联锁、扫描周期、10 个厂商模块） |

前两个是我写的，第三个来自 [MIGO-OvO/plc-skill](https://github.com/MIGO-OvO/plc-skill)（MIT）。

---

## 怎么装

**前置条件**：

- Windows 10/11
- 装了 **TIA Portal V20 或 V21**（V21 才支持全部功能；V15–V19 只能走上游 A）
- 当前 Windows 用户在 **`Siemens TIA Openness`** 用户组里（不在的话：计算机管理 → 本地用户和组 → 组 → 添加 → 注销重登）

**两步**：

1. **解压到一个固定位置**（别放桌面，路径最好不含空格；以后不要移动，否则西门子会重新弹授权）
2. **双击 `安装.bat`** —— 它会复制 skills、**自动把 MCP 配置写进你机器上已装的 AI 客户端**
   （opencode / WorkBuddy / DSH，改前自动备份），然后做 8 项自检

装完重启你的 AI 客户端就能用。

> **WorkBuddy 用户注意**：它不会自动启用新加的 MCP，需要去「专家技能连接器 → 自定义连接器」
> 里点一次「信任」。opencode 和 DSH 没这一步。

详细步骤和排错见 `快速开始.md`。

---

## 怎么用（给 AI 的话术）

配置好之后，在 AI 里直接说人话就行：

```
用 D 连 V20，看一下工程里有什么
给 PLC_1 写一个电机启停程序，带急停和过载保护
把这段逻辑编译一下，有错就改
```

AI 会自动走 `d_connect` → `d_tree` → `d_write_block` → `d_compile` → `d_finish`。

**收尾动作固定是 `d_finish`**：转离线 → 编译（要求 0 错）→ 保存。编译不过它**拒绝保存**，这是故意的。

---

## 15 个工具速查

| 工具 | 作用 |
|---|---|
| `d_status` | 谁起来了、谁在独占、锁状态 |
| `d_doctor` | 体检：锁 / 上游 / TIA 版本 / Openness 组 / C 是否装 |
| `d_versions` | 已装 TIA 版本 + 各版本可用上游 |
| `d_connect` | 按版本自动路由并连接（传 `.ap20` 路径会推断版本） |
| `d_use` | 强制切上游 |
| `d_list_tools` | 列工具（B 上同时查 lite 与全量） |
| `d_call` | **透传任意上游任意工具**（全量保证） |
| `d_tree` | 工程结构 |
| `d_read_block` | 读块逻辑（LAD 会渲染成可读文本） |
| `d_write_block` | 写块（自动处理编码 + 生成计划 + `confirm` 才落库） |
| `d_compile` / `d_save` / `d_offline` | 编译 / 保存 / 离线 |
| `d_download` | 下载到 PLC（缺网卡参数直接报错，不猜） |
| `d_finish` | 收尾三连 |

---

## 安全设计（重点看这段）

| 机制 | 说明 |
|---|---|
| **写前 dry-run** | `d_write_block` 不给 `confirm:true` 只返回执行计划，不落库 |
| **编译 0 错才保存** | `d_finish` 编译有任何错误就拒绝保存，坏工程不会落盘 |
| **下载必须显式确认** | `d_download` 要求 `confirm:true`，且 A 上还要 `allow_physical_plc:true` 才写实体 PLC |
| **跨进程独占锁** | 多个 AI 客户端同时跑时，只有一个能连 TIA，其余被明确拒绝（不会静默抢） |
| **审计日志** | 每次调用写 `gateway/runtime/d.log`，谁改了什么可回溯 |
| **不猜参数** | 网卡、IP、目标接口必须用户明确给出，缺了直接报错 |

---

## 出问题怎么办

1. 先让 AI 调 `d_doctor` —— 它会告诉你哪一环不对
2. 看 `gateway/runtime/d.log` —— 每次调用的时间/上游/工具/耗时/成败都在里面
3. 常见问题见 `快速开始.md` 末尾的排错表

---

## 版本与来源

- 网关 D：v1.4.3，零依赖 Node，约 1500 行
- 上游 A：tia-portal-mcp v1.4.1（Python / PyInstaller）
- 上游 B：TIA_MCP_Delivery v2.7.8（.NET Framework 4.8，MIT）
- 已在 TIA Portal V20 上验证：连接、读工程树、读写块（SCL / S7DCL / 中文分组）、编译、收尾保存、
  安全门（坏块拒绝保存）、HMI 设备与画面、多进程并发锁
- 自检：`gateway/runtime/node.exe gateway/smoke-test.js`，35 项断言，不需要 TIA 在运行
