# Benchmarks Offline Audit & Phase 2 Remediation Plan

**Audit Scope**: `D:\TIA_MCP\benchmarks\` (`runner/`, `golden_library/`, `test_vectors/`, `logs/`)  
**Execution Mode**: Phase 1 offline audit snapshot (§1–§4) superseded by **Phase 2 Verified Closure (§5)** — all Priority 1 & Priority 2 fixes applied and verified on TIA Portal V20 + PLCSIM Advanced V7.0.

---

## 1. Verified Baseline Numbers

Observed via `D:\TIA_MCP\delivery\TIA-MCP-Gateway-D-v1.4.3\gateway\runtime\node.exe`:

| Script & Arguments | Observed Result |
|---|---|
| `validate-vectors.js --strict` | `blocks=15, cases=135, steps=228, manifestDevs=74, errors=0, warnings=0` |
| `offline-eval.js --mode raw` | `blocks=15, cases=75/135, steps=228 (direct=119, adapted=0, privInit=0, knownVecMismatch=0, uncatalogedFail=109)` |
| `offline-eval.js --mode manifest` | `blocks=15, cases=135/135, steps=228 (direct=115, adapted=27, privInit=20, knownVecMismatch=66, uncatalogedFail=0)` |
| `generate-plc-harness.js --check-only` | `Blocks: 15 \| Cases: 118/135 executed (17 skipped) \| Steps: 213 \| LintErrors: 0 \| Warnings: 0` |

Step reconciliation for `generate-plc-harness.js --check-only`:  
`228 vector steps - 18 skipped steps (17 skipped cases; A08 TC06 has 2 steps) + 3 A02 prefixSteps = 213 plannedSteps`.

Manifest rule reconciliation (`deviation-manifest.json`, **74** total rules):
- By `plcHarnessAction`: `skip_vector_scl_mismatch=42`, `run_prefix_sequence=15`, `insert_false_edge_cycle=7`, `run_extra_settle_scan=5`, `skip_untestable_private_state=5` (`42 + 15 + 7 + 5 + 5 = 74`).
- By `offlineEvalAction`: `report_vector_spec_mismatch=32`, `adapt_step_timing_and_check_known=10` (42 total rules covering the `66 knownVecMismatch` steps), `inject_private_var=20` (`20 privInit` steps; +4 `knownVecMismatch` rules also inject `privateInit` = 24 rules with `privateInit`), `insert_edge_reset_cycle=7`, `adapt_cycles=5`.
- Note: 5 multi-step `TC02` rules (`B01`, `B02`, `B04`, `B05`, `B07`) span both `KNOWN_VECTOR_MISMATCH` and `PASS_WITH_ADAPTED_TIMING` steps (`42 + 20 + 17 - 5 = 74`).

---

## 2. Root-Cause Breakdown of All `66 knownVecMismatch` Steps (42 Rules)

### 2.1 Bucket A — Actual SCL Block Bugs / Priority & Safety-Spec Defects (12 steps / 12 rules)
- **Unambiguous functional bugs (2 steps / 2 rules)**:
  - `B07 TC06#s1` (`DEV-B07-TC06-WATCHDOG-MISSING-IN-STEP10`): `FB_FIO_Assembler.scl:168-186` (`#STEP_FEED_BOTH`) never calls `#instWatchdog` (unlike steps 20..90), so 6000ms starvation never times out; also compounded by write-only `ioHmi_in.iCurrentStep=10` private-state gap.
  - `A05 TC04#s1` (`DEV-A05-TC04-CLEAR-AND-ENQ`): `FB_RingFifo.scl:63-109` clears pointers on `#clear`, then still runs `#tempEnqRise` in the same scan instead of gating enqueue (`count=1, head=999` vs expected `0`).
