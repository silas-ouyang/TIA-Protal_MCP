# TIA-MCP-Gateway

A unified Model Context Protocol (MCP) gateway bridging LLM coding agents (Claude, DeepSeek, Opencode, WorkBuddy) with Siemens TIA Portal (V15 through V21.1).

---

### The Problem

If you've ever tried automating Siemens TIA Portal via the Openness API, you know it doesn't play well with concurrency:
- **Single-client lockup**: Only one external process can reliably attach to a running TIA Openness session at a time. If two AI tools or background tasks try to hook in simultaneously, Openness throws random RPC or HRESULT crashes.
- **Fragmented tooling**: Different community MCP implementations excel at different things. Upstream A (HTTP-based) works cleanly across older versions (V15–V19) with 47 high-level tools; Upstream B provides granular, low-level access (238 tools) but focuses on V20/V21.

### What This Gateway Does

`TIA-MCP-Gateway` acts as a traffic controller and process manager sitting between your AI client and TIA Portal:

```text
AI Client (opencode / DeepSeek / WorkBuddy / Antigravity)
        │  stdio (JSON-RPC MCP Protocol)
        ▼
   ┌─────────┐
   │ Gateway │  15 curated d_* tools + d_call raw passthrough
   └────┬────┘
        ├── Upstream A   HTTP 127.0.0.1:8000   47 tools   (V15–V21.1)
        └── Upstream B   stdio child process   238 tools  (V20/V21)
```

1. **Session & Lifecycle Arbitration**: Manages exclusive locks. Switching between different upstream engines automatically disconnects the previous session and tears down orphaned processes cleanly.
2. **Unified Tool Surface (`d_*`)**: Exposes 15 curated high-level tools (inspect project tree, read/write SCL & LAD blocks, hardware diagnostics) plus `d_call` to passthrough raw upstream endpoints when needed.
3. **Atomic "Finish" Workflow (`d_finish`)**: Enforces a strict commit flow: switch offline → run full consistency check/compilation → refuse to save if errors exist. Your project is never saved in a broken state.
4. **Built-in Engineering Knowledge**: Packages four field-tested skill rulebooks (`tia-portal-ops`, `siemens-v20-ops`, `siemens-s7-1200-1500-programming`, and `plc-skill`) so the LLM writes IEC 61131-3 compliant code out of the box.

---

### Tool Overview (`d_*`)

| Tool | Description |
|---|---|
| `d_status` | Inspect active connections, exclusive locks, and process health. |
| `d_doctor` | Environment diagnostics: checks Openness user group, running TIA versions, and port conflicts. |
| `d_versions` | List installed Siemens TIA Portal major versions on the host machine. |
| `d_use` | Switch upstream engine (Upstream A or B) with automatic cleanup of previous connections. |
| `d_connect` | Attach to an open TIA Portal project instance. |
| `d_tree` | Recursively read PLC device structure, block groups, and hardware layout. |
| `d_read_block` | Read block code (SCL / LAD / DB / UDT) from the project. |
| `d_write_block` | Compile and write logic into a block. |
| `d_compile` | Trigger PLC software/hardware compilation and retrieve diagnostic error logs. |
| `d_save` | Save changes to the active TIA project. |
| `d_offline` | Safely disconnect session and release Openness locks. |
| `d_download` | Download compiled software changes to target PLC / PLCSIM. |
| `d_finish` | Atomic finalization: switch offline → compile (requires 0 errors) → save project. |
| `d_list_tools` | Query all underlying upstream tools available in current session. |
| `d_call` | Forward arbitrary tool invocations directly to the active upstream. |

---

### Quick Start

#### Prerequisites
- **OS**: Windows 10 / 11 (64-bit)
- **Siemens TIA Portal**: V15 through V21.1 installed.
- **Permissions**: Current Windows user must belong to the **`Siemens TIA Openness`** user group (*Computer Management → Local Users and Groups → Groups*).

#### Installation
1. Extract or clone this repository into a permanent directory (avoid spaces in path).
2. Run `安装.bat` (or execute `node gateway/install.js`).
   - The installer automatically detects installed AI clients (opencode, WorkBuddy, etc.) and registers the gateway configuration.
3. Restart your AI client.

---

### Typical Agent Interaction

```text
User: "Connect to the V20 instance and check the active project tree."
Agent -> d_connect(version: "V20") -> d_tree()

User: "Write an S7-1500 motor control block with E-stop and overload interlocks."
Agent -> d_write_block(name: "FB_MotorControl", lang: "SCL", code: "...")

User: "Compile and save if clean."
Agent -> d_finish()  // Offline compile check; saves only if 0 errors.
```

---

### Included Skills

- **`tia-portal-ops`**: Operational rules, tool mappings, and conflict arbitration across multiple upstreams.
- **`siemens-v20-ops`**: V20-specific operational quirks, LAD Update 4 compatibility, and HMI boundary constraints.
- **`siemens-s7-1200-1500-programming`**: Siemens official programming style guide (V2.0, 78 rules), memory optimization, and LGF library integration.
- **`plc-skill`**: IEC 61131-3 logic design, state machines, and vendor interlock standards.

---

### License

This project is licensed under the MIT License.
