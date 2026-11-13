# P2-2 Benchmark & Route 1 PLC Harness Runner

本目录包含 `D:\TIA_MCP\benchmarks` 的测试向量静态校验、离线仿真评估及 Route 1 PLCSIM V20 自驱测试骨架生成器。

## 1. 组件概览

- `validate-vectors.js`：静态交叉校验 `golden_library/scl/*.scl`、`golden_library/udt/*.xml`、`test_vectors/*.json` 与 `deviation-manifest.json`。
- `offline-eval.js`：Node 侧离线参照评估器（`--mode raw` / `--mode manifest`）。
- `deviation-manifest.json`：15 个标准块的策略 (`blockPolicies`) 与 75 条已知偏差分类 (`deviations`，含 `offlineEvalAction` 与 `plcHarnessAction`)。
- `generate-plc-harness.js`：Route 1（PLC 侧自驱 Harness）SCL 代码生成器，不依赖在线 MCP 写变量工具，生成可直接导入 TIA Portal V20 并下载至 PLCSIM V20 的自检程序与非优化 S7 结果 DB。

## 2. Route 1 `generate-plc-harness.js` 用法

使用项目自带 Node 运行时（避免 PATH 依赖）：

```powershell
# 全量 15 块静态生成与内置 V20 反模式自检（不落盘）
D:\TIA_MCP\delivery\TIA-MCP-Gateway-D-v1.4.3\gateway\runtime\node.exe D:\TIA_MCP\benchmarks\runner\generate-plc-harness.js --check-only

# 生成单个块（按块名或 ID，如 A01 / B07）并输出单文件合集
D:\TIA_MCP\delivery\TIA-MCP-Gateway-D-v1.4.3\gateway\runtime\node.exe D:\TIA_MCP\benchmarks\runner\generate-plc-harness.js --block FC_AnalogScaleAlarm --out-dir .\out --single-file

# 原始向量直跑（忽略 manifest 过滤/步序适配）
D:\TIA_MCP\delivery\TIA-MCP-Gateway-D-v1.4.3\gateway\runtime\node.exe D:\TIA_MCP\benchmarks\runner\generate-plc-harness.js --manifest-mode raw --out-dir .\out_raw

# 定时加速（如 0.1 倍速，自动保留 +marginMs 裕量，并对 DUT 内硬编码 T# 常量发出告警）
D:\TIA_MCP\delivery\TIA-MCP-Gateway-D-v1.4.3\gateway\runtime\node.exe D:\TIA_MCP\benchmarks\runner\generate-plc-harness.js --block FB_CylinderCtrl --time-scale 0.1 --margin-ms 20 --out-dir .\out_fast
```

### 主要 CLI 参数

| 参数 | 说明 | 默认值 |
|---|---|---|
| `--block <name\|id[,...]>` | 指定块名、块编号（`A01`..`B07`）或 `all` | `all` |
| `--out-dir <dir>` | 输出根目录（每块生成独立子目录及 `harness-manifest.json`） | `../plc_harness_out` |
| `--manifest <file>` | 指定 `deviation-manifest.json` 路径 | `./deviation-manifest.json` |
| `--manifest-mode <manifest\|raw>` | `manifest` 按偏差清单处理跳过/前置/脉冲突变/屏蔽；`raw` 原样全量生成 | `manifest`（存在时） |
| `--time-scale <num>` | 仅缩放 `TON_WAIT` 与非零 `TIME` 引脚（范围 `(0, 10]`） | `1.0` |
| `--margin-ms <ms>` | 叠加到每个 `TON_WAIT` 步目标 `PT` 的安全裕量（ms） | `20` |
| `--scan-ms <ms>` | 用于判定单拍与扫描数换算的假定 OB 周期（ms） | `10` |
| `--case-isolation <auto\|per_case_reset\|cumulative>` | `per_case_reset` 为每个非跳过 Case 分配独立 `#instDut_i` 多重背景；`cumulative` 共用 `#instDut_1` | `auto` |
| `--include-private-dep` | 在 `manifest` 模式下强制纳入缺少 `prefixSteps` 的 `run_prefix_sequence` 用例 | `false` |
| `--single-file` | 额外输出拓扑有序的单文件 `Harness_<Block>.scl` | `false` |
| `--check-only` | 仅在内存中生成并执行内置反模式检查，不写磁盘 | `false` |
| `--json` | 输出结构化 JSON 报告 | `false` |