- **SCL priority / reset / output-semantics defects (10 steps / 10 rules)**:
  - `A03 TC01#s1, TC02#s2, TC02#s4, TC08#s2, TC09#s1` (5 steps / 5 rules): `FB_CylinderCtrl.scl:137-144` continuously holds `coilExtend`/`coilRetract` energized when `doubleSolenoid=TRUE` even at target limit (`sensorExtended`/`sensorRetracted`), whereas vectors expect coil cut on arrival.
  - `A08 TC01#s1, TC07#s2, TC09#s1` (3 steps / 3 rules): `FB_DualEStopInterlock.scl:136` computes `#error := (NOT #statSafetyLatched) OR #statDiscrepancyFault;`, asserting `error=TRUE` during normal `STATUS_WAIT_RESET (16#7001)` (`TC09#s1` also uses `privateInit`).
  - `A07 TC08#s1` (1 step / 1 rule): `FB_ModbusPoller.scl:136-144` evaluates `IF #reqDone ... ELSIF #reqError` — giving completion priority over simultaneous error (`diSuccessCount=1` vs vector fault priority `0`; also uses `privateInit`).
  - `A07 TC09#s1` (1 step / 1 rule): `FB_ModbusPoller.scl:90-98` clears fault counters on `reset` without resetting `#statStationIdx := 1` (also uses `privateInit` + `scanCount: 3`).

### 2.2 Bucket B — Test-Vector Expectation or Premature-Stimulus Errors (22 steps / 22 rules)
- `A01` (5 steps: `TC03#s1, TC04#s1, TC05#s1, TC06#s1, TC08#s2`): Expect non-zero scaled outputs/alarms during `ERR_WIRE_BREAK (16#8401)` or `ERR_LIMIT_CFG (16#8201)`, whereas `FC_AnalogScaleAlarm.scl` zeroes `#tempScaled` and suppresses alarms.
- `A02 TC04#s1` (1 step): Expects `bResetCmd=FALSE` while `enable=FALSE`, whereas `FB_LowPassFilter.scl` returns early before clearing `bResetCmd`.
- `A04 TC02#s3` (1 step): Prematurely sets `fbkRev=TRUE` before 1s deadband completes, blocking `STATE_REV`.
- `A08 TC06#s2, TC08#s1` (2 steps): `TC06#s2` expects dual E-Stop press alone to clear discrepancy fault (SCL requires release + reset edge); `TC08#s1` expects `resetRequired=TRUE` while `feedbackLoopOk=FALSE`.
- `B03 TC02#s5, s6` (2 steps): Expect 1-scan staggered upstream ZPA release vs combinational same-scan release.
- `B04 TC05#s1` (1 step): Expects `IDLE(0)` on `limit0 AND limit90` conflict vs `STEP_FAULT(99 / 16#8401)`.
- `B05 TC04#s2, TC08#s1` (2 steps): Expect `targetPosition=0` on reset (SCL preserves `12`) and `iCurrentStep=0` on invalid `targetCell=99` (`STEP_FAULT(99)`).
- `B06` (8 steps: `TC01#s1, TC02#s2, TC02#s3, TC03#s1, TC04#s1, TC06#s1, TC07#s1, TC07#s2`): 4 expect non-zero `rControlError` when PID disabled/`eStopOk=FALSE`/`dtSec=0`; 3 omit derivative kick / P+D terms; 1 expects `16#7000` instead of `16#0000` when `enable=TRUE` in Manual.

### 2.3 Bucket C — Black-Box Private / Write-Only State Gap + Expectation Mismatch (2 steps / 2 rules)
- `A07 TC07#s1` (`DEV-A07-TC07-STATION2-STATE`): Attempts to set station via write-only `ioHmi_in.iActiveStationIdx=2` while disabled (`FB_ModbusPoller.scl:101-108` resets `statStationIdx := 1`).
- `B01 TC05#s1` (`DEV-B01-TC05-PRIVATE-STEP10`): Requires `privateInit` (`statStep=10, statRunning=true`) because `ioHmi_in.iCurrentStep` is write-only, plus vector expects `loadRoller=FALSE` vs `TRUE`.

