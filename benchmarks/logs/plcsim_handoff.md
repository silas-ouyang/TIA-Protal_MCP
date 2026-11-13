# PLCSIM Advanced V7.0 E2E 验证交接文档

**生成时间**: 2026-11-12 11:15 (+08:00)  
**仓库根目录**: `D:\TIA_MCP`  
**红线约束**: 全程严禁触碰 `D:\TIA_Projects\`（测试工程与 PLCSIM 持久目录仅限隔离临时目录）；严禁修改主机原有 `本地连接* 2`；不得触碰/抢占已在 `127.0.0.1:8000` 运行的 `tia-portal-mcp`（PID `9868`）。

---

## 1. 当前环境洁净状态确认

交接前已核实（2026-11-12 11:13）：
- **后台任务**: 无运行中的任务。
- **PLCSIM Advanced V7.0 状态**: `plcsim-adv-bridge.exe status --json` 返回 `isInitialized=true`、`isRuntimeManagerAvailable=true`、`networkMode="Softbus"`、`registeredInstances=[]`（所有临时调试实例如 `DIAG_UI` 已清理）。
- **残留临时目录/进程**: 已清理 `C:\TEM\Temp\UiManualTest`、`C:\TEM\Temp\diag_ui_sim` 及 `C:\TEM\Temp\probe_dev_attrs_*`；无残留 `plcsim-adv-bridge` 或 `TiaMcpServer` 进程。
- **网卡状态（未改动主机配置）**:
  - `本地连接* 2`: `192.168.0.117/24`（`255.255.255.0`）、`192.168.137.1/24`，`DHCP enabled: No`，`InterfaceMetric: 25`（保持原样）。
  - `以太网 4`（`Siemens PLCSIM Virtual Ethernet Adapter`, Index `3`）: `169.254.140.181/16`（`255.255.0.0`），`DHCP enabled: Yes`，`InterfaceMetric: 35`，`vSwitchBindingEnabled: true`，`isConnected: true`。
- **8000 端口**: 未改动/未重启或抢占宿主 `tia-portal-mcp.exe`（PID `9868`）。

---

## 2. 已落盘文件清单与真实状态

### 2.1 PLCSIM Advanced V7.0 控制桥（`D:\TIA_MCP\plcsim-adv-bridge\`）
| 文件 | 大小 | 当前状态 | 说明 |
|---|---:|---|---|
| `D:\TIA_MCP\plcsim-adv-bridge\src\PlcSimAdvBridge.cs` | 63,079 B | **已编写** | 封装 `Siemens.Simatic.Simulation.Runtime.Api.x64.dll` (V7.0) 与 `Sharp7.dll` S7 102 读取及 `--mcp` stdio JSON-RPC 服务。 |
| `D:\TIA_MCP\plcsim-adv-bridge\build.ps1` | 1,237 B | **已校验/使用** | 使用 `csc.exe` (.NET Framework 4.x x64) 编译并复制 `Sharp7.dll`。 |
| `D:\TIA_MCP\plcsim-adv-bridge\bin\plcsim-adv-bridge.exe` | 39,424 B | **已编译** | 本轮会话中前序已完成编译；`status`/`power-on`/`cleanup` 及 `--mcp` 实测可用。 |
| `D:\TIA_MCP\plcsim-adv-bridge\bin\Sharp7.dll` | 44,544 B | **已就位** | 从 `upstreams\b\runtime\v20\Sharp7.dll` 复制（尚未在 PLCSIM RUN 后完成真实 S7 102 端口 `DB_TestSummary` 读回验收）。 |
| `D:\TIA_MCP\plcsim-adv-bridge\test-bridge.js` | 5,812 B | **已编写** | 前序已运行并通过（exit 0）。 |
| `D:\TIA_MCP\plcsim-adv-bridge\README.md` | 1,768 B | **已编写** | 说明 CLI 与 `--mcp` 暴露的 13 个工具（`plcsim_status`、`plcsim_create_instance` 等）。 |

> 注意实测细节：`plcsim-adv-bridge.exe` 短生命周期 CLI 命令退出后，若无持久进程持有 `SimulationRuntimeManager`（如 `--mcp` 常驻或 GUI），实例不会长期驻留，且 `networkMode` 会回退为 `Softbus`；MCP 模式下参数使用 kebab-case（如 `'network-mode'`、`'power-on'`、`'delete-storage'`），卸载命令为 `cleanup`（非 `delete`）。

### 2.2 E2E 闭环执行器与测试基础设施（`D:\TIA_MCP\benchmarks\runner\`）
| 文件 | 大小 | 当前状态 | 说明 |
|---|---:|---|---|
| `D:\TIA_MCP\benchmarks\runner\tia-mcp-client.js` | 6,553 B | **已编写** | `McpStdioClient`（stdio JSON-RPC 封装）；默认指向 `upstreams/b/runtime/v20/TiaMcpServer.exe` 与 `plcsim-adv-bridge.exe`，带 `assertNoActiveGatewayLock()` 锁冲突保护。已用于实测。 |
| `D:\TIA_MCP\benchmarks\runner\generate-plc-harness.js` | 68,911 B | **已验证（生成与 Lint）** | Route 1 Harness 生成器；前序 `--check-only` 通过（15 块，118/135 执行用例，213 步，0 Lint 错误/0 警告）。 |
| `D:\TIA_MCP\benchmarks\runner\lad-harness.js` | 22,775 B | **已修改（待 PLCSIM 实跑）** | L558 已修复写入 `.scl` 时补齐 UTF-8 BOM（`\uFEFF`）；**尚未在 TIA 导入+编译+PLCSIM 跑通**。 |
| `D:\TIA_MCP\benchmarks\runner\run-plcsim-e2e.js` | 35,806 B | **已编写并局部修复（尚未跑通下载与闭环）** | 已补全 `generateAll(...)` 参数（L689-705）、`summaryMeta.files`（L715-722）及 `DownloadToPlc` 的 `pgPcInterface: 'Siemens PLCSIM'` 传参（L538-540）。单块 `A01` 实测已走到「建隔离工程 -> 导入 -> 0E/0W 编译 -> `GetBlockInfo` -> `CheckDownloadReadiness` 通过」，**在 `DownloadToPlc` 处失败，S7 102 回读及 15 块闭环尚未跑通**。 |
| `D:\TIA_MCP\benchmarks\runner\deviation-manifest.json` | 64,774 B | **既有基线** | 15 块偏差清单与测试策略。 |
| `D:\TIA_MCP\benchmarks\runner\README.md` | 6,818 B | **未更新** | 2026-11-11 版本，尚未补充 `plcsim-adv-bridge` 与 `run-plcsim-e2e.js` 文档。 |

### 2.3 输入资产与历史基线
- **黄金库（`D:\TIA_MCP\benchmarks\golden_library\`）**: 15 个 `.scl` 块 + UDT 等共 31 个文件；`D:\TIA_MCP\benchmarks\test_vectors\` 含 15 个 `.json` 向量文件；连同 UDT 总计 46 个输入文件。
- **LAD 待测块**: `D:\TIA_MCP\benchmarks\lad_test\FB_Motor_DirectStart_LAD.xml`（9,366 B，**尚未走通 PLCSIM 实跑**）。
- **日志目录（`D:\TIA_MCP\benchmarks\logs\`）**: 目前仅有 2026-11-08 的 `A01..A08`、`B01..B07` 单块离线 JSON 日志，**尚无 `plcsim_e2e_report.md` / `.json`**。

---

## 3. 本次定位到的全部真实根因与环境约束

### (a) 主机网卡网段冲突：`本地连接* 2` 占用 `192.168.0.0/24`
- TIA 新建 `PLC_1` 默认 IP 为 `192.168.0.1`、`run-plcsim-e2e.js` 未重写 IP 时默认读取 `192.168.0.1`。
- 主机 `本地连接* 2`（Microsoft Wi-Fi Direct Virtual Adapter #2）固定配置 `192.168.0.117/24`（`InterfaceMetric=25`），`Get-NetRoute` 中 `192.168.0.0/24` 指向 `本地连接* 2`，另有 `Meta` Clash TUN 占据 `0.0.0.0/0`（`RouteMetric=0`）。
- 实测在 `扩展下载到设备`（使用 `Siemens PLCSIM Virtual Ethernet Adapter` + `显示所有兼容的设备`）中：Layer-2 PN-DCP 广播能发现 `DIAG_UI`（`以太网 4` ARP 表可见 `192.168.0.1 -> 02-A9-FE-8C-B5-00`），但 TIA 紧接着对 `192.168.0.1` 建立 TCP 连接识别设备兼容性时，Windows 将 TCP 包发往 `本地连接* 2`（ARP 为 `Incomplete`），导致 TIA 报：
  `与地址 192.168.0.1 处的设备建立连接失败。在线：无法建立到目标模块的连接。` / `检测到不兼容的设备`。
- **约束**: `本地连接* 2` 必须保持原样不动。

### (b) `以太网 4` 当前网段为 `169.254.140.181/16` 且当前 Shell 受限 UAC 无法提权改 IP
- `以太网 4`（`Siemens PLCSIM Virtual Ethernet Adapter`）启用了 DHCP 但无 DHCP 服务器，系统自动分配 APIPA 地址 `169.254.140.181/16`（`255.255.0.0`）。
- 实测 `Find-NetRoute -RemoteIPAddress 169.254.140.201` 完全从 `以太网 4`（Index `3`）发出，不经过 `本地连接* 2` 或 `Meta`。
- `whoami /groups` 显示 `BUILTIN\Administrators` 处于 `Group used for deny only`（UAC 标准权限令牌）；执行 `netsh interface ipv4 set address name="以太网 4" static 192.168.250.1 255.255.255.0` 返回：
  `The requested operation requires elevation (Run as administrator).`
- **约束**: Agent 不能且未尝试绕过 UAC。若采用用户建议的冷门网段 `192.168.250.1/24` + PLC `192.168.250.10`，需用户本人在管理员终端手动执行一次网卡配置；或者由后续接手者先实测免提权同网段 IP `169.254.250.10/16` 是否被 TIA 与 Sharp7 接受。

### (c) CPU 固件版本与「PLC 安全设置」+ Openness 下载模式/改 IP 限制
1. **V4.0 vs V3.0 安全向导差异**：
   - TIA V20 UI 添加 `6ES7 513-1AM03-0AB0` 时默认固件版本为 `V4.0`，会弹出「PLC 安全设置」三步关键默认项：
     - 勾选「保护 TIA Portal 项目和 PLC 中的 PLC 组态数据安全（Protect confidential PLC data）」；
     - 勾选「仅支持 PG/PC 和 HMI 安全通信」（对应 Openness `ConnectionConfiguration.EnableLegacyCommunication` 相关）；
     - 「PLC 访问保护」默认为「启用访问控制」（未配置 UMAC 用户/匿名权限前会阻断无鉴权在线访问）。
   - `run-plcsim-e2e.js:74-75` 目前默认 `mlfb: '6ES7513-1AM03-0AB0'`、`catalogVersion: 'V3.0'`；`setupIsolatedTiaProject`（L357-389）通过 Openness `AddDeviceWithFallback` 建站，跳过 UI 向导但仅调用了 `SetPutGetAccess(enable: true)`，未做子网/IP 改写与安全属性显式放行，也未考虑 V3.0/V4.0 安全策略或退回无访问控制向导的旧固件族（如 `6ES7513-1AL02-0AB0` V2.9）对照。
2. **`TiaMcpServer` (`upstreams/b`) 的两处能力缺口**：
   - **`DownloadToPlc` 仅下软件**：`Portal.Download.cs:143` 硬编码传入 `DownloadOptions.Software`，不包含 `DownloadOptions.Hardware`。空白 PLCSIM 虚拟 CPU 首次下载硬件组态、以及使 `SetPutGetAccess(true)` 和修改后的 PLC IP 在 CPU 生效，均要求硬件+软件下载。
   - **已有设备改 IP 限制**：`upstreams/a`（`tia-portal-mcp`）接口说明明确指出「对已存在设备直接改写 IP 不被 Openness 支持（rc=20），需在 AML 导入前改写 PROFINET IP 与掩码再 `add_device_from_aml`」；`upstreams/b`（`TiaMcpServer`）当前仅暴露 `ExportDeviceAml` 而不含 AML 导入，需实测 `upstreams/b` 的 `Node` 属性/`SetDeviceItemAttribute` 能否改 IP，或如何提供/生成目标 IP 的 `.aml` 模板。
3. **UI「扩展下载到设备」路线现象**：
   - 当 PG/PC 接口为 `PLCSIM`（Softbus）且 `1 X1` 未挂载子网时，「接口/子网的连接」与「开始搜索(S)」均为灰态不可用；切换至 `Siemens PLCSIM Virtual Ethernet Adapter` 后自动填入 `插槽"1 X1"处的方向` 并激活检索。

### (d) 本机 8000 端口已被现有 `tia-portal-mcp` 占用 & Openness 白名单限制
- 宿主已运行 `E:\BaiduNetdiskDownload\tia-portal-mcp-1.4.1-release\...\tia-portal-mcp.exe`（PID `9868`）并监听 `http://127.0.0.1:8000/mcp`；尝试再启动 `upstreams\a\tia-portal-mcp.exe` 会触发 `WinError 10048` 端口冲突。
- 自动化测试必须通过 `TiaMcpServer.exe` + `ConnectIsolated` 创建隔离无头 TIA 会话，不得抢占 8000 端口，也不得关闭/影响用户现有 TIA 或网关会话。
- Openness 注册表白名单仅放行了 `TiaMcpServer.exe` 与 `tia-portal-mcp.exe`（自编 C# `.exe` 调用 `new TiaPortal()` 会被挂死阻断，切勿尝试自编译 Openness 工具绕过）。