## 3. 生成文件与 TIA Portal V20 导入顺序

每个块目录 `<out-dir>/<BlockName>/` 均自包含以下 UTF-8 with BOM (`.scl`) 文件与清单：

1. 先确保工程已导入被测块的 `UDT_HMI_*.xml` 与黄金块 `<Block>.scl`。
2. 按编号顺序通过外部源文件导入并编译（或直接使用 `--single-file` 生成的 `Harness_<Block>.scl`）：
   - `01_DB_TestSummary.scl`：非优化全局 DB（`S7_Optimized_Access := 'FALSE'`），供 MCP/S7 只读观测。
   - `02_FB_Harness_<Block>.scl`：测试驱动状态机 + 断言记录块。
   - `03_DB_Harness_<Block>.scl`：`FB_Harness_<Block>` 背景 DB。
   - `04_OB_TestRunner_<Block>.scl`：自由循环 OB（严禁命名为 `Main`），PLC `RUN` 后自动运行一轮测试并在 `done=TRUE` 后锁定结果直至 `resetRun=TRUE`。
   - `harness-summary.json`：包含用例状态、`#instDut_i` 映射、告警及 `fieldMap`（与 `firstFailFieldIndex`/`firstFailMask` 一一对应）。

## 4. `DB_TestSummary` S7 字节偏移布局（62 Bytes）

| 字段 | 类型 | 偏移 | 说明 |
|---|---|---|---|
| `done` / `passed` / `running` / `hasError` | `Bool` | `DBX0.0` .. `DBX0.3` | 完成 / 全过 / 运行中 / 异常 |
| `totalCases` / `executedCases` / `passedCases` / `failedCases` / `skippedCases` | `Int` | `DBW2` .. `DBW10` | 用例统计 |
| `currentCaseIndex` / `currentStepIndex` | `Int` | `DBW12` / `DBW14` | 当前执行用例与步号（`0` 为前置步） |
| `firstFailCase` / `firstFailStep` / `firstFailFieldIndex` | `Int` | `DBW16` .. `DBW20` | 首个失败定位（1-based，索引对应 `fieldMap`） |
| `firstFailIsHmi` | `Bool` | `DBX22.0` | `FALSE`=`expectedOutputs`，`TRUE`=`expectedHmi_out` |
| `firstFailMask` | `DWord` | `DBD24` | 首个失败步内累计失配字段位掩码（0..31） |
| `statusCode` | `Word` | `DBW28` | `16#0000` 空闲，`16#0001` 运行，`16#0002` 通过，`16#0003` 失败，`16#80FD..80FF` 异常 |
| `totalStepsExecuted` / `failedStepsCount` | `DInt` | `DBD32` / `DBD36` | 累计步数与失败步数 |
| `firstFailActualReal` / `firstFailExpectedReal` | `Real` | `DBD40` / `DBD44` | 首个 `Real` 失配实测值/期望值 |
| `firstFailActualDInt` / `firstFailExpectedDInt` | `DInt` | `DBD48` / `DBD52` | 首个 `Int`/`DInt`/`Time`（ms）实测值/期望值 |
| `firstFailActualWord` / `firstFailExpectedWord` | `Word` | `DBW56` / `DBW58` | 首个 `Word` 失配实测值/期望值 |
| `firstFailActualBool` / `firstFailExpectedBool` | `Bool` | `DBX60.0` / `DBX60.1` | 首个 `Bool` 失配实测值/期望值 |

## 5. 内置 V20 编译反模式静态检查与已知注意事项

生成器在落盘前自动校验并拦截以下问题：
- **UTF-8 BOM 与头文件净空**：强制写入 `0xEF 0xBB 0xBF` BOM，且块声明关键字前无注释或前导文本。
- **OB 命名避让**：禁止生成名为 `"Main"` 的 OB，统一命名为 `"OB_TestRunner_<Block>"`。
- **DA008 / SE002 / AL001 / PC008**：零 `VAR_OUTPUT` 回读、`VAR_TEMP` 于 `BEGIN` 首部无条件清零初始化、`TON_TIME` 单一调用点确保非等待态执行 `IN := FALSE`、`Real` 比较使用带小数点字面量及 `NOT (ABS(actual - exp) <= effTol)`（可拦截 IEEE-754 `NaN`）。
- **硬编码定时器提示**：`FB_CylinderCtrl` 内部存在硬编码 `PT := T#200ms`（双限位冲突检测），使用 `--time-scale < 1.0` 时无法外部缩放该常量，生成器会自动输出警告。