### 2.4 Bucket D — Multi-Step `TC02` Timing / Pulse Shorthand & Cascading Stimulus Errors (30 steps / 6 rules)
- `A07 TC02#s4` (1 step): Gives `20ms` (< `T#50ms` gap) and expects `currentStation=2` while `FB_ModbusPoller.scl:168-176` wraps to `1` on `STATUS_FINISHED`.
- `B01 TC02#s1,s3,s4,s6` (4 steps): `loadRoller` / `conveyorEntry` / `conveyorExit` expectations diverge from step state outputs.
- `B02 TC02#s1..s6,s9,s10` (8 steps): `exitConveyor` remains `TRUE` during active cycle vs vector `FALSE`.
- `B04 TC02#s4,s8,s9` (3 steps): `entryConveyor=TRUE` in `STEP_WAIT_ENTRY`, immediate `diRoutedCount=2` in `s8`, stale `ioHmi_in.diRoutedCount=1` in `s9`.
- `B05 TC02#s2..s10` (9 steps): `s2` stimulus sets `atMiddle=FALSE` (`FB_FIO_AutomatedWarehouse.scl` requires `atMiddle=TRUE`), freezing at `STEP_MOVE_SRC(10)` across `s2..s10`.
- `B07 TC02#s4,s7,s8,s9,s10` (5 steps): `s4` releases `clampLid`; `s7` sets `movingZ=TRUE`, stalling step 60 and triggering drop-part `STEP_FAULT(99/16#8401)` across `s8..s10` (`partLeaving` also missing in `s10`).

*(Remaining manifest steps: `20 privInit` = 3 `A02` executed via `prefixSteps`, 12 skipped via `run_prefix_sequence` without `prefixSteps`, 5 skipped via `skip_untestable_private_state` on `B01/B02/B04/B05/B07 TC09#s1`; `27 adapted` = 7 omitted falling-edge reset cycles + 20 scan-latency/TON-settle/pulse-ordering adaptations.)*

---

## 3. PLCSIM Blockers, Guaranteed Failures & Over-Masking Defects

### 3.1 Guaranteed PLCSIM Run Failures (6 steps across 5 cases in 3 blocks under `10ms` / `timeScale=1.0` / `marginMs=20`)
1. **`A07 FB_ModbusPoller TC02#s3` (`DEV-A07-TC02-S3-SCAN-LATENCY`)**: `resolveHarnessStepTiming` (`generate-plc-harness.js:312-317`) converts `overrideScanCount: 5` (`>= 5` on `ton_time`) to `ton_wait` (`waitMs = 70ms`). `FB_ModbusPoller.scl:125-133` asserts `mbReq=TRUE` for a single scan (`STATE_SEND_REQ`) upon `T#50ms` `instGapTimer` expiry and immediately transitions to `STATE_WAIT_RESP` (`mbReq=FALSE`), so at `70ms` `out.mbReq` fails.
2. **`A07 FB_ModbusPoller TC02#s4` (`DEV-A07-TC02-S4-GAP-DURATION`)**: Cascaded from `s3` plus `stepOverrides["4"].scanCount=6` -> `ton_wait(waitMs = 80ms)` (> `T#50ms` gap). `FB_ModbusPoller` finishes station 2 and starts poll #3 (`diSuccessCount=3, status=16#7002` vs expected `2, 16#0000`).
3. **`A07 FB_ModbusPoller TC08#s1` (`DEV-A07-TC08-STATION2-STATE`)**: Uses `privateInit` without `prefixSteps`, while `plcHarnessAction='skip_vector_scl_mismatch'` with `stepOverrides["1"]`. `generate-plc-harness.js:413-415` only skips `run_prefix_sequence`, and `:500` (`&& !d.stepOverrides`) skips `affectedFields` masking (leaving only `knownHmiMismatch: ["diSuccessCount"]` masked). `instDut_8` starts at `statStationIdx=1`, failing `out.currentStation` and `hmi.iActiveStationIdx` (`expected=2, actual=1`).
4. **`A07 FB_ModbusPoller TC09#s1` (`DEV-A07-TC09-SCAN-LATENCY`)**: Same skip bypass + `privateInit: {statState: 999}`. Starting at `statState=0` reaches `STATE_WAIT_RESP` on scan 3 (`mbReq=FALSE` vs `TRUE`).
5. **`A08 FB_DualEStopInterlock TC09#s1` (`DEV-A08-TC09-RESET-STUCK-TRUE`)**: Same skip bypass + `privateInit: {statResetOld: true}`. Without `statResetOld=TRUE`, `resetButton=TRUE` creates a rising edge on scan 1 and latches safety, failing 6 unmasked fields (`safetyEnableOut`, `resetRequired`, `status`, `bSafeToRun`, `bWaitReset`, `wStatus`) and invalidating `TC09#s2`.
6. **`B01 FB_FIO_SortingByHeight TC05#s1` (`DEV-B01-TC05-PRIVATE-STEP10`)**: Same skip bypass + `privateInit: {statStep: 10, statRunning: true}`. `instDut_5` stays in `IDLE(0)`, failing 7 unmasked fields.