---

## 4. 未完成的下一步清单（精确改动点）

### 第一步：确定并落地非冲突网段（二选一）
- **路径 A（推荐，与用户指定一致，`192.168.250.1/24` <-> `192.168.250.10`）**：
  1. 请用户在**管理员终端**执行一次（仅改 `以太网 4`，不碰 `本地连接* 2`）：
     ```powershell
     netsh interface ipv4 set address name="以太网 4" static 192.168.250.1 255.255.255.0
     ```
  2. 在 `run-plcsim-e2e.js` 中传入 `--plc-ip 192.168.250.10`（或改为按 `以太网 4` 当前网段自动推算默认 PLC IP 与掩码，避免 L780 写死 `mask: '255.255.255.0'`）。
- **路径 B（免管理员提权探路，若暂不改 `以太网 4`）**：
  1. 在隔离测试中验证 TIA Openness / PLCSIM Adv V7.0 / `Sharp7` 是否允许 PLC 使用 `169.254.250.10` + 掩码 `255.255.0.0`（位于 `以太网 4` 现有 `169.254.140.181/16` 内）。
  2. 修改 `D:\TIA_MCP\benchmarks\runner\run-plcsim-e2e.js` L780，按实际掩码传 `mask` 参数。

### 第二步：解决临时工程 PLC IP 设定、V3.0/V4.0 安全放行与 Hardware+Software 首次下载
需要在纯代码层面验证并改造 `D:\TIA_MCP\benchmarks\runner\run-plcsim-e2e.js`（及 `setupIsolatedTiaProject` L357-389 / 下载段 L525-549）：
1. **检查 `SetCpuCommonSettings` / 固件选型**：
   - 用 `--profile full` 下的 `GetProjectTree` -> `GetDeviceItemInfo` / `GetDeviceItemNetworkInfo` 实测 `6ES7513-1AM03-0AB0`（`V3.0` / `V4.0`）与 `6ES7513-1AL02-0AB0`（`V2.9`）暴露的真实属性名，确认是否需要通过 `SetCpuCommonSettings` 关闭访问控制/启用兼容通信，或是否优先在仿真验证里选用无 UMAC 默认阻断的兼容 CPU 固件配置。