## 6. PLCSIM Advanced V7.0 端到端闭环验证 (`run-plcsim-e2e.js`)

`run-plcsim-e2e.js` 通过 `TiaMcpServer.exe` + `plcsim-adv-bridge.exe` 自动完成“创建隔离工程 → 配置虚机保护与 PUT/GET → 生成并导入 Harness → 编译 `0E/0W` → 首次硬件/软件下载 → `sharp7` / S7 读取 `DB_TestSummary` → 自动清理实例与临时目录”的全自动上机闭环。

### 关键默认配置与工作流说明

- **默认目标 CPU 与通信模式**：`cpuType=CPU1513`、`mlfb="6ES7 513-1AM03-0AB0"`、`catalogVersion=V3.1`、`networkMode=TCPIPSingleAdapter`、`plcIp=192.168.250.10`、`subnetMask=255.255.255.0`（对应宿主静态网卡 `以太网 4 = 192.168.250.1/24`）。
- **安全配置与下载策略**：自动执行 `SetPlcProtection`（V3.1 默认 `Disabled` + `unprotect`；低版本回落 `FullAccess` + `unprotect`）与 `SetPutGetAccess(true)`；首次下载使用 `hardware_and_software`（含 `allowProtectionDowngrade: true` 与 `acceptUnencryptedSensitiveData: true`），块前均先通过 `waitForPlcTcpReady(plcIp, 10000)` 等待端口 `102` 就绪。
- **每块隔离 PLCSIM 实例**：连续批量测试多块时，每块切换前销毁上一块 PLCSIM 实例并使用独立存储名重建全新实例（避免跨块删旧块触发 `ResetModule` 引起 PLCSIM V7.0 挂起/掉线）。
- **外部 SCL 导入隔离**：通过 `--block` 或 `generate-plc-harness.js` 导入外部 SCL 时，带别名复制统一写入系统临时目录（`os.tmpdir()/tia_e2e_scl_stage`），绝不写入 `golden_library/`。
- **LAD / 图形化块直测**：支持通过 `--lad <file.xml|.s7dcl>`（自动推断或搭配 `--vectors`、`--udt`）使用 `lad-harness.js` 生成自驱测试并完成 PLCSIM E2E 验证。

### 常用运行命令

```powershell
# 单块验证（如 A01）
node D:\TIA_MCP\benchmarks\runner\run-plcsim-e2e.js --block A01

# 多块串联验证
node D:\TIA_MCP\benchmarks\runner\run-plcsim-e2e.js --block A01,A03

# LAD XML 块验证（自动匹配 lad_test 向量）
node D:\TIA_MCP\benchmarks\runner\run-plcsim-e2e.js --lad D:\TIA_MCP\benchmarks\lad_test\FB_Motor_DirectStart_LAD.xml

# 全量 15 个黄金块回归并输出 Markdown + JSON 报告
node D:\TIA_MCP\benchmarks\runner\run-plcsim-e2e.js --block all --report D:\TIA_MCP\benchmarks\logs\plcsim_e2e_report.md --json-report D:\TIA_MCP\benchmarks\logs\plcsim_e2e_report.json
```

### 已验证闭环基线结果（TIA V20 + PLCSIM Adv V7.0）

- **全量 19 块回归（`--block all --lad-dir D:\TIA_MCP\benchmarks\lad_test`，[plcsim_e2e_report.md](../logs/plcsim_e2e_report.md)）**：**19/19 块通过**（`15 SCL + 4 LAD XML`，`0` 失败），**138/138 执行用例通过**（其余 18 个纯私有/不可外置注入起始状态用例按 `deviation-manifest.json` 的 `32` 条规则跳过），全部块 `0E/0W` 编译通过并经 `sharp7-s7-102`（`DB1`）校验通过，总耗时 `1572.4s`。
- **LAD 离线自测（`test-lad-harness.js`）**：**9/9 项断言通过**。
