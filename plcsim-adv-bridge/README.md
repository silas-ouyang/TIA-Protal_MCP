# PLCSIM Advanced V7.0 Control Bridge

Lightweight x64 CLI & stdio MCP bridge for Siemens S7-PLCSIM Advanced V7.0 (`Siemens.Simatic.Simulation.Runtime.Api.x64.dll`) plus read-only S7 DB reads over TCP port 102 (`Sharp7.dll`).

## Build

Requires Windows `.NET Framework 4.x` (`C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe`), PLCSIM Advanced V7.0 API DLL, and `Sharp7.dll` (placed next to the executable, via `SHARP7_DLL`, or via the fallback path in `src/PlcSimAdvBridge.cs`):

```powershell
powershell -ExecutionPolicy Bypass -File D:\TIA_MCP\plcsim-adv-bridge\build.ps1
```

## CLI Usage

```powershell
# Runtime status, network mode, interfaces, and registered instances
D:\TIA_MCP\plcsim-adv-bridge\bin\plcsim-adv-bridge.exe status
D:\TIA_MCP\plcsim-adv-bridge\bin\plcsim-adv-bridge.exe list
D:\TIA_MCP\plcsim-adv-bridge\bin\plcsim-adv-bridge.exe net-interfaces

# Inspect or switch network mode (Softbus | TCPIPSingleAdapter | TCPIPMultipleAdapter)
D:\TIA_MCP\plcsim-adv-bridge\bin\plcsim-adv-bridge.exe network-mode --set TCPIPSingleAdapter --bind-index 0
D:\TIA_MCP\plcsim-adv-bridge\bin\plcsim-adv-bridge.exe network-mode --set Softbus

# Create/ensure, set IP, power on, and start an isolated virtual CPU instance
D:\TIA_MCP\plcsim-adv-bridge\bin\plcsim-adv-bridge.exe create --name TIA_E2E_SIM --cpu CPU1513 --ip 172.31.152.201 --mask 255.255.255.0 --power-on --run

# State transitions, IP configuration, and waiting
D:\TIA_MCP\plcsim-adv-bridge\bin\plcsim-adv-bridge.exe power-on --name TIA_E2E_SIM
D:\TIA_MCP\plcsim-adv-bridge\bin\plcsim-adv-bridge.exe stop --name TIA_E2E_SIM
D:\TIA_MCP\plcsim-adv-bridge\bin\plcsim-adv-bridge.exe run --name TIA_E2E_SIM
D:\TIA_MCP\plcsim-adv-bridge\bin\plcsim-adv-bridge.exe memory-reset --name TIA_E2E_SIM
D:\TIA_MCP\plcsim-adv-bridge\bin\plcsim-adv-bridge.exe power-off --name TIA_E2E_SIM
D:\TIA_MCP\plcsim-adv-bridge\bin\plcsim-adv-bridge.exe set-ip --name TIA_E2E_SIM --ip 172.31.152.201 --mask 255.255.255.0 --gw 0.0.0.0 --persistent true
D:\TIA_MCP\plcsim-adv-bridge\bin\plcsim-adv-bridge.exe wait-state --name TIA_E2E_SIM --state Run --timeout 20000

# Read DB bytes via S7 port 102 (Sharp7 defaults: rack=0, slot=1, offset=0, size=62, retries=3)
D:\TIA_MCP\plcsim-adv-bridge\bin\plcsim-adv-bridge.exe s7-read-db --ip 172.31.152.201 --db 2 --size 62 --parse-summary

# Read DB or IO/M/CT/DB tags via PLCSIM Advanced native Runtime API (read-only)
D:\TIA_MCP\plcsim-adv-bridge\bin\plcsim-adv-bridge.exe plcsim-read-tags --name TIA_E2E_SIM --db DB_TestSummary --prefix ""

# Cleanup temporary instance without disturbing other registered instances
D:\TIA_MCP\plcsim-adv-bridge\bin\plcsim-adv-bridge.exe cleanup --name TIA_E2E_SIM --delete-storage true

# Named-pipe daemon management (used automatically by `create`/`ensure` unless `--no-daemon`)
D:\TIA_MCP\plcsim-adv-bridge\bin\plcsim-adv-bridge.exe serve --pipe tia_mcp_plcsim_adv_v7 --auto-exit
D:\TIA_MCP\plcsim-adv-bridge\bin\plcsim-adv-bridge.exe daemon-stop --pipe tia_mcp_plcsim_adv_v7
```