### 3.2 Openness Pre-Header Comment Blocker (`A08`) & Stray File
- **Openness import blocker on `A08`**: `D:\TIA_MCP\benchmarks\golden_library\scl\FB_DualEStopInterlock.scl:1` has a leading `//` comment line before `FUNCTION_BLOCK "FB_DualEStopInterlock"`. `run-plcsim-e2e.js:497-505,539-540` (`importExternalScl`) copies and imports `target.dutPath` verbatim without stripping pre-header text, which TIA Openness rejects on external `.scl` import.
- **Stray alias file in `golden_library/scl/`**: `D:\TIA_MCP\benchmarks\golden_library\scl\A01_FC_AnalogScaleAlarm.scl` is an uncleaned copy created alongside `FC_AnalogScaleAlarm.scl` by `importExternalScl` (`run-plcsim-e2e.js:498`).

### 3.3 Zero-Assertion Over-Masking (`keptCount = 0+0`)
- In `generate-plc-harness.js:500-515`, whenever `affectedFields` includes any key outside `expectedOutputs.` / `expectedHmi_out.` (`touchesNonExpected`), **all** output and HMI assertions on that step are masked out:
  - `A04 TC02#s3` (`DEV-A04-TC02-S3-EARLY-FBKREV`): `inputs.fbkRev` triggers full blanking (0 assertions vs 6 checked in `offline-eval`).
  - `A07 TC07#s1` (`DEV-A07-TC07-STATION2-STATE`): `ioHmi_in.iActiveStationIdx` / `statStationIdx` triggers full blanking (0 assertions vs 8 checked in `offline-eval`).
  - `B07 TC06#s1` (`DEV-B07-TC06-WATCHDOG-MISSING-IN-STEP10`): `ioHmi_in.iCurrentStep` triggers full blanking (0 assertions while waiting 6020ms).

### 3.4 Additional Sensitivity & Linter Notes
- `--time-scale < 1.0` breaks `A03 TC05` (`FB_CylinderCtrl.scl:90` hardcoded `PT := T#200ms`), `A07 TC02#s2` (`20ms * 0.5 + 20ms margin = 30ms > 25ms` scaled gap), and `A06 TC02#s1` at `0.2`. `A07 TC02#s2` is also sensitive to OB scan jitter (`>= 25ms` or `--margin-ms >= 50`).
- Static validator/linter bugs: `generate-plc-harness.js:1358` falsely flags `VAR CONSTANT` inside `FUNCTION` blocks; `generate-plc-harness.js:752-756` emits `DINT#${ms}` without `Math.round(ms)`; `validate-vectors.js:171` parses `VAR CONSTANT` into `sections.VAR` and does not flag `privateInit` without `prefixSteps` under `skip_vector_scl_mismatch`.

