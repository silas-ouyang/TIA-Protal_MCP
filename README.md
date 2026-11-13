# TIA-MCP-Gateway (`TIA-Protal_MCP`)

A unified Model Context Protocol (MCP) gateway bridging **Google Antigravity**, Claude Desktop, Claude Code, Cursor, VS Code, Codex, Gemini CLI, WorkBuddy, opencode, and DeepSeek Harness with **Siemens TIA Portal (V15–V21.1)** and **PLCSIM Advanced V7.0**.

> **中文快速导航**：[快速开始指南](delivery/TIA-MCP-Gateway-D-v1.4.3/快速开始.md) · [PLCSIM 实测报告（19/19 通过）](benchmarks/logs/plcsim_e2e_report.md) · [Phase 2 审计与修复记录](benchmarks/logs/offline_audit_and_fixes.md) · [PLCSIM 仿真桥接说明](plcsim-adv-bridge/README.md)

### Current Verified Status (Phase 2)

- **PLCSIM Advanced V7.0 E2E**: **19/19 blocks passed** (`15` Golden SCL FB/FC + `4` LAD SimaticML XML blocks), **138/138 executed test cases passed**, `0` compile errors/warnings (`6ES7 513-1AM03-0AB0 V3.1`, verified via `sharp7-s7-102`).
- **Offline Vector & Lint Gate**: `validate-vectors.js --strict` (`15` blocks, `135` cases / `236` steps, `0` errors/warnings, `0` known vector/block mismatches).
- **Gateway & Installer Self-Checks**: Zero-dependency Node Gateway D + `install.js` supporting 10 AI hosts (`test-gateway-offline.js` 9/9, `test-lad-harness.js` 9/9).
- **Known Scope**: Automated E2E runs target TIA Portal **V20** + **PLCSIM Advanced V7.0** (S7-1500 virtual CPU); physical S7-1200 (`1214C`) hardware regression and full Factory I/O closed-loop E2E remain manual/future validation.

### Repository Layout

| Directory | Contents |
|---|---|
| `delivery/TIA-MCP-Gateway-D-v1.4.3/` | Unified Gateway D (`gateway/`), Upstreams A/B, 10-host `install.js`, startup scripts, and 6 engineering `skills/`. |
| `plcsim-adv-bridge/` | Standalone x64 C#/.NET PLCSIM Advanced V7.0 CLI & MCP bridge (`Sharp7` + simulation lifecycle). |
| `benchmarks/` | 15 Golden SCL blocks, `UDT_HMI_*` types, `lad_test/` (`LAD01–LAD04`), test vectors, E2E runner, and reports. |

---

### The Problem

If you've ever tried automating Siemens TIA Portal via the Openness API, you know it doesn't play well with concurrency:
- **Single-client lockup**: Only one external process can reliably attach to a running TIA Openness session at a time. If two AI tools or background tasks try to hook in simultaneously, Openness throws random RPC or HRESULT crashes.
- **Fragmented tooling**: Different community MCP implementations excel at different things. Upstream A (HTTP-based) works cleanly across older versions (V15–V19) and compact LAD (V20U4+) with 47 tools; Upstream B provides granular, low-level access (238 tools total, default `lite` roster of 65 + `CallTool` passthrough) focusing on V20/V21.

### What This Gateway Does

`TIA-MCP-Gateway` acts as a traffic controller, safety guard, and process manager sitting between your AI coding assistant and TIA Portal:

```text
AI Client (Antigravity / Claude / Cursor / VS Code / Codex / Gemini CLI / WorkBuddy / opencode / DSH)
        │  stdio (JSON-RPC MCP Protocol)
        ▼
   ┌───────────┐
   │ Gateway D │  15 curated d_* tools + d_call raw passthrough (1+5 modular zero-dep Node)
   └─────┬─────┘
         ├── Upstream A   HTTP 127.0.0.1:8000   47 tools   (V15–V21.1)
         └── Upstream B   stdio child process   238 tools  (V20/V21, default lite 65)
```