2. **解决 `Hardware | Software` 首次下载与工程 IP 写入**：
   - `TiaMcpServer.exe`（`Portal.Download.cs:143`）当前硬编码 `DownloadOptions.Software`，且没有内置 NuGet 离线缓存不宜强行重编 `TiaMcpServer`。
   - 可评估三条工程路径之一：
     - **方案 2.1（推荐考察）**：复用 `upstreams\a\tia-portal-mcp.exe` 能力（如修改配置/命令行使其监听独立端口而不碰 8000，或检查 `upstreams\a` 是否支持自定义端口/复用前 `add_device_from_aml(ip_address, subnet_mask)` + `download_to_plc(download_mode="all", allow_target_difference=True, allow_cpu_stop=True)`；若需串联 B 导入 SCL/UDT 与编译，可采用「建站并保存 -> `CloseProject` -> 另一端 `OpenProject` 下载」避免 `.ap20` 双进程锁）。
     - **方案 2.2**：核实 `TiaMcpServer` 是否在 `EnsureSubnet` + `AttachDeviceNodeToSubnet` 后，于 `Softbus` 或已含同硬件镜像的预设空白仿真存储镜像（或仅首次下载硬件、后续软件走 `DownloadToPlc`）下能够通过 `DownloadToPlc` 完成下载。
     - **方案 2.3（`Softbus` + `plcsim-read-tags` 通道验证）**：若要最先验证 15 个黄金块与 LAD 算法逻辑而不依赖 S7 TCP 102，可在完成首次下载后，通过 `run-plcsim-e2e.js` L69 / L538-540 / L772-785 切为 `--network-mode Softbus --read-mode plcsim-tags` 走 `plcsim_read_tags`（`run-plcsim-e2e.js:305-351` 已写好解析逻辑）；但最终交付仍应补齐 `TCPIPSingleAdapter` + `S7 102` 闭环并保留 `Softbus`/`WatchTable` 兜底。