---

## 4. Ready-to-Apply Phase 2 Remediation Plan (After `22e422b4` Unlocks PLCSIM)

### Priority 1 — Pre-E2E Runner / Harness Fixes (Preserve Baseline Comparability)
1. **Fix `importExternalScl` pre-header handling & clean stray alias**:
   - In `D:\TIA_MCP\benchmarks\runner\run-plcsim-e2e.js:497-505`, write temporary `.scl` copies into `harnessDir` (not `golden_library/scl/`), strip leading comments/whitespace before the first `(DATA_BLOCK|FUNCTION_BLOCK|FUNCTION|ORGANIZATION_BLOCK)` token while preserving UTF-8 BOM, and clean up temporary copies.
   - Delete stray `D:\TIA_MCP\benchmarks\golden_library\scl\A01_FC_AnalogScaleAlarm.scl`.
2. **Guard `privateInit` steps without `prefixSteps` against un-initialized execution (`A07 TC08/TC09`, `A08 TC09`, `B01 TC05`)**:
   - In `D:\TIA_MCP\benchmarks\runner\generate-plc-harness.js:413-415`, include `Boolean(d.privateInit)` alongside `d.plcHarnessAction === 'run_prefix_sequence'` when `prefixSteps` is absent (or author real public `prefixSteps` for `A08 TC09`, `B01 TC05`, `B03 TC05/TC06` while ensuring `buildBlockPlan` `:491-529` applies both `prefixSteps` and `stepOverrides` masks).
   - Add a `validate-vectors.js` check rejecting `privateInit` without `prefixSteps` unless action is `run_prefix_sequence` or `skip_untestable_private_state`.
3. **Fix `A07 TC02#s3` / `TC02#s4` `ton_wait` overshoot**:
   - In `D:\TIA_MCP\benchmarks\runner\generate-plc-harness.js:312-319`, avoid blindly promoting `overrideScanCount` (`5`, `6`) to wall-clock `ton_wait` when targeting a single-scan `mbReq` pulse or `T#50ms` gap timer (raise promotion threshold or allow explicit `timingMode: 'scan_cycles'`), and align `FB_ModbusPoller` test timing/OB scan determinism (e.g., `OB30` cyclic interrupt or larger `tInterFrameDelay`).
4. **Eliminate `keptCount = 0+0` over-masking**:
   - In `D:\TIA_MCP\benchmarks\runner\generate-plc-harness.js:500-515`, when `affectedFields` explicitly names at least one `expectedOutputs.` or `expectedHmi_out.` key, mask **only** those named keys (retaining full-step fallback only if zero `expected*` keys are named), matching `offline-eval.js`.

### Priority 2 — Post-Baseline SCL Block & Vector Cleanups
5. **Fix confirmed SCL defects in `golden_library/scl/` (and retire corresponding manifest rules)**:
   - `FB_FIO_Assembler.scl:168-186`: Add `#instWatchdog` timeout handling in `#STEP_FEED_BOTH`.
   - `FB_RingFifo.scl:63-109`: Inhibit same-scan `#tempEnqRise`/`#tempDeqRise` when `#clear OR #ioHmi.bClearCmd` is active.
   - `FB_ModbusPoller.scl:90-98,136-144`: Reset `#statStationIdx := 1;` on `#reset`, and prioritize `IF #reqError OR #instTimeoutTimer.Q ... ELSIF #reqDone`.
   - Resolve spec decisions on `FB_DualEStopInterlock.scl:136` (`error` during `STATUS_WAIT_RESET`) and `FB_CylinderCtrl.scl:137-144` (`doubleSolenoid` coil cutoff at limit).