1. **Session, Port & Lock Arbitration**: Enforces cross-process exclusive locking (`active.lock`), zero-spawn registry/PublicAPI/Portal discovery (`d_doctor`, `d_versions`), Port 8000 occupancy fingerprinting (`probePort8000` with fail-closed protection unless `adoptExternal: true`), and lock-preserving `B -> A` pre-`OpenProject` infrastructure fallback (`d_connect`).
2. **Unified Tool Surface (`d_*`) & `1+5` Architecture**: Zero external npm dependencies, organized into `gateway/gateway.js` + `gateway/lib/{utils,upstreams,lock,connect,blocks}.js`. Exposes 15 curated high-level tools plus `d_call` (which forwards non-`lite` B tools via `CallTool` — note B's `ToolBridge` still blocks `InvokeObject`/`InvokeService` with `allowWrite=true` under default `lite`).
3. **Transactional Block Writes & Atomic Finish (`d_write_block`, `d_save`, `d_finish`)**:
   - `d_write_block` previews a dry-run plan by default; on B `.scl` with `confirm: true`, it validates SCL declarations, exports a pre-delete SimaticML XML backup, enforces a `CompileAndDiagnosePlc` compilation gate, automatically rolls back via XML on failure, and writes `pending_recovery.json` if even rollback fails.
   - `d_save` and `d_finish` refuse to save over disk projects when `pending_recovery.json` exists (unless explicitly overridden via `allow_dirty_save: true` or cleared via `clear_pending_recovery: true` / successful rewrite), and `d_finish` requires 0 compilation errors before saving.
4. **Built-in Engineering Knowledge**: Packages six field-tested skill rulebooks (`tia-portal-ops`, `siemens-v20-ops`, `siemens-s7-1200-1500-programming`, `plc-skill`, `tia-golden-blocks`, and `tia-spec-first`) so the LLM writes IEC 61131-3 compliant code out of the box.

---

### Tool Overview (`d_*`)

| Tool | Description |
|---|---|
| `d_status` | Inspect active connections, exclusive lock, `external` adoption state, and `pendingRecovery` status. |
| `d_doctor` | Fast zero-spawn diagnostics by default (lock, `pending_recovery.json`, Port 8000 guard, TIA registry/Openness group, B/C runtimes). Pass `deep: true` to actually spawn A; supports `refresh`, `with_server_info`, `clear_pending_recovery`. |
| `d_versions` | Zero-spawn discovery of installed Siemens TIA Portal versions (`refresh` to bypass 60s cache) and routing candidates. |
| `d_use` | Switch upstream engine (`a` / `b` / `c`) with automatic cleanup of the previous managed session. |
| `d_connect` | Auto-route by version or `.apXX` path and attach/open project; supports pre-`OpenProject` `B -> A` fallback (`fallback: false` to disable). |
| `d_tree` | Recursively read PLC device structure, block groups, and hardware layout. |
| `d_read_block` | Read block logic (`DescribeBlockLogic` default on B, or `format: "s7dcl"` / `"xml"` / `"simaticml"`). On B `s7dcl`, automatically resolves subgroups via `GetBlocksWithHierarchy` (note native `ExportBlock` (`xml`) shares the root-only limitation when `group` is omitted, so pass `group` for subgroup `xml` reads); fails with clear XML guidance on V20 SCL blocks (`EngineeringNotSupportedException`) unless `fallback_to_xml: true`. |
| `d_write_block` | Auto-BOM encoding + dry-run plan by default (`confirm: true` to execute). On B `.scl`, runs declaration check, XML backup, `CompileAndDiagnosePlc` gate, and auto-rollback; supports `group`, `res_content`, `overwrite`, `allow_ob_source`, `allow_unbacked_overwrite`, `allow_multi_block`, `on_compile_error`. |
| `d_compile` | Trigger PLC compilation and retrieve structured diagnostic errors (`CompileAndDiagnosePlc` on B). |
| `d_save` | Save changes to the active TIA project; blocked if `pending_recovery.json` exists (`allow_dirty_save`, `clear_pending_recovery`). |
| `d_offline` | Switch PLC session offline before block or hardware edits. |
| `d_download` | Download compiled software changes to target PLC / PLCSIM (`confirm: true` required; explicit interface/IP, never guessed). On Upstream A, `target_interface` takes PLC IP (V15–V20) or interface name (V21, e.g. `PN/IE_1` / `1 X1`); on Upstream B, `target_interface` maps to `targetIpAddress` and must always be the PLC IP on both V20 and V21. |
| `d_finish` | Atomic finalization: switch offline -> compile (requires 0 errors by default) -> save project (blocked if `pending_recovery.json` exists unless `allow_dirty_save: true`). |
| `d_list_tools` | Query visible tools and B's full 238-tool roster (`FindTools` when `filter` is provided). |
| `d_call` | Forward arbitrary tool invocations directly to the active upstream (with optional `retries` backoff). |

---

### Integration & Setup

#### Prerequisites
- **OS**: Windows 10 / 11 (64-bit)
- **Siemens TIA Portal**: V15 through V21.1 installed (V20/V21 for Upstream B).
- **Permissions**: Current Windows user must belong to the **`Siemens TIA Openness`** user group (*Computer Management → Local Users and Groups → Groups*).

#### 1. Quick Install (10 Supported Hosts)
1. Extract or clone this repository into a permanent directory (avoid spaces in path).
2. Double-click `delivery/TIA-MCP-Gateway-D-v1.4.3/安装.bat` (or run `gateway\runtime\node.exe install.js`).
   - Safely detects installed AI clients without parent-directory false positives: **Antigravity**, **Gemini CLI**, **Claude Desktop**, **Claude Code**, **Cursor**, **VS Code**, **Codex**, **WorkBuddy**, **opencode**, and **DeepSeek Harness**.
   - Performs BOM-safe, path-aware idempotent merges (preserves existing `env` and sibling servers; creates `.bak-*` backups before modifying; skips redundant backups if paths match) and generates per-host reference templates in `生成的配置/`.
   - Useful CLI flags: `--list`, `--dry-run`, `--configs-only`, `--host <id[,id]>`, `--update`, `--out <dir>`, `-h/--help`.

#### 2. Manual MCP Client Configuration (Example: Google Antigravity)
For **Google Antigravity**, the active Windows MCP config is `%USERPROFILE%\.gemini\config\mcp_config.json` (while Gemini CLI uses `%USERPROFILE%\.gemini\settings.json`; do not mix them). Always point `command` to the bundled `node.exe` so no system Node PATH is required:

```json
{
  "mcpServers": {
    "tia-gateway": {
      "command": "<PATH_TO_REPO>\\delivery\\TIA-MCP-Gateway-D-v1.4.3\\gateway\\runtime\\node.exe",
      "args": ["<PATH_TO_REPO>\\delivery\\TIA-MCP-Gateway-D-v1.4.3\\gateway\\gateway.js"],
      "env": {}
    }
  }
}
```

#### 3. Self-Check & Benchmark Verification
- **Gateway Offline Regression (`gateway/smoke-test.js`)**:
  ```powershell
  $env:D_RUNTIME_DIR = "$env:TEMP\tia_smoke"
  .\delivery\TIA-MCP-Gateway-D-v1.4.3\gateway\runtime\node.exe .\delivery\TIA-MCP-Gateway-D-v1.4.3\gateway\smoke-test.js
  ```
  Runs pure-function unit tests, the `F1–F14` Mock HTTP (`127.0.0.1:0`) / Mock B fault-injection matrix, and offline B checks without requiring TIA or touching Port 8000.
- **Golden Blocks & LAD Benchmark Suite (`benchmarks/runner/`)**:
  Includes `validate-vectors.js` (`[--strict] [--json] [--block <BlockName>] [--manifest <path>]`), `offline-eval.js` (`[--mode raw|manifest]`), `deviation-manifest.json` (15 block policies + 32 runtime/private-state adaptation rules across 135 cases / 236 steps, `0` known vector mismatches), `generate-plc-harness.js` (Route 1 PLC self-driving SCL harness generator with built-in V20 anti-pattern linter and non-optimized `DB_TestSummary`), `lad-harness.js` (LAD/S7DCL harness generator for `benchmarks/lad_test/`), and `run-plcsim-e2e.js` (19/19 blocks, 138/138 cases `0E/0W` verified on PLCSIM Advanced V7.0). See `benchmarks/runner/README.md` for details.

#### 4. PLCSIM Advanced V7.0 Simulation Bridge (`plcsim-adv-bridge/`)
- **Separation from Gateway D**: Gateway D (`d_*`) does not manage PLCSIM virtual CPU lifecycles. Instance creation, power-on/run/stop, network mode switching, and S7 DB reads are handled by the standalone x64 bridge `plcsim-adv-bridge/bin/plcsim-adv-bridge.exe` (CLI or `--mcp` stdio server exposing 13 tools with kebab-case string arguments such as `network-mode`, `power-on`, `delete-storage`, `parse-summary`).
- **Runtime Persistence & `Softbus` Revert**: Short-lived CLI invocations only retain `SimulationRuntimeManager` while a background pipe daemon holds an instance; once 0 instances remain (or without a persistent holder like `--mcp` or PLCSIM GUI), `NetworkMode` reverts to `Softbus`.
- **S7 Port 102 Readback Requirements**: `s7-read-db` / `plcsim_read_db` (`Sharp7.dll`, `rack=0, slot=1`) requires `TCPIPSingleAdapter` (not `Softbus`), a **non-optimized DB** (`Optimized block access` off), `Put/Get` access enabled, and a reachable IPv4 subnet.
- **Windows Host NIC / UAC / CPU FW V4.0 Pitfalls**:
  - *Subnet Collision*: If another Windows adapter already holds `192.168.0.0/24` with a lower metric, TIA's default `192.168.0.1` CPU is discovered over Layer-2 PN-DCP but fails TCP connection (`检测到不兼容的设备`). Use an isolated subnet (e.g. `192.168.250.0/24`).
  - *APIPA & UAC Elevation*: `Siemens PLCSIM Virtual Ethernet Adapter` defaults to APIPA `169.254.x.x/16`; assigning a static IP via `netsh` requires an elevated Administrator shell.
  - *TIA V20 FW V4.0 Security Defaults*: Default V20 CPUs such as `6ES7 513-1AM03-0AB0` (`V4.0`) enable `Protect confidential PLC data`, `Only allow secure PG/PC and HMI communication`, and UMAC access control by default (`SetPutGetAccess(true)` alone is insufficient). Note also that Windows Openness registry whitelisting only permits registered binaries (`TiaMcpServer.exe` / `tia-portal-mcp.exe`).

---

### Typical Agent Interaction

```text
User: "Connect to the V20 instance and check the active project tree."
Antigravity -> d_connect(version: "V20") -> d_tree()

User: "Write an S7-1500 motor control block with E-stop and overload interlocks."
Antigravity -> d_write_block(block: "FB_MotorControl", format: "scl", content: "...")         // Dry-run plan first
Antigravity -> d_write_block(block: "FB_MotorControl", format: "scl", content: "...", confirm: true)

User: "Compile and save if clean."
Antigravity -> d_finish()  // Offline -> compile (0 errors required) -> save.
```

---

### Included Skills

- **`tia-portal-ops`**: Operational rules, tool mappings, and conflict arbitration across multiple upstreams and Gateway D.
- **`siemens-v20-ops`**: V20-specific operational quirks, `.s7dcl`/`.s7res` DSL constraints, Update 4 compatibility, and WinCC Unified bounds.
- **`siemens-s7-1200-1500-programming`**: Siemens official programming style guide (V2.0, 78 rules), memory optimization, and LGF library integration.
- **`plc-skill`**: IEC 61131-3 logic design, state machines, and vendor interlock standards.
- **`tia-golden-blocks`**: 15 TIA Portal V20 verified (`0E / 0W`) golden SCL FB/FC blocks, paired `UDT_HMI_*` types, and 7 Factory I/O sequence blueprints.
- **`tia-spec-first`**: Three-stage "Spec -> Single-Block Implement -> Review" workflow for multi-block PLC tasks to minimize compile-loop token burn.

---

### License

This project is licensed under the MIT License.