### 第三步：分层端到端验收清单（待执行）
1. **单块闭环验收**：`node.exe D:\TIA_MCP\benchmarks\runner\run-plcsim-e2e.js --block A01`（验证 `FC_AnalogScaleAlarm` 导入 -> `0E/0W` 编译 -> `GetBlockInfo` -> 下载 -> `RUN` -> 62B `DB_TestSummary` S7 102 回读全通过 -> 清理）。
2. **定时/状态机块与块清理复用验收**：`node.exe D:\TIA_MCP\benchmarks\runner\run-plcsim-e2e.js --block A01,A03`（验证 `FB_CylinderCtrl` 真实 `TON` 时序与 `cleanupTiaBlocksForNextRun` 复用工程不残留旧块）。
3. **LAD 块验收**：`node.exe D:\TIA_MCP\benchmarks\runner\run-plcsim-e2e.js --lad D:\TIA_MCP\benchmarks\lad_test\FB_Motor_DirectStart_LAD.xml`（验证 LAD XML 导入 -> BOM `.scl` 驱动导入 -> `0E/0W` 编译 -> PLCSIM 跑通）。
4. **全量 15 个黄金块验收**：
   ```powershell
   node.exe D:\TIA_MCP\benchmarks\runner\run-plcsim-e2e.js --block all --report D:\TIA_MCP\benchmarks\logs\plcsim_e2e_report.md --json-report D:\TIA_MCP\benchmarks\logs\plcsim_e2e_report.json
   ```
5. **文档更新**：更新 `D:\TIA_MCP\benchmarks\runner\README.md`（及视需要更新 `D:\TIA_MCP\README.md`）记录 `plcsim-adv-bridge` 与 `run-plcsim-e2e.js` 的命令参数与注意事项。