6. **Clean up the 22 pure vector errors, `TC02` stimulus sequences, and missing edge-reset steps** in `benchmarks/test_vectors/*.json` to drive raw pass rate toward 100%.
7. **Harden `lintSclSource` & `validate-vectors.js`**: Fix `VAR CONSTANT` regexes (`generate-plc-harness.js:1358`, `validate-vectors.js:171`), round `DINT#${ms}` (`generate-plc-harness.js:752-756`), and strip `(* ... *)` comments / LHS indexing in `DA008` lint checks.

---

## 5. Phase 2 Remediation & Verification Closure

All Priority 1 runner/harness defects (§4 items 1–4) and Priority 2 golden SCL / vector / linter fixes (§4 items 5–7) have been implemented and closed:

1. **Runner / Harness Hardening (`run-plcsim-e2e.js`, `generate-plc-harness.js`, `validate-vectors.js`)**:
   - `importExternalScl` stages temporary copies under OS temp (`os.tmpdir()/tia_plcsim_e2e_*/scl_stage`), strips pre-header `//` comments before the first block keyword while retaining UTF-8 BOM, and stray `golden_library/scl/A01_FC_AnalogScaleAlarm.scl` was removed.
   - Added `privateInit` without `prefixSteps` guard (`generate-plc-harness.js` & `validate-vectors.js --strict`), resolved `A07 TC02#s3/s4` `ton_wait` overshoot, eliminated `keptCount = 0+0` over-masking when `affectedFields` explicitly names expected outputs, and hardened `lintSclSource` (`VAR CONSTANT`, `Math.round` for `DINT#`, comment/string/LHS-stripped `DA008`).
   - Added transient `DownloadToPlc` recreate-and-retry, strict S7 live-read item validation + `plcsim_read_tags` fallback preservation, >10s poll stall recovery, and wedged `TiaMcpServer` session recycling (`restartTiaSession`) in `run-plcsim-e2e.js`.
2. **Golden SCL Fixes & Vector Convergence**:
   - Fixed the 5 confirmed golden SCL defects (`FB_FIO_Assembler.scl`, `FB_RingFifo.scl`, `FB_ModbusPoller.scl`, `FB_DualEStopInterlock.scl`, `FB_CylinderCtrl.scl`) and updated `offline-eval.js`.
   - Fixed the 22 Bucket B expectation/stimulus errors, 7 omitted edge-reset sequences, and 6 Bucket D `TC02` sequences in `benchmarks/test_vectors/*.json`; converged `deviation-manifest.json` from `74` rules (`66` known mismatches) down to **`32` rules (`0` `VECTOR_SPEC_MISMATCH`)**: `plcHarnessAction` (`run_prefix_sequence=19`, `run_extra_settle_scan=7`, `skip_untestable_private_state=6`), `offlineEvalAction` (`inject_private_var=25`, `adapt_cycles=7`).
3. **Final Verified Metrics (Bundled Node `v22.22.2`, TIA Portal V20 + PLCSIM Advanced V7.0)**:

| Check / Command | Verified Result |
|---|---|
| `validate-vectors.js --strict` | `blocks=15, cases=135, steps=236, manifestDevs=32, errors=0, warnings=0` |
| `offline-eval.js --mode raw` | `blocks=15, cases=112/135, steps=236 (direct=207, adapted=0, privInit=0, knownVecMismatch=0, uncatalogedFail=29)` |
| `offline-eval.js --mode manifest` | `blocks=15, cases=135/135, steps=236 (direct=204, adapted=7, privInit=25, knownVecMismatch=0, uncatalogedFail=0)` |
| `generate-plc-harness.js --check-only` | `Blocks: 15 \| Cases: 117/135 executed (18 skipped) \| Steps: 225 \| LintErrors: 0 \| Warnings: 0` |
| `test-lad-harness.js` | `total=9, passed=9, failed=0` |
| `run-plcsim-e2e.js --block all --lad-dir ...\lad_test` | **`19/19 blocks passed` (`0 failed`) \| `138/138 test cases passed` \| `0E/0W` \| `sharp7-s7-102` (`DB1`) \| `1572.4s`** |