## Capabilities & Scope Notes

- **Network Modes**: Supports `Softbus` (aliases `plcsim`), `TCPIPSingleAdapter` (`tcpip`, `single`), and `TCPIPMultipleAdapter` (`multiple`), with optional `--bind-index <N>` (`SetNetInterfaceBindings`) when switching to a TCPIP adapter mode.
- **S7 DB Read (`s7-read-db` / `plcsim_read_db`)**: Connects via Sharp7 on TCP port 102 (default `rack=0`, `slot=1` for S7-1200/1500, `offset=0`, `size=62`, `retries=3`). Returns `base64`, `hex`, and `cpuStatus`. When `--parse-summary` (`parse-summary`) is enabled with `offset=0` and `size >= 62`, decodes the 62-byte big-endian `DB_TestSummary` layout:
  - Byte `0`: bitflags `done` (`0x01`), `passed` (`0x02`), `running` (`0x04`), `hasError` (`0x08`)
  - Offsets `2..20` (`Int16`): `totalCases`, `executedCases`, `passedCases`, `failedCases`, `skippedCases`, `currentCaseIndex`, `currentStepIndex`, `firstFailCase`, `firstFailStep`, `firstFailFieldIndex`
  - Byte `22` bit `0` (`0x01`): `firstFailIsHmi`
  - Offset `24` (`UInt32`): `firstFailMask`; offset `28` (`UInt16`): `statusCode` / `statusCodeHex`
  - Offsets `32..36` (`Int32`): `totalStepsExecuted`, `failedStepsCount`
  - Offsets `40..44` (`Float`): `firstFailActualReal`, `firstFailExpectedReal`
  - Offsets `48..52` (`Int32`): `firstFailActualDInt`, `firstFailExpectedDInt`
  - Offsets `56..58` (`UInt16`): `firstFailActualWord`, `firstFailExpectedWord`
  - Byte `60` bits `0x01` / `0x02`: `firstFailActualBool`, `firstFailExpectedBool`
- **Tag Reading (`plcsim-read-tags` / `plcsim_read_tags`)**: Updates tag metadata via `UpdateTagList` (`ETagListDetails.DB` when `--db` is given, otherwise `ETagListDetails.IOMCTDB`) and reads primitive tags (`Unspecific` and `Struct` entries are skipped), optionally filtered by `--prefix`.
- **Read-Only Tag/DB Surface**: Tag and DB operations in this bridge are read-only (`s7-read-db` / `plcsim_read_db` and `plcsim-read-tags` / `plcsim_read_tags`). Tag/DB writing (`write-tags` / `plcsim_write_tags`) is **not implemented** in `src/PlcSimAdvBridge.cs`.

## Standalone MCP Mode (`--mcp`)

Launch `D:\TIA_MCP\plcsim-adv-bridge\bin\plcsim-adv-bridge.exe --mcp` over stdio (JSON-RPC 2.0, `protocolVersion: "2024-11-05"`) to expose these 13 tools:

- `plcsim_status`
- `plcsim_list_instances`
- `plcsim_set_network_mode` (`set`, `bind-index`)
- `plcsim_create_instance` (`name`, `cpu`, `storage`, `network-mode`, `ip`, `mask`, `gw`, `power-on`, `run`, `timeout`)
- `plcsim_power_on` (`name`, `timeout`)
- `plcsim_run` (`name`, `timeout`)
- `plcsim_stop` (`name`, `timeout`)
- `plcsim_memory_reset` (`name`, `timeout`)
- `plcsim_power_off` (`name`, `timeout`)
- `plcsim_set_ip` (`name`, `ip`, `mask`, `gw`, `interface-id`, `persistent`)
- `plcsim_cleanup` (`name`, `delete-storage`, `timeout`)
- `plcsim_read_db` (`ip`, `db`, `offset`, `size`, `rack`, `slot`, `parse-summary`)
- `plcsim_read_tags` (`name`, `db`, `prefix`)

## Integration Smoke Test (Requires Live PLCSIM Advanced V7.0)

`test-bridge.js` exercises live CLI and MCP instance lifecycle + network-mode restoration (configurable via `PLCSIM_TEST_IP`, default `172.31.152.201`, and `PLCSIM_TEST_MASK`, default `255.255.255.0`):

```powershell
$env:PLCSIM_TEST_IP = "172.31.152.201"
node D:\TIA_MCP\plcsim-adv-bridge\test-bridge.js
```
