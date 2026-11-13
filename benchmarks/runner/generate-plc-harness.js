#!/usr/bin/env node
'use strict';

/**
 * Route 1 PLC Self-Driving Harness Generator (P2-2 Phase 2)
 *
 * Generates TIA Portal V20 compliant SCL test harnesses for the 15 golden
 * benchmark blocks without relying on online MCP tag-write tools:
 *   - 01_DB_TestSummary.scl      (Non-optimized { S7_Optimized_Access := 'FALSE' } S7 status DB)
 *   - 02_FB_Harness_<Block>.scl  (Stateful step-sequencer + assertion engine)
 *   - 03_DB_Harness_<Block>.scl  (Instance DB for FB_Harness_<Block>)
 *   - 04_OB_TestRunner_<Block>.scl (Free cyclic OB driving the harness once on PLC RUN)
 *
 * All generated .scl files are written with UTF-8 BOM and validated against the
 * TIA V20 compile anti-pattern rules (DA008, SE002, AL001, PC008, Openness).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  parseS7TimeToMs,
  parseS7Word,
  parseScanCycleOrDuration,
  parseSclInterface,
  parseUdtMembers,
} = require('./validate-vectors');

const RUNNER_DIR = __dirname;
const BENCHMARKS_DIR = path.resolve(RUNNER_DIR, '..');
const DEFAULT_SCL_DIR = path.join(BENCHMARKS_DIR, 'golden_library', 'scl');
const DEFAULT_UDT_DIR = path.join(BENCHMARKS_DIR, 'golden_library', 'udt');
const DEFAULT_VECTORS_DIR = path.join(BENCHMARKS_DIR, 'test_vectors');
const DEFAULT_MANIFEST_PATH = path.join(RUNNER_DIR, 'deviation-manifest.json');
const DEFAULT_OUT_DIR = path.join(BENCHMARKS_DIR, 'plc_harness_out');

const DEFAULT_TIMING_MODE = {
  FC_AnalogScaleAlarm: 'combinational',
  FB_LowPassFilter: 'combinational',
  FB_CylinderCtrl: 'ton_time',
  FB_MotorRevCtrl: 'ton_time',
  FB_RingFifo: 'combinational',
  FC_ButtonDebounceToggle: 'scan_cycle_param',
  FB_ModbusPoller: 'ton_time',
  FB_DualEStopInterlock: 'ton_time',
  FB_FIO_SortingByHeight: 'ton_time',
  FB_FIO_PickAndPlace: 'ton_time',
  FB_FIO_BufferConveyor: 'ton_time',
  FB_FIO_Turntable: 'ton_time',
  FB_FIO_AutomatedWarehouse: 'ton_time',
  FB_FIO_TankLevelPID: 'dt_sec_param',
  FB_FIO_Assembler: 'ton_time',
};

function printHelp() {
  const text = `
Route 1 PLC Self-Driving Harness Generator (TIA Portal V20 SCL)

Usage:
  node generate-plc-harness.js [options]

Options:
  --block <name|id[,...]>       Block name (FC_AnalogScaleAlarm), ID (A01), or "all" (default: all)
  --out-dir <dir>               Output directory (default: ${DEFAULT_OUT_DIR})
  --scl-dir <dir>               Golden SCL directory (default: ${DEFAULT_SCL_DIR})
  --udt-dir <dir>               Golden UDT XML directory (default: ${DEFAULT_UDT_DIR})
  --vectors-dir <dir>           Test vectors JSON directory (default: ${DEFAULT_VECTORS_DIR})
  --manifest <file>             Deviation manifest JSON (default: ${DEFAULT_MANIFEST_PATH})
  --manifest-mode <mode>        "manifest" (default if file exists) or "raw" (ignore manifest skips/overrides)
  --time-scale <factor>         Scale factor for TON wait & non-zero TIME pins (default: 1.0)
  --margin-ms <ms>              Safety margin added to TON_WAIT PT (default: 20)
  --scan-ms <ms>                Assumed OB scan duration in ms for timing classification (default: 10)
  --case-isolation <mode>       "auto" (manifest policy), "per_case_reset", or "cumulative" (default: auto)
  --include-private-dep         Execute manifest run_prefix_sequence cases even without prefixSteps
  --single-file                 Also write combined Harness_<Block>.scl per block
  --check-only                  Run generation and built-in anti-pattern linter without writing files
  --json                        Output machine-readable JSON report
  -h, --help                    Show this help text
`;
  process.stdout.write(text.trimStart() + '\n');
}

function parseCliArgs(argv) {
  const opts = {
    blocks: ['all'],
    outDir: DEFAULT_OUT_DIR,
    sclDir: DEFAULT_SCL_DIR,
    udtDir: DEFAULT_UDT_DIR,
    vectorsDir: DEFAULT_VECTORS_DIR,
    manifestPath: DEFAULT_MANIFEST_PATH,
    manifestMode: null, // auto-resolve below
    timeScale: 1.0,
    marginMs: 20,
    scanMs: 10,
    caseIsolation: 'auto',
    includePrivateDep: false,
    singleFile: false,
    checkOnly: false,
    json: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const nextVal = () => {
      if (i + 1 >= argv.length) throw new Error(`Missing value for option ${arg}`);
      i += 1;
      return argv[i];
    };
    if (arg === '-h' || arg === '--help') {
      opts.help = true;
    } else if (arg === '--block') {
      opts.blocks = nextVal().split(',').map((s) => s.trim()).filter(Boolean);
    } else if (arg === '--out-dir') {
      opts.outDir = path.resolve(nextVal());
    } else if (arg === '--scl-dir') {
      opts.sclDir = path.resolve(nextVal());
    } else if (arg === '--udt-dir') {
      opts.udtDir = path.resolve(nextVal());
    } else if (arg === '--vectors-dir') {
      opts.vectorsDir = path.resolve(nextVal());
    } else if (arg === '--manifest') {
      opts.manifestPath = path.resolve(nextVal());
    } else if (arg === '--manifest-mode') {
      const m = nextVal();
      if (m !== 'manifest' && m !== 'raw') {
        throw new Error(`Invalid --manifest-mode "${m}". Expected "manifest" or "raw".`);
      }
      opts.manifestMode = m;
    } else if (arg === '--time-scale') {
      const n = Number(nextVal());
      if (!Number.isFinite(n) || n <= 0 || n > 10) {
        throw new Error(`Invalid --time-scale "${n}". Must be within (0, 10].`);
      }
      opts.timeScale = n;
    } else if (arg === '--margin-ms') {
      const n = Number(nextVal());
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        throw new Error(`Invalid --margin-ms "${n}". Must be a non-negative integer.`);
      }
      opts.marginMs = n;
    } else if (arg === '--scan-ms') {
      const n = Number(nextVal());
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`Invalid --scan-ms "${n}". Must be > 0.`);
      }
      opts.scanMs = n;
    } else if (arg === '--case-isolation') {
      const ci = nextVal();
      if (ci !== 'auto' && ci !== 'per_case_reset' && ci !== 'cumulative') {
        throw new Error(`Invalid --case-isolation "${ci}". Expected auto|per_case_reset|cumulative.`);
      }
      opts.caseIsolation = ci;
    } else if (arg === '--include-private-dep') {
      opts.includePrivateDep = true;
    } else if (arg === '--single-file') {
      opts.singleFile = true;
    } else if (arg === '--check-only') {
      opts.checkOnly = true;
    } else if (arg === '--json') {
      opts.json = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return opts;
}

function stripBom(str) {
  return str.charCodeAt(0) === 0xfeff ? str.slice(1) : str;
}

function unquoteType(typeStr) {
  return String(typeStr || '').trim().replace(/^"|"$/g, '');
}

function defaultJsValueForType(s7Type) {
  switch (s7Type) {
    case 'Bool':
      return false;
    case 'Int':
    case 'DInt':
      return 0;
    case 'Real':
      return 0.0;
    case 'Time':
      return 0;
    case 'Word':
      return '16#0000';
    default:
      throw new Error(`Unsupported S7 type "${s7Type}"`);
  }
}

function formatSclReal(num) {
  const n = Number(num);
  if (!Number.isFinite(n)) throw new Error(`Invalid Real literal: ${num}`);
  if (Object.is(n, -0) || n === 0) return '0.0';
  const abs = Math.abs(n);
  if (abs >= 1e-6 && abs < 1e9) {
    // Emit clean decimal string (never exponential unless huge/tiny, always with '.')
    const fixed = Number(n.toPrecision(10)).toString();
    if (!/[eE]/.test(fixed)) {
      return fixed.includes('.') ? fixed : `${fixed}.0`;
    }
  }
  let s = n.toExponential(7).replace(/\.?0+e/, 'e');
  if (!s.split('e')[0].includes('.')) {
    const [mant, exp] = s.split('e');
    s = `${mant}.0e${exp}`;
  }
  return s;
}

function formatSclTime(rawVal, timeScale, scaleNonZero) {
  const ms = typeof rawVal === 'number' ? rawVal : parseS7TimeToMs(rawVal);
  if (ms === null || !Number.isFinite(ms)) {
    throw new Error(`Invalid TIME value: ${JSON.stringify(rawVal)}`);
  }
  const rounded = Math.round(ms);
  if (rounded <= 0) return 'T#0s';
  const finalMs = scaleNonZero && timeScale !== 1.0
    ? Math.max(1, Math.round(rounded * timeScale))
    : rounded;
  return `T#${finalMs}ms`;
}

function formatSclLiteral(s7Type, rawVal, opts = {}) {
  const { timeScale = 1.0, scaleNonZeroTime = false } = opts;
  const val = rawVal === undefined || rawVal === null ? defaultJsValueForType(s7Type) : rawVal;
  switch (s7Type) {
    case 'Bool':
      if (typeof val !== 'boolean') throw new Error(`Expected Bool, got ${JSON.stringify(val)}`);
      return val ? 'TRUE' : 'FALSE';
    case 'Int': {
      const n = Number(val);
      if (!Number.isInteger(n) || n < -32768 || n > 32767) {
        throw new Error(`Invalid Int literal: ${JSON.stringify(val)}`);
      }
      return `INT#${n}`;
    }
    case 'DInt': {
      const n = Number(val);
      if (!Number.isInteger(n) || n < -2147483648 || n > 2147483647) {
        throw new Error(`Invalid DInt literal: ${JSON.stringify(val)}`);
      }
      return `DINT#${n}`;
    }
    case 'Real':
      return formatSclReal(val);
    case 'Time':
      return formatSclTime(val, timeScale, scaleNonZeroTime);
    case 'Word': {
      const w = parseS7Word(val);
      if (w === null) throw new Error(`Invalid Word literal: ${JSON.stringify(val)}`);
      return `16#${w.toString(16).toUpperCase().padStart(4, '0')}`;
    }
    default:
      throw new Error(`Unsupported S7 type "${s7Type}" for literal ${JSON.stringify(val)}`);
  }
}

function formatDWordMask(bitIndexZeroBased) {
  if (bitIndexZeroBased < 0 || bitIndexZeroBased >= 32) return null;
  const val = (1 << bitIndexZeroBased) >>> 0;
  return `DWORD#16#${val.toString(16).toUpperCase().padStart(8, '0')}`;
}

/**
 * Scan a golden DUT .scl source for non-zero hardcoded `PT := T#...` calls
 * that cannot be scaled externally when `--time-scale < 1.0`.
 */
function detectHardcodedTimerPts(sclText) {
  const hits = [];
  const lines = stripBom(sclText).split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const code = lines[i].replace(/\/\/.*$/, '');
    const m = code.match(/\bPT\s*:=\s*(T#[0-9_a-zA-Z]+)/i);
    if (m) {
      const ms = parseS7TimeToMs(m[1]);
      if (ms !== null && ms > 0) {
        hits.push({ line: i + 1, literal: m[1], ms, statement: code.trim() });
      }
    }
  }
  return hits;
}

/**
 * Resolve execution timing for one test step on real PLCSIM V20 hardware.
 */
function resolveHarnessStepTiming(blockName, stepObj, policy, stepOverride, stepDev, options) {
  const timingMode = (policy && policy.timingMode) || DEFAULT_TIMING_MODE[blockName] || 'ton_time';
  const defaultScanMs = (policy && policy.defaultScanMs) || options.scanMs;
  const parsed = parseScanCycleOrDuration(stepObj.scanCycleOrDuration);
  const overrideCount =
    stepOverride && stepOverride.scanCount != null
      ? stepOverride.scanCount
      : stepDev && stepDev.overrideScanCount != null
        ? stepDev.overrideScanCount
        : null;
  const overrideDtMs =
    (stepOverride && stepOverride.scanDtMs) ||
    (stepDev && stepDev.overrideScanDtMs) ||
    defaultScanMs;

  if (overrideCount != null) {
    const explicitTimingMode =
      (stepOverride && stepOverride.timingMode) ||
      (stepDev && stepDev.overrideTimingMode) ||
      '';
    const hasStopOnMatch = Boolean(
      (stepOverride && stepOverride.stopWaitOnMatch) ||
      (stepDev && stepDev.stopWaitOnMatch)
    );
    const useTonWait =
      explicitTimingMode === 'ton_wait' ||
      (explicitTimingMode !== 'scan_cycles' &&
        timingMode === 'ton_time' &&
        (overrideCount >= 10 ||
          (overrideCount >= 5 && (hasStopOnMatch || (parsed && parsed.kind === 'duration_ms' && parsed.ms >= 50)))));
    if (useTonWait) {
      const baseFromOverride = overrideCount * overrideDtMs;
      const baseFromVec = parsed && parsed.kind === 'duration_ms' ? parsed.ms : 0;
      const nominalMs = Math.max(baseFromVec, baseFromOverride);
      const scaledMs = Math.max(1, Math.round(nominalMs * options.timeScale)) + options.marginMs;
      return { mode: 'ton_wait', nominalMs, waitMs: scaledMs, minScans: 2, scans: null };
    }
    return { mode: 'scan_cycles', nominalMs: overrideCount * overrideDtMs, waitMs: 0, minScans: overrideCount, scans: overrideCount };
  }

  if (!parsed) {
    return { mode: 'scan_cycles', nominalMs: defaultScanMs, waitMs: 0, minScans: 1, scans: 1 };
  }

  if (parsed.kind === 'scan_cycles') {
    const cycles = Math.max(1, parsed.cycles);
    return { mode: 'scan_cycles', nominalMs: cycles * defaultScanMs, waitMs: 0, minScans: cycles, scans: cycles };
  }

  // parsed.kind === 'duration_ms'
  if (timingMode === 'combinational' || timingMode === 'dt_sec_param') {
    return { mode: 'scan_cycles', nominalMs: parsed.ms, waitMs: 0, minScans: 1, scans: 1 };
  }

  if (timingMode === 'scan_cycle_param') {
    const pinMs =
      stepObj.inputs && typeof stepObj.inputs.scanCycleMs === 'number' && stepObj.inputs.scanCycleMs > 0
        ? stepObj.inputs.scanCycleMs
        : defaultScanMs;
    const scans = Math.max(1, Math.round(parsed.ms / pinMs));
    return { mode: 'scan_cycles', nominalMs: parsed.ms, waitMs: 0, minScans: scans, scans };
  }

  // ton_time
  if (parsed.ms <= options.scanMs) {
    return { mode: 'scan_cycles', nominalMs: parsed.ms, waitMs: 0, minScans: 1, scans: 1 };
  }
  const scaledMs = Math.max(1, Math.round(parsed.ms * options.timeScale)) + options.marginMs;
  return { mode: 'ton_wait', nominalMs: parsed.ms, waitMs: scaledMs, minScans: 2, scans: null };
}

/**
 * Resolve planned test cases, steps, skips, masks, and edge pulses for one block.
 */
function buildBlockPlan(blockInput, manifest, options) {
  const { vecJson, iface, udtName, udtMembers, hardcodedPts } = blockInput;
  const blockName = vecJson.blockName;
  const blockId = vecJson.blockId;
  const rawMode = options.manifestMode === 'raw';

  const tolerances = (manifest && manifest.tolerances) || {};
  const realAbs = typeof tolerances.realAbs === 'number' ? tolerances.realAbs : 1e-5;
  const realRel = typeof tolerances.realRel === 'number' ? tolerances.realRel : 1e-5;

  const policy =
    !rawMode && manifest && manifest.blockPolicies && manifest.blockPolicies[blockName]
      ? manifest.blockPolicies[blockName]
      : {
          blockId,
          blockType: iface.kind,
          timingMode: DEFAULT_TIMING_MODE[blockName] || 'ton_time',
          defaultScanMs: options.scanMs,
          caseIsolation: 'per_case_reset',
        };

  const effectiveIsolation =
    options.caseIsolation !== 'auto'
      ? options.caseIsolation
      : policy.caseIsolation || 'per_case_reset';

  const allDevs =
    !rawMode && manifest && Array.isArray(manifest.deviations)
      ? manifest.deviations.filter((d) => d.blockName === blockName)
      : [];

  const allEdgeResetPins = new Set();
  const allPulseTruePins = new Set();
  const planSteps = [];
  const caseSummaries = [];
  let activeDutCount = 0;

  for (let tcIdx = 0; tcIdx < vecJson.testCases.length; tcIdx += 1) {
    const tc = vecJson.testCases[tcIdx];
    const tcNum = tcIdx + 1;
    const tcDevs = allDevs.filter((d) => d.caseId === tc.caseId);

    // Check case-level skips in manifest mode
    if (!rawMode) {
      const untestable = tcDevs.find((d) => d.plcHarnessAction === 'skip_untestable_private_state');
      if (untestable) {
        caseSummaries.push({
          caseNum: tcNum,
          caseId: tc.caseId,
          status: 'SKIPPED',
          dutSlot: null,
          deviationId: untestable.id,
          reason: `skip_untestable_private_state: ${untestable.reason}`,
        });
        continue;
      }

      const privDep = tcDevs.find(
        (d) =>
          (d.plcHarnessAction === 'run_prefix_sequence' || d.privateInit) &&
          d.plcHarnessAction !== 'skip_untestable_private_state' &&
          (!Array.isArray(d.prefixSteps) || d.prefixSteps.length === 0)
      );
      if (privDep && !options.includePrivateDep) {
        caseSummaries.push({
          caseNum: tcNum,
          caseId: tc.caseId,
          status: 'SKIPPED',
          dutSlot: null,
          deviationId: privDep.id,
          reason: `skip_needs_prefix_sequence (privateInit without prefixSteps): ${privDep.reason}`,
        });
        continue;
      }
    }

    const dutSlot = iface.kind === 'FC' ? 0 : effectiveIsolation === 'cumulative' ? 1 : (activeDutCount += 1);
    if (iface.kind === 'FB' && effectiveIsolation === 'cumulative') {
      activeDutCount = 1;
    }

    const casePlanEntries = [];
    const defaultInitHmi = (vecJson.initialState && vecJson.initialState.ioHmi) || (tc.steps[0] && (tc.steps[0].ioHmi_in || tc.steps[0].ioHmi)) || {};

    // Prefix steps from manifest (if present alongside any non-untestable harness action)
    if (!rawMode) {
      const prefixDevs = tcDevs.filter(
        (d) =>
          d.plcHarnessAction !== 'skip_untestable_private_state' &&
          Array.isArray(d.prefixSteps) &&
          d.prefixSteps.length > 0
      );
      for (const pDev of prefixDevs) {
        for (const ps of pDev.prefixSteps) {
          const isTonPrefix = ps.mode === 'ton_wait' || (ps.waitMs != null && Number(ps.waitMs) > 0);
          let prefixTiming;
          if (isTonPrefix) {
            const nomMs = Math.max(1, Number(ps.waitMs) || options.scanMs);
            const scaledMs = Math.max(1, Math.round(nomMs * options.timeScale)) + options.marginMs;
            prefixTiming = {
              mode: 'ton_wait',
              nominalMs: nomMs,
              waitMs: scaledMs,
              minScans: Math.max(2, Number(ps.minScans || ps.scans) || 2),
              scans: null,
            };
          } else {
            const prefixScans = Math.max(1, Number(ps.scans) || 1);
            prefixTiming = {
              mode: 'scan_cycles',
              nominalMs: prefixScans * options.scanMs,
              waitMs: 0,
              minScans: prefixScans,
              scans: prefixScans,
            };
          }
          casePlanEntries.push({
            caseNum: tcNum,
            caseId: tc.caseId,
            dutSlot,
            stepNum: 0,
            isPrefix: true,
            deviationIds: [pDev.id],
            inputs: ps.inputs || {},
            ioHmiIn: ps.ioHmi_in || defaultInitHmi,
            expectedOutputs: {},
            expectedHmiOut: {},
            falseEdgePins: [],
            trueEdgePins: [],
            stopWaitOnMatch: false,
            timing: prefixTiming,
          });
        }
      }
    }

    // Actual test steps
    const caseAction = tcDevs.find((d) => d.step == null) || null;
    for (let sIdx = 0; sIdx < tc.steps.length; sIdx += 1) {
      const st = tc.steps[sIdx];
      const stepSpecificDevs = !rawMode ? tcDevs.filter((d) => d.step === st.step) : [];
      const activeDevs = [...stepSpecificDevs];
      if (caseAction && !activeDevs.includes(caseAction)) activeDevs.push(caseAction);

      let stepOverride = null;
      for (const d of activeDevs) {
        if (d.stepOverrides && d.stepOverrides[String(st.step)]) {
          stepOverride = d.stepOverrides[String(st.step)];
          break;
        }
      }
      const primaryTimingDev =
        stepSpecificDevs.find((d) => d.overrideScanCount != null) ||
        (caseAction && caseAction.overrideScanCount != null ? caseAction : null);

      const timing = resolveHarnessStepTiming(blockName, st, policy, stepOverride, primaryTimingDev, options);

      const falseEdgePins = [];
      const trueEdgePins = [];
      const maskedOutputs = new Set();
      const maskedHmi = new Set();

      if (!rawMode) {
        for (const d of stepSpecificDevs) {
          if (d.plcHarnessAction === 'insert_false_edge_cycle' && Array.isArray(d.edgePinsToPulse)) {
            for (const pin of d.edgePinsToPulse) {
              if (pin in iface.sections.VAR_INPUT && iface.sections.VAR_INPUT[pin] === 'Bool') {
                falseEdgePins.push(pin);
                allEdgeResetPins.add(pin);
              }
            }
          }
          if (d.plcHarnessAction === 'skip_vector_scl_mismatch' && !d.stepOverrides) {
            const affected = Array.isArray(d.affectedFields) ? d.affectedFields : [];
            let explicitCount = 0;
            for (const f of affected) {
              if (f.startsWith('expectedOutputs.')) {
                maskedOutputs.add(f.slice('expectedOutputs.'.length));
                explicitCount += 1;
              } else if (f.startsWith('expectedHmi_out.')) {
                maskedHmi.add(f.slice('expectedHmi_out.'.length));
                explicitCount += 1;
              } else if (f.startsWith('expectedHmi.')) {
                maskedHmi.add(f.slice('expectedHmi.'.length));
                explicitCount += 1;
              }
            }
            for (const k of d.knownOutputsMismatch || []) {
              maskedOutputs.add(k);
              explicitCount += 1;
            }
            for (const k of d.knownHmiMismatch || []) {
              maskedHmi.add(k);
              explicitCount += 1;
            }
            if (explicitCount === 0) {
              // No explicit output/HMI assertions named; suppress step assertions while still driving step
              for (const k of Object.keys(st.expectedOutputs || {})) maskedOutputs.add(k);
              for (const k of Object.keys(st.expectedHmi_out || st.expectedHmi || {})) maskedHmi.add(k);
            }
          }
        }
        if (stepOverride) {
          if (Array.isArray(stepOverride.pulseTrueBefore)) {
            for (const pin of stepOverride.pulseTrueBefore) {
              if (pin in iface.sections.VAR_INPUT && iface.sections.VAR_INPUT[pin] === 'Bool') {
                trueEdgePins.push(pin);
                allPulseTruePins.add(pin);
              }
            }
          }
          for (const k of stepOverride.knownOutputsMismatch || []) maskedOutputs.add(k);
          for (const k of stepOverride.knownHmiMismatch || []) maskedHmi.add(k);
        }
      }

      const rawExpOut = st.expectedOutputs || {};
      const rawExpHmi = st.expectedHmi_out || st.expectedHmi || {};
      const expectedOutputs = {};
      const expectedHmiOut = {};
      for (const [k, v] of Object.entries(rawExpOut)) {
        if (!maskedOutputs.has(k)) expectedOutputs[k] = v;
      }
      for (const [k, v] of Object.entries(rawExpHmi)) {
        if (!maskedHmi.has(k)) expectedHmiOut[k] = v;
      }

      casePlanEntries.push({
        caseNum: tcNum,
        caseId: tc.caseId,
        dutSlot,
        stepNum: st.step,
        isPrefix: false,
        deviationIds: activeDevs.map((d) => d.id),
        inputs: st.inputs || {},
        ioHmiIn: st.ioHmi_in || st.ioHmi || defaultInitHmi,
        expectedOutputs,
        expectedHmiOut,
        maskedOutputs: [...maskedOutputs],
        maskedHmi: [...maskedHmi],
        falseEdgePins: [...new Set(falseEdgePins)],
        trueEdgePins: [...new Set(trueEdgePins)],
        stopWaitOnMatch: Boolean(stepOverride && stepOverride.stopWaitOnMatch),
        timing,
      });
    }

    for (let idx = 0; idx < casePlanEntries.length; idx += 1) {
      const entry = casePlanEntries[idx];
      entry.isFirstInCase = idx === 0;
      entry.isLastInCase = idx === casePlanEntries.length - 1;
      entry.planUid = planSteps.length + 1;
      planSteps.push(entry);
    }

    caseSummaries.push({
      caseNum: tcNum,
      caseId: tc.caseId,
      status: 'PLANNED',
      dutSlot,
      stepsCount: casePlanEntries.length,
    });
  }

  // Deterministic 1-based assertion field catalog for diagnostic firstFailFieldIndex
  const fieldMap = [];
  for (const [pinName, pinType] of Object.entries(iface.sections.VAR_OUTPUT)) {
    fieldMap.push({ index: fieldMap.length + 1, bucket: 'expectedOutputs', name: pinName, type: pinType, isHmi: false });
  }
  for (const [memberName, memberType] of Object.entries(udtMembers)) {
    fieldMap.push({ index: fieldMap.length + 1, bucket: 'expectedHmi_out', name: memberName, type: memberType, isHmi: true });
  }

  const warnings = [];
  for (const s of planSteps) {
    if (!s.isPrefix) {
      const keptCount = Object.keys(s.expectedOutputs || {}).length + Object.keys(s.expectedHmiOut || {}).length;
      const maskedCount = (s.maskedOutputs ? s.maskedOutputs.length : 0) + (s.maskedHmi ? s.maskedHmi.length : 0);
      if (keptCount === 0 && maskedCount > 0) {
        warnings.push(`${blockName} ${s.caseId}#s${s.stepNum} has 0 remaining assertions after masking (${maskedCount} masked)`);
      }
    }
  }
  if (options.timeScale < 1.0 && hardcodedPts.length > 0) {
    warnings.push(
      `${blockName} contains ${hardcodedPts.length} hardcoded internal TIME literal(s) (${hardcodedPts
        .map((h) => `L${h.line}:${h.literal}`)
        .join(', ')}) that --time-scale=${options.timeScale} cannot accelerate inside the DUT.`
    );
  }

  return {
    blockId,
    blockName,
    blockType: iface.kind,
    udtName,
    timingMode: policy.timingMode || DEFAULT_TIMING_MODE[blockName] || 'ton_time',
    effectiveIsolation,
    realAbs,
    realRel,
    totalCases: vecJson.testCases.length,
    executedCases: caseSummaries.filter((c) => c.status === 'PLANNED').length,
    skippedCases: caseSummaries.filter((c) => c.status === 'SKIPPED').length,
    activeDutCount,
    hasTonWait: planSteps.some((s) => s.timing.mode === 'ton_wait'),
    hasEdgeReset: allEdgeResetPins.size > 0,
    hasPulseTrue: allPulseTruePins.size > 0,
    hasStopWaitOnMatch: planSteps.some((s) => s.stopWaitOnMatch),
    edgeResetPins: [...allEdgeResetPins],
    pulseTruePins: [...allPulseTruePins],
    fieldMap,
    planSteps,
    caseSummaries,
    warnings,
    iface,
    udtMembers,
  };
}

/**
 * Emit non-optimized S7 DB_TestSummary source for Sharp7 / ReadTags observation.
 */
function generateDbTestSummaryScl() {
  return [
    'DATA_BLOCK "DB_TestSummary"',
    "{ S7_Optimized_Access := 'FALSE' }",
    'VERSION : 0.1',
    'NON_RETAIN',
    '   VAR',
    '      done : Bool := FALSE;',
    '      passed : Bool := FALSE;',
    '      running : Bool := FALSE;',
    '      hasError : Bool := FALSE;',
    '      totalCases : Int := 0;',
    '      executedCases : Int := 0;',
    '      passedCases : Int := 0;',
    '      failedCases : Int := 0;',
    '      skippedCases : Int := 0;',
    '      currentCaseIndex : Int := 0;',
    '      currentStepIndex : Int := 0;',
    '      firstFailCase : Int := 0;',
    '      firstFailStep : Int := 0;',
    '      firstFailFieldIndex : Int := 0;',
    '      firstFailIsHmi : Bool := FALSE;',
    '      padByte23 : Byte := 16#00;',
    '      firstFailMask : DWord := 16#00000000;',
    '      statusCode : Word := 16#0000;',
    '      padWord30 : Word := 16#0000;',
    '      totalStepsExecuted : DInt := 0;',
    '      failedStepsCount : DInt := 0;',
    '      firstFailActualReal : Real := 0.0;',
    '      firstFailExpectedReal : Real := 0.0;',
    '      firstFailActualDInt : DInt := 0;',
    '      firstFailExpectedDInt : DInt := 0;',
    '      firstFailActualWord : Word := 16#0000;',
    '      firstFailExpectedWord : Word := 16#0000;',
    '      firstFailActualBool : Bool := FALSE;',
    '      firstFailExpectedBool : Bool := FALSE;',
    '      padByte61 : Byte := 16#00;',
    '   END_VAR',
    'BEGIN',
    '   // Auto-generated Route 1 S7-1200/1500 non-optimized test summary DB (62 bytes)',
    'END_DATA_BLOCK',
    '',
  ].join('\r\n');
}

function generateDutCallBlock(plan, hmiVarName, indent) {
  const lines = [];
  const args = [];
  for (const pin of Object.keys(plan.iface.sections.VAR_INPUT)) {
    args.push(`${pin} := #statIn_${pin}`);
  }
  for (const pin of Object.keys(plan.iface.sections.VAR_OUTPUT)) {
    args.push(`${pin} => #statOut_${pin}`);
  }
  args.push(`ioHmi := #${hmiVarName}`);

  const pad = ' '.repeat(indent);
  const inner = ' '.repeat(indent + 3);
  if (plan.blockType === 'FC') {
    lines.push(`${pad}"${plan.blockName}"(`);
    lines.push(args.map((a, idx) => `${inner}${a}${idx < args.length - 1 ? ',' : ''}`).join('\r\n'));
    lines.push(`${pad});`);
    return lines.join('\r\n');
  }

  lines.push(`${pad}CASE #statActiveDut OF`);
  for (let slot = 1; slot <= plan.activeDutCount; slot += 1) {
    lines.push(`${pad}   ${slot}:`);
    lines.push(`${pad}      #instDut_${slot}(`);
    lines.push(args.map((a, idx) => `${pad}         ${a}${idx < args.length - 1 ? ',' : ''}`).join('\r\n'));
    lines.push(`${pad}      );`);
  }
  lines.push(`${pad}   ELSE`);
  lines.push(`${pad}      "DB_TestSummary".hasError := TRUE;`);
  lines.push(`${pad}      "DB_TestSummary".statusCode := 16#80FE;`);
  lines.push(`${pad}END_CASE;`);
  return lines.join('\r\n');
}

function buildStepFieldChecks(plan, step, innerPad = '') {
  const fieldLookup = new Map();
  for (const f of plan.fieldMap) {
    fieldLookup.set(`${f.isHmi ? 'hmi' : 'out'}:${f.name}`, f);
  }
  const checks = [];
  const addCheck = (isHmi, fieldName, expectedRaw) => {
    const f = fieldLookup.get(`${isHmi ? 'hmi' : 'out'}:${fieldName}`);
    if (!f) throw new Error(`Unknown asserted field ${isHmi ? 'hmi' : 'out'}.${fieldName} on ${plan.blockName}`);
    const actualExpr = isHmi ? `#statHmi.${fieldName}` : `#statOut_${fieldName}`;
    let condExpr = '';
    const recordActualLines = [];

    if (f.type === 'Bool') {
      const expBool = Boolean(expectedRaw);
      // Use direct NOT/#actual check to stay strict IEC warning-free
      condExpr = expBool ? `NOT ${actualExpr}` : `${actualExpr}`;
      recordActualLines.push(`${innerPad}   "DB_TestSummary".firstFailActualBool := ${actualExpr};`);
      recordActualLines.push(`${innerPad}   "DB_TestSummary".firstFailExpectedBool := ${expBool ? 'TRUE' : 'FALSE'};`);
    } else if (f.type === 'Real') {
      const expNum = Number(expectedRaw);
      const effTol = Math.max(plan.realAbs, plan.realRel * Math.abs(expNum));
      const expLit = formatSclReal(expNum);
      const tolLit = formatSclReal(effTol);
      // NOT (ABS(...) <= tol) treats NaN as failure in IEEE-754 comparisons
      condExpr = `NOT (ABS(${actualExpr} - ${expLit}) <= ${tolLit})`;
      recordActualLines.push(`${innerPad}   "DB_TestSummary".firstFailActualReal := ${actualExpr};`);
      recordActualLines.push(`${innerPad}   "DB_TestSummary".firstFailExpectedReal := ${expLit};`);
    } else if (f.type === 'Int') {
      const lit = formatSclLiteral('Int', expectedRaw);
      condExpr = `${actualExpr} <> ${lit}`;
      recordActualLines.push(`${innerPad}   "DB_TestSummary".firstFailActualDInt := INT_TO_DINT(${actualExpr});`);
      recordActualLines.push(`${innerPad}   "DB_TestSummary".firstFailExpectedDInt := DINT#${Math.round(Number(expectedRaw))};`);
    } else if (f.type === 'DInt') {
      const lit = formatSclLiteral('DInt', expectedRaw);
      condExpr = `${actualExpr} <> ${lit}`;
      recordActualLines.push(`${innerPad}   "DB_TestSummary".firstFailActualDInt := ${actualExpr};`);
      recordActualLines.push(`${innerPad}   "DB_TestSummary".firstFailExpectedDInt := ${lit};`);
    } else if (f.type === 'Word') {
      const lit = formatSclLiteral('Word', expectedRaw);
      condExpr = `${actualExpr} <> ${lit}`;
      recordActualLines.push(`${innerPad}   "DB_TestSummary".firstFailActualWord := ${actualExpr};`);
      recordActualLines.push(`${innerPad}   "DB_TestSummary".firstFailExpectedWord := ${lit};`);
    } else if (f.type === 'Time') {
      const ms = parseS7TimeToMs(expectedRaw);
      const lit = formatSclLiteral('Time', expectedRaw);
      condExpr = `${actualExpr} <> ${lit}`;
      recordActualLines.push(`${innerPad}   "DB_TestSummary".firstFailActualDInt := TIME_TO_DINT(${actualExpr});`);
      recordActualLines.push(`${innerPad}   "DB_TestSummary".firstFailExpectedDInt := DINT#${Math.round(ms)};`);
    }
    checks.push({ f, isHmi, condExpr, recordActualLines });
  };

  for (const [pinName] of Object.entries(plan.iface.sections.VAR_OUTPUT)) {
    if (Object.prototype.hasOwnProperty.call(step.expectedOutputs, pinName)) {
      addCheck(false, pinName, step.expectedOutputs[pinName]);
    }
  }
  for (const [memberName] of Object.entries(plan.udtMembers)) {
    if (Object.prototype.hasOwnProperty.call(step.expectedHmiOut, memberName)) {
      addCheck(true, memberName, step.expectedHmiOut[memberName]);
    }
  }
  return checks;
}

function generateAssertionLines(plan, step, indent) {
  const lines = [];
  const pad = ' '.repeat(indent);
  const inner = ' '.repeat(indent + 3);
  for (const { f, isHmi, condExpr, recordActualLines } of buildStepFieldChecks(plan, step, inner)) {
    lines.push(`${pad}IF ${condExpr} THEN`);
    lines.push(`${inner}#statStepFailed := TRUE;`);
    lines.push(`${inner}#statCaseFailed := TRUE;`);
    const maskHex = formatDWordMask(f.index - 1);
    if (maskHex) {
      lines.push(`${inner}IF ("DB_TestSummary".firstFailCase = 0) OR (("DB_TestSummary".firstFailCase = #statCurrentCaseNum) AND ("DB_TestSummary".firstFailStep = #statCurrentStepNum)) THEN`);
      lines.push(`${inner}   "DB_TestSummary".firstFailMask := "DB_TestSummary".firstFailMask OR ${maskHex};`);
      lines.push(`${inner}END_IF;`);
    }
    lines.push(`${inner}IF "DB_TestSummary".firstFailCase = 0 THEN`);
    lines.push(`${inner}   "DB_TestSummary".firstFailCase := #statCurrentCaseNum;`);
    lines.push(`${inner}   "DB_TestSummary".firstFailStep := #statCurrentStepNum;`);
    lines.push(`${inner}   "DB_TestSummary".firstFailFieldIndex := INT#${f.index};`);
    lines.push(`${inner}   "DB_TestSummary".firstFailIsHmi := ${isHmi ? 'TRUE' : 'FALSE'};`);
    lines.push(...recordActualLines);
    lines.push(`${inner}END_IF;`);
    lines.push(`${pad}END_IF;`);
  }

  return lines.join('\r\n');
}

function generateFbHarnessScl(plan, options) {
  const fbName = `FB_Harness_${plan.blockName}`;
  const lines = [];

  lines.push(`FUNCTION_BLOCK "${fbName}"`);
  lines.push("{ S7_Optimized_Access := 'TRUE' }");
  lines.push('VERSION : 0.1');
  lines.push('   VAR_INPUT');
  lines.push('      startRun : Bool := FALSE;');
  lines.push('      resetRun : Bool := FALSE;');
  lines.push('   END_VAR');
  lines.push('');
  lines.push('   VAR_OUTPUT');
  lines.push('      done : Bool := FALSE;');
  lines.push('      passed : Bool := FALSE;');
  lines.push('   END_VAR');
  lines.push('');
  lines.push('   VAR');
  lines.push('      statHarnessState : Int := 0;');
  lines.push('      statPlanIdx : Int := 0;');
  lines.push('      statActiveDut : Int := 0;');
  lines.push('      statCurrentCaseNum : Int := 0;');
  lines.push('      statCurrentStepNum : Int := 0;');
  lines.push('      statIsPrefixStep : Bool := FALSE;');
  lines.push('      statIsLastStepInCase : Bool := FALSE;');
  lines.push('      statHasEdgeReset : Bool := FALSE;');
  lines.push('      statHasPulseTrue : Bool := FALSE;');
  lines.push('      statUseTonWait : Bool := FALSE;');
  lines.push('      statCaseFailed : Bool := FALSE;');
  lines.push('      statStepFailed : Bool := FALSE;');
  lines.push('      statDone : Bool := FALSE;');
  lines.push('      statPassed : Bool := FALSE;');
  lines.push('      statPrevStartRun : Bool := FALSE;');
  lines.push('      statTargetScans : DInt := 1;');
  lines.push('      statExecScans : DInt := 0;');
  lines.push('      statMinWaitScans : DInt := 2;');
  lines.push('      statWaitPt : Time := T#0s;');
  if (plan.hasTonWait) {
    lines.push('      instStepTimer : TON_TIME;');
  }
  for (let slot = 1; slot <= plan.activeDutCount; slot += 1) {
    lines.push(`      instDut_${slot} : "${plan.blockName}";`);
  }
  for (const [pin, pType] of Object.entries(plan.iface.sections.VAR_INPUT)) {
    lines.push(`      statIn_${pin} : ${pType} := ${formatSclLiteral(pType, defaultJsValueForType(pType))};`);
  }
  for (const [pin, pType] of Object.entries(plan.iface.sections.VAR_OUTPUT)) {
    lines.push(`      statOut_${pin} : ${pType} := ${formatSclLiteral(pType, defaultJsValueForType(pType))};`);
  }
  lines.push(`      statHmi : "${plan.udtName}";`);
  if (plan.hasEdgeReset) {
    lines.push(`      statHmiBackup : "${plan.udtName}";`);
    for (const pin of plan.edgeResetPins) {
      lines.push(`      statEdgeOrig_${pin} : Bool := FALSE;`);
    }
  }
  if (plan.hasPulseTrue) {
    for (const pin of plan.pulseTruePins) {
      lines.push(`      statPulseOrig_${pin} : Bool := FALSE;`);
    }
  }
  lines.push('   END_VAR');
  lines.push('');
  lines.push('   VAR_TEMP');
  lines.push('      tempCallDut : Bool;');
  if (plan.hasEdgeReset) {
    lines.push('      tempUseHmiBackup : Bool;');
  }
  if (plan.hasTonWait) {
    lines.push('      tempTimerEn : Bool;');
    lines.push('      tempTimerPt : Time;');
  }
  lines.push('      tempStartEdge : Bool;');
  lines.push('   END_VAR');
  lines.push('');
  lines.push('   VAR CONSTANT');
  lines.push('      STATE_IDLE : Int := 0;');
  lines.push('      STATE_STEP_LOAD : Int := 10;');
  if (plan.hasEdgeReset) lines.push('      STATE_EDGE_RESET : Int := 20;');
  if (plan.hasPulseTrue) lines.push('      STATE_PULSE_TRUE : Int := 30;');
  lines.push('      STATE_EXEC_SCANS : Int := 40;');
  if (plan.hasTonWait) lines.push('      STATE_TON_WAIT : Int := 50;');
  lines.push('      STATE_STEP_CHECK : Int := 60;');
  lines.push('      STATE_COMPLETE : Int := 90;');
  lines.push(`      TOTAL_PLAN_STEPS : Int := ${plan.planSteps.length};`);
  lines.push(`      TOTAL_CASES : Int := ${plan.totalCases};`);
  lines.push(`      SKIPPED_CASES : Int := ${plan.skippedCases};`);
  lines.push('   END_VAR');
  lines.push('');
  lines.push('BEGIN');
  lines.push(`   // Route 1 Self-Driving Harness for ${plan.blockName} (${plan.blockId}), mode=${options.manifestMode}, timeScale=${options.timeScale}, marginMs=${options.marginMs}`);
  for (const w of plan.warnings) {
    lines.push(`   // WARNING: ${w}`);
  }
  lines.push('');
  lines.push('   // Unconditional VAR_TEMP initialization (SE002)');
  lines.push('   #tempCallDut := FALSE;');
  if (plan.hasEdgeReset) lines.push('   #tempUseHmiBackup := FALSE;');
  if (plan.hasTonWait) {
    lines.push('   #tempTimerEn := FALSE;');
    lines.push('   #tempTimerPt := T#0s;');
  }
  lines.push('   #tempStartEdge := #startRun AND (NOT #statPrevStartRun);');
  lines.push('   #statPrevStartRun := #startRun;');
  lines.push('');
  lines.push('   IF #resetRun THEN');
  lines.push('      #statHarnessState := #STATE_IDLE;');
  lines.push('      #statPlanIdx := 0;');
  lines.push('      #statDone := FALSE;');
  lines.push('      #statPassed := FALSE;');
  lines.push('      #statCaseFailed := FALSE;');
  lines.push('      "DB_TestSummary".done := FALSE;');
  lines.push('      "DB_TestSummary".passed := FALSE;');
  lines.push('      "DB_TestSummary".running := FALSE;');
  lines.push('      "DB_TestSummary".hasError := FALSE;');
  lines.push('      "DB_TestSummary".statusCode := 16#0000;');
  if (plan.hasTonWait) lines.push('      #instStepTimer(IN := FALSE, PT := T#0s);');
  lines.push('      #done := #statDone;');
  lines.push('      #passed := #statPassed;');
  lines.push('      RETURN;');
  lines.push('   END_IF;');
  lines.push('');
  lines.push('   CASE #statHarnessState OF');
  lines.push('      #STATE_IDLE:');
  lines.push('         IF (#tempStartEdge OR (#startRun AND (NOT #statDone))) THEN');
  lines.push('            "DB_TestSummary".done := FALSE;');
  lines.push('            "DB_TestSummary".passed := FALSE;');
  lines.push('            "DB_TestSummary".running := TRUE;');
  lines.push('            "DB_TestSummary".hasError := FALSE;');
  lines.push('            "DB_TestSummary".totalCases := #TOTAL_CASES;');
  lines.push('            "DB_TestSummary".executedCases := 0;');
  lines.push('            "DB_TestSummary".passedCases := 0;');
  lines.push('            "DB_TestSummary".failedCases := 0;');
  lines.push('            "DB_TestSummary".skippedCases := #SKIPPED_CASES;');
  lines.push('            "DB_TestSummary".currentCaseIndex := 0;');
  lines.push('            "DB_TestSummary".currentStepIndex := 0;');
  lines.push('            "DB_TestSummary".firstFailCase := 0;');
  lines.push('            "DB_TestSummary".firstFailStep := 0;');
  lines.push('            "DB_TestSummary".firstFailFieldIndex := 0;');
  lines.push('            "DB_TestSummary".firstFailIsHmi := FALSE;');
  lines.push('            "DB_TestSummary".firstFailMask := 16#00000000;');
  lines.push('            "DB_TestSummary".statusCode := 16#0001;');
  lines.push('            "DB_TestSummary".totalStepsExecuted := 0;');
  lines.push('            "DB_TestSummary".failedStepsCount := 0;');
  lines.push('            "DB_TestSummary".firstFailActualReal := 0.0;');
  lines.push('            "DB_TestSummary".firstFailExpectedReal := 0.0;');
  lines.push('            "DB_TestSummary".firstFailActualDInt := 0;');
  lines.push('            "DB_TestSummary".firstFailExpectedDInt := 0;');
  lines.push('            "DB_TestSummary".firstFailActualWord := 16#0000;');
  lines.push('            "DB_TestSummary".firstFailExpectedWord := 16#0000;');
  lines.push('            "DB_TestSummary".firstFailActualBool := FALSE;');
  lines.push('            "DB_TestSummary".firstFailExpectedBool := FALSE;');
  lines.push('            #statDone := FALSE;');
  lines.push('            #statPassed := FALSE;');
  lines.push('            #statCaseFailed := FALSE;');
  lines.push('            IF #TOTAL_PLAN_STEPS > 0 THEN');
  lines.push('               #statPlanIdx := 1;');
  lines.push('               #statHarnessState := #STATE_STEP_LOAD;');
  lines.push('            ELSE');
  lines.push('               #statHarnessState := #STATE_COMPLETE;');
  lines.push('            END_IF;');
  lines.push('         END_IF;');
  lines.push('');

  // STATE_STEP_LOAD
  lines.push('      #STATE_STEP_LOAD:');
  lines.push('         #statExecScans := 0;');
  lines.push('         #statStepFailed := FALSE;');
  lines.push('         CASE #statPlanIdx OF');
  for (const step of plan.planSteps) {
    lines.push(`            ${step.planUid}: // ${step.caseId} step ${step.isPrefix ? '0(prefix)' : step.stepNum}`);
    lines.push(`               #statCurrentCaseNum := INT#${step.caseNum};`);
    lines.push(`               #statActiveDut := INT#${step.dutSlot};`);
    lines.push(`               #statCurrentStepNum := INT#${step.stepNum};`);
    lines.push(`               #statIsPrefixStep := ${step.isPrefix ? 'TRUE' : 'FALSE'};`);
    lines.push(`               #statIsLastStepInCase := ${step.isLastInCase ? 'TRUE' : 'FALSE'};`);
    lines.push(`               #statHasEdgeReset := ${step.falseEdgePins.length > 0 ? 'TRUE' : 'FALSE'};`);
    lines.push(`               #statHasPulseTrue := ${step.trueEdgePins.length > 0 ? 'TRUE' : 'FALSE'};`);
    lines.push(`               #statUseTonWait := ${step.timing.mode === 'ton_wait' ? 'TRUE' : 'FALSE'};`);
    lines.push(`               #statTargetScans := DINT#${step.timing.scans != null ? step.timing.scans : 1};`);
    lines.push(`               #statMinWaitScans := DINT#${step.timing.minScans || 2};`);
    lines.push(`               #statWaitPt := T#${step.timing.waitMs > 0 ? `${step.timing.waitMs}ms` : '0s'};`);
    if (step.isFirstInCase) {
      lines.push('               #statCaseFailed := FALSE;');
    }
    for (const [pin, pType] of Object.entries(plan.iface.sections.VAR_INPUT)) {
      const val = Object.prototype.hasOwnProperty.call(step.inputs, pin)
        ? step.inputs[pin]
        : defaultJsValueForType(pType);
      lines.push(
        `               #statIn_${pin} := ${formatSclLiteral(pType, val, { timeScale: options.timeScale, scaleNonZeroTime: true })};`
      );
    }
    for (const [memberName, mType] of Object.entries(plan.udtMembers)) {
      const val = Object.prototype.hasOwnProperty.call(step.ioHmiIn, memberName)
        ? step.ioHmiIn[memberName]
        : defaultJsValueForType(mType);
      lines.push(
        `               #statHmi.${memberName} := ${formatSclLiteral(mType, val, { timeScale: options.timeScale, scaleNonZeroTime: true })};`
      );
    }
    for (const pin of step.falseEdgePins) {
      lines.push(`               #statEdgeOrig_${pin} := #statIn_${pin};`);
    }
    for (const pin of step.trueEdgePins) {
      lines.push(`               #statPulseOrig_${pin} := #statIn_${pin};`);
    }
  }
  lines.push('            ELSE');
  lines.push('               "DB_TestSummary".hasError := TRUE;');
  lines.push('               "DB_TestSummary".statusCode := 16#80FF;');
  lines.push('               #statHarnessState := #STATE_COMPLETE;');
  lines.push('         END_CASE;');
  lines.push('');
  lines.push('         IF #statHarnessState = #STATE_STEP_LOAD THEN');
  lines.push('            "DB_TestSummary".currentCaseIndex := #statCurrentCaseNum;');
  lines.push('            "DB_TestSummary".currentStepIndex := #statCurrentStepNum;');
  if (plan.hasEdgeReset) {
    lines.push('            IF #statHasEdgeReset THEN');
    lines.push('               #statHmiBackup := #statHmi;');
    if (Object.prototype.hasOwnProperty.call(plan.udtMembers, 'bResetCmd')) {
      lines.push('               #statHmiBackup.bResetCmd := FALSE;');
    }
    if (Object.prototype.hasOwnProperty.call(plan.udtMembers, 'bHmiResetCmd')) {
      lines.push('               #statHmiBackup.bHmiResetCmd := FALSE;');
    }
    lines.push('               #statHarnessState := #STATE_EDGE_RESET;');
    lines.push(plan.hasPulseTrue ? '            ELSIF #statHasPulseTrue THEN\r\n               #statHarnessState := #STATE_PULSE_TRUE;' : '');
    if (plan.hasTonWait) {
      lines.push('            ELSIF #statUseTonWait THEN');
      lines.push('               #statHarnessState := #STATE_TON_WAIT;');
    }
    lines.push('            ELSE');
    lines.push('               #statHarnessState := #STATE_EXEC_SCANS;');
    lines.push('            END_IF;');
  } else if (plan.hasPulseTrue) {
    lines.push('            IF #statHasPulseTrue THEN');
    lines.push('               #statHarnessState := #STATE_PULSE_TRUE;');
    if (plan.hasTonWait) {
      lines.push('            ELSIF #statUseTonWait THEN');
      lines.push('               #statHarnessState := #STATE_TON_WAIT;');
    }
    lines.push('            ELSE');
    lines.push('               #statHarnessState := #STATE_EXEC_SCANS;');
    lines.push('            END_IF;');
  } else if (plan.hasTonWait) {
    lines.push('            IF #statUseTonWait THEN');
    lines.push('               #statHarnessState := #STATE_TON_WAIT;');
    lines.push('            ELSE');
    lines.push('               #statHarnessState := #STATE_EXEC_SCANS;');
    lines.push('            END_IF;');
  } else {
    lines.push('            #statHarnessState := #STATE_EXEC_SCANS;');
  }
  lines.push('         END_IF;');
  lines.push('');

  // STATE_EDGE_RESET (pre-step FALSE edge reset scan using backup HMI)
  if (plan.hasEdgeReset) {
    lines.push('      #STATE_EDGE_RESET:');
    lines.push('         #tempCallDut := TRUE;');
    lines.push('         #tempUseHmiBackup := TRUE;');
    lines.push('         CASE #statPlanIdx OF');
    for (const step of plan.planSteps.filter((s) => s.falseEdgePins.length > 0)) {
      lines.push(`            ${step.planUid}:`);
      for (const pin of step.falseEdgePins) {
        lines.push(`               #statIn_${pin} := FALSE;`);
      }
    }
    lines.push('            ELSE');
    lines.push('               #tempCallDut := FALSE;');
    lines.push('         END_CASE;');
    lines.push('');
  }

  // STATE_PULSE_TRUE (pre-step TRUE pulse scan preserving mutated statHmi)
  if (plan.hasPulseTrue) {
    lines.push('      #STATE_PULSE_TRUE:');
    lines.push('         #tempCallDut := TRUE;');
    lines.push('         CASE #statPlanIdx OF');
    for (const step of plan.planSteps.filter((s) => s.trueEdgePins.length > 0)) {
      lines.push(`            ${step.planUid}:`);
      for (const pin of step.trueEdgePins) {
        lines.push(`               #statIn_${pin} := TRUE;`);
      }
    }
    lines.push('            ELSE');
    lines.push('               #tempCallDut := FALSE;');
    lines.push('         END_CASE;');
    lines.push('');
  }

  // STATE_EXEC_SCANS
  lines.push('      #STATE_EXEC_SCANS:');
  lines.push('         #tempCallDut := TRUE;');
  lines.push('         #statExecScans := #statExecScans + 1;');
  lines.push('');

  // STATE_TON_WAIT
  if (plan.hasTonWait) {
    lines.push('      #STATE_TON_WAIT:');
    lines.push('         #tempCallDut := TRUE;');
    lines.push('         #tempTimerEn := TRUE;');
    lines.push('         #tempTimerPt := #statWaitPt;');
    lines.push('         #statExecScans := #statExecScans + 1;');
    lines.push('');
  }

  // STATE_STEP_CHECK
  lines.push('      #STATE_STEP_CHECK:');
  lines.push('         IF NOT #statIsPrefixStep THEN');
  lines.push('            "DB_TestSummary".totalStepsExecuted := "DB_TestSummary".totalStepsExecuted + 1;');
  lines.push('            CASE #statPlanIdx OF');
  for (const step of plan.planSteps.filter((s) => !s.isPrefix)) {
    const assertText = generateAssertionLines(plan, step, 15);
    if (assertText) {
      lines.push(`               ${step.planUid}: // ${step.caseId} step ${step.stepNum}`);
      lines.push(assertText);
    }
  }
  lines.push('               ELSE');
  lines.push('                  #statStepFailed := FALSE;');
  lines.push('            END_CASE;');
  lines.push('            IF #statStepFailed THEN');
  lines.push('               "DB_TestSummary".failedStepsCount := "DB_TestSummary".failedStepsCount + 1;');
  lines.push('            END_IF;');
  lines.push('         END_IF;');
  lines.push('');
  lines.push('         IF #statIsLastStepInCase THEN');
  lines.push('            "DB_TestSummary".executedCases := "DB_TestSummary".executedCases + 1;');
  lines.push('            IF #statCaseFailed THEN');
  lines.push('               "DB_TestSummary".failedCases := "DB_TestSummary".failedCases + 1;');
  lines.push('            ELSE');
  lines.push('               "DB_TestSummary".passedCases := "DB_TestSummary".passedCases + 1;');
  lines.push('            END_IF;');
  lines.push('         END_IF;');
  lines.push('');
  lines.push('         IF #statPlanIdx < #TOTAL_PLAN_STEPS THEN');
  lines.push('            #statPlanIdx := #statPlanIdx + 1;');
  lines.push('            #statHarnessState := #STATE_STEP_LOAD;');
  lines.push('         ELSE');
  lines.push('            #statHarnessState := #STATE_COMPLETE;');
  lines.push('         END_IF;');
  lines.push('');

  // STATE_COMPLETE
  lines.push('      #STATE_COMPLETE:');
  lines.push('         #statDone := TRUE;');
  lines.push('         #statPassed := ("DB_TestSummary".failedCases = 0) AND (NOT "DB_TestSummary".hasError);');
  lines.push('         "DB_TestSummary".running := FALSE;');
  lines.push('         "DB_TestSummary".done := TRUE;');
  lines.push('         "DB_TestSummary".passed := #statPassed;');
  lines.push('         IF NOT "DB_TestSummary".hasError THEN');
  lines.push('            IF #statPassed THEN');
  lines.push('               "DB_TestSummary".statusCode := 16#0002;');
  lines.push('            ELSE');
  lines.push('               "DB_TestSummary".statusCode := 16#0003;');
  lines.push('            END_IF;');
  lines.push('         END_IF;');
  lines.push('');
  lines.push('      ELSE');
  lines.push('         "DB_TestSummary".hasError := TRUE;');
  lines.push('         "DB_TestSummary".statusCode := 16#80FD;');
  lines.push('         #statHarnessState := #STATE_COMPLETE;');
  lines.push('   END_CASE;');
  lines.push('');

  // Unified DUT dispatch (executes at most once per OB scan)
  lines.push('   IF #tempCallDut THEN');
  if (plan.hasEdgeReset) {
    lines.push('      IF #tempUseHmiBackup THEN');
    lines.push(generateDutCallBlock(plan, 'statHmiBackup', 9));
    lines.push('      ELSE');
    lines.push(generateDutCallBlock(plan, 'statHmi', 9));
    lines.push('      END_IF;');
  } else {
    lines.push(generateDutCallBlock(plan, 'statHmi', 6));
  }
  lines.push('   END_IF;');
  lines.push('');

  // Unified TON_TIME call (AL001: called every scan, IN := FALSE outside TON_WAIT)
  if (plan.hasTonWait) {
    lines.push('   #instStepTimer(IN := #tempTimerEn, PT := #tempTimerPt);');
    lines.push('');
  }

  // Post-DUT restore & state transitions (only when DUT ran this scan)
  lines.push('   IF #tempCallDut THEN');
  if (plan.hasEdgeReset || plan.hasPulseTrue || plan.hasTonWait) {
    let firstIf = true;
    const ifKw = () => {
      const kw = firstIf ? 'IF' : 'ELSIF';
      firstIf = false;
      return kw;
    };

    if (plan.hasEdgeReset) {
      lines.push(`      ${ifKw()} #statHarnessState = #STATE_EDGE_RESET THEN`);
      lines.push('         CASE #statPlanIdx OF');
      for (const step of plan.planSteps.filter((s) => s.falseEdgePins.length > 0)) {
        lines.push(`            ${step.planUid}:`);
        for (const pin of step.falseEdgePins) {
          lines.push(`               #statIn_${pin} := #statEdgeOrig_${pin};`);
        }
      }
      lines.push('            ELSE');
      lines.push('               "DB_TestSummary".hasError := TRUE;');
      lines.push('         END_CASE;');
      if (plan.hasPulseTrue) {
        lines.push('         IF #statHasPulseTrue THEN');
        lines.push('            #statHarnessState := #STATE_PULSE_TRUE;');
        if (plan.hasTonWait) {
          lines.push('         ELSIF #statUseTonWait THEN');
          lines.push('            #statHarnessState := #STATE_TON_WAIT;');
        }
        lines.push('         ELSE');
        lines.push('            #statHarnessState := #STATE_EXEC_SCANS;');
        lines.push('         END_IF;');
      } else if (plan.hasTonWait) {
        lines.push('         IF #statUseTonWait THEN');
        lines.push('            #statHarnessState := #STATE_TON_WAIT;');
        lines.push('         ELSE');
        lines.push('            #statHarnessState := #STATE_EXEC_SCANS;');
        lines.push('         END_IF;');
      } else {
        lines.push('         #statHarnessState := #STATE_EXEC_SCANS;');
      }
    }

    if (plan.hasPulseTrue) {
      lines.push(`      ${ifKw()} #statHarnessState = #STATE_PULSE_TRUE THEN`);
      lines.push('         CASE #statPlanIdx OF');
      for (const step of plan.planSteps.filter((s) => s.trueEdgePins.length > 0)) {
        lines.push(`            ${step.planUid}:`);
        for (const pin of step.trueEdgePins) {
          lines.push(`               #statIn_${pin} := #statPulseOrig_${pin};`);
        }
      }
      lines.push('            ELSE');
      lines.push('               "DB_TestSummary".hasError := TRUE;');
      lines.push('         END_CASE;');
      if (plan.hasTonWait) {
        lines.push('         IF #statUseTonWait THEN');
        lines.push('            #statHarnessState := #STATE_TON_WAIT;');
        lines.push('         ELSE');
        lines.push('            #statHarnessState := #STATE_EXEC_SCANS;');
        lines.push('         END_IF;');
      } else {
        lines.push('         #statHarnessState := #STATE_EXEC_SCANS;');
      }
    }

    lines.push(`      ${ifKw()} #statHarnessState = #STATE_EXEC_SCANS THEN`);
    lines.push('         IF #statExecScans >= #statTargetScans THEN');
    lines.push('            #statHarnessState := #STATE_STEP_CHECK;');
    lines.push('         END_IF;');

    if (plan.hasTonWait) {
      lines.push(`      ${ifKw()} #statHarnessState = #STATE_TON_WAIT THEN`);
      lines.push('         IF #instStepTimer.Q AND (#statExecScans >= #statMinWaitScans) THEN');
      lines.push('            #statHarnessState := #STATE_STEP_CHECK;');
      const stopSteps = plan.hasStopWaitOnMatch
        ? plan.planSteps.filter((s) => s.stopWaitOnMatch && s.timing.mode === 'ton_wait')
        : [];
      const stopArms = stopSteps
        .map((s) => {
          const checks = buildStepFieldChecks(plan, s);
          if (checks.length === 0) return null;
          return { uid: s.planUid, expr: checks.map((c) => `(${c.condExpr})`).join(' OR ') };
        })
        .filter(Boolean);
      if (stopArms.length > 0) {
        lines.push('         ELSIF #statExecScans >= #statMinWaitScans THEN');
        stopArms.forEach((arm, idx) => {
          const kw = idx === 0 ? 'IF' : 'ELSIF';
          lines.push(`            ${kw} (#statPlanIdx = INT#${arm.uid}) AND NOT (${arm.expr}) THEN`);
          lines.push('               #statHarnessState := #STATE_STEP_CHECK;');
        });
        lines.push('            END_IF;');
      }
      lines.push('         END_IF;');
    }
    lines.push('      END_IF;');
  } else {
    lines.push('      IF #statHarnessState = #STATE_EXEC_SCANS THEN');
    lines.push('         IF #statExecScans >= #statTargetScans THEN');
    lines.push('            #statHarnessState := #STATE_STEP_CHECK;');
    lines.push('         END_IF;');
    lines.push('      END_IF;');
  }
  lines.push('   END_IF;');

  lines.push('');
  lines.push('   // Write-only output update (DA008 compliant: outputs never read back)');
  lines.push('   #done := #statDone;');
  lines.push('   #passed := #statPassed;');
  lines.push('END_FUNCTION_BLOCK');
  lines.push('');

  return lines.filter((l) => l !== '').join('\r\n');
}

function generateDbHarnessScl(plan) {
  return [
    `DATA_BLOCK "DB_Harness_${plan.blockName}"`,
    "{ S7_Optimized_Access := 'TRUE' }",
    'VERSION : 0.1',
    'NON_RETAIN',
    `"FB_Harness_${plan.blockName}"`,
    'BEGIN',
    `   // Instance DB for FB_Harness_${plan.blockName}`,
    'END_DATA_BLOCK',
    '',
  ].join('\r\n');
}

function generateObTestRunnerScl(plan) {
  return [
    `ORGANIZATION_BLOCK "OB_TestRunner_${plan.blockName}"`,
    "{ S7_Optimized_Access := 'TRUE' }",
    'VERSION : 0.1',
    '   VAR_TEMP',
    '      tempRunEnable : Bool;',
    '      tempResetRun : Bool;',
    '   END_VAR',
    'BEGIN',
    '   // Unconditional VAR_TEMP initialization (SE002); Free cyclic OB runs once until DB_TestSummary.done',
    '   #tempRunEnable := TRUE;',
    '   #tempResetRun := FALSE;',
    `   "DB_Harness_${plan.blockName}"(startRun := #tempRunEnable, resetRun := #tempResetRun);`,
    'END_ORGANIZATION_BLOCK',
    '',
  ].join('\r\n');
}

/**
 * Built-in static anti-pattern verifier for generated TIA Portal V20 SCL.
 * Splits multi-block sources and verifies BOM, header rules, OB naming,
 * DA008, SE002, AL001, and PC008 Real comparison safety.
 */
function lintSclSource(sclText, opts = {}) {
  const errors = [];
  const warnings = [];
  const { requireBom = true, label = '<memory>' } = opts;

  let body = sclText;
  if (requireBom) {
    if (sclText.charCodeAt(0) !== 0xfeff) {
      errors.push(`${label}: Missing required UTF-8 BOM (0xFEFF)`);
    } else {
      body = sclText.slice(1);
    }
  } else {
    body = stripBom(sclText);
  }

  // Split into individual blocks
  const blockStartRe = /^(DATA_BLOCK|FUNCTION_BLOCK|FUNCTION|ORGANIZATION_BLOCK)\s+"([^"]+)"/gm;
  const matches = [];
  let m;
  while ((m = blockStartRe.exec(body)) !== null) {
    matches.push({ kind: m[1], name: m[2], index: m.index });
  }

  if (matches.length === 0) {
    errors.push(`${label}: No SCL block declarations found`);
    return { errors, warnings, blocksChecked: 0 };
  }

  // Check nothing (including comments!) appears before the very first block header (McpGuides.cs:86)
  const prefix = body.slice(0, matches[0].index).trim();
  if (prefix.length > 0) {
    errors.push(`${label}: Content/comments found before first block declaration (Openness rejects pre-header text)`);
  }

  for (let b = 0; b < matches.length; b += 1) {
    const start = matches[b].index;
    const end = b + 1 < matches.length ? matches[b + 1].index : body.length;
    const blockSrc = body.slice(start, end);
    const kind = matches[b].kind;
    const bName = matches[b].name;

    if (kind === 'ORGANIZATION_BLOCK' && bName.toLowerCase() === 'main') {
      errors.push(`${label} [${bName}]: ORGANIZATION_BLOCK must NOT be named "Main" on V20 (conflict with default OB1)`);
    }

    if (kind === 'FUNCTION' && /^\s*VAR\b(?!\s*_)(?!\s+CONSTANT\b)/im.test(blockSrc)) {
      errors.push(`${label} [${bName}]: FUNCTION cannot declare static VAR section (AL001)`);
    }

    // Parse declarations from block header before BEGIN
    const beginMatch = blockSrc.match(/^\s*BEGIN\b/m);
    if (!beginMatch) {
      errors.push(`${label} [${bName}]: Missing BEGIN keyword`);
      continue;
    }
    const declPart = blockSrc.slice(0, beginMatch.index);
    const execPart = blockSrc.slice(beginMatch.index + beginMatch[0].length);

    const parseVarsInSection = (secPattern) => {
      const vars = {};
      const re = new RegExp(`^\\s*${secPattern}\\b([\\s\\S]*?)^\\s*END_VAR`, 'gim');
      let sm;
      while ((sm = re.exec(declPart)) !== null) {
        for (const rawLine of sm[1].split(/\r?\n/)) {
          const line = rawLine.replace(/\/\/.*$/, '').trim();
          if (!line) continue;
          const vm = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^:;]+)(?::=.*)?;$/);
          if (vm) vars[vm[1]] = vm[2].trim();
        }
      }
      return vars;
    };

    const varTemp = parseVarsInSection('VAR_TEMP');
    const varOutput = parseVarsInSection('VAR_OUTPUT');
    const varStatic = parseVarsInSection('VAR(?!\\s+CONSTANT\\b)');

    // SE002: every VAR_TEMP must be unconditionally assigned at top of BEGIN before any IF/CASE/FOR/WHILE
    const assignedBeforeControl = new Set();
    for (const rawLine of execPart.replace(/\(\*[\s\S]*?\*\)/g, '').split(/\r?\n/)) {
      const code = rawLine.replace(/\/\/.*$/, '').trim();
      if (!code) continue;
      if (/^(IF|CASE|FOR|WHILE|REPEAT|RETURN)\b/i.test(code)) break;
      const am = code.match(/^#([A-Za-z_][A-Za-z0-9_]*)\s*:=/);
      if (am) assignedBeforeControl.add(am[1]);
    }
    for (const tv of Object.keys(varTemp)) {
      if (!assignedBeforeControl.has(tv)) {
        errors.push(`${label} [${bName}]: VAR_TEMP "#${tv}" is not unconditionally initialized at start of BEGIN (SE002)`);
      }
    }

    // DA008: VAR_OUTPUT must never be read back after BEGIN
    const outNames = Object.keys(varOutput);
    if (outNames.length > 0) {
      const codeOnly = execPart
        .replace(/\(\*[\s\S]*?\*\)/g, '')
        .replace(/\/\/.*$/gm, '')
        .replace(/'[^']*'/g, "''");
      for (const stmt of codeOnly.split(';')) {
        const clean = stmt.trim();
        if (!clean) continue;
        // Strip the LHS write target `#target(.field|[idx])* :=` while still scanning [idx], guards, and RHS for output reads
        const scanPortion = clean.replace(
          /#[A-Za-z_][A-Za-z0-9_]*((?:\s*(?:\[[^\]]*\]|\.[A-Za-z_][A-Za-z0-9_]*))*)\s*:=/g,
          '$1 :='
        );
        for (const ov of outNames) {
          const readRe = new RegExp(`#${ov}\\b`);
          if (readRe.test(scanPortion)) {
            errors.push(`${label} [${bName}]: VAR_OUTPUT "#${ov}" read back in expression "${clean.slice(0, 80)}" (DA008)`);
          }
        }
      }
    }

    // AL001: check TON_TIME instances have IN := FALSE path or driven on every scan
    for (const [sv, sType] of Object.entries(varStatic)) {
      if (/\bTON_TIME\b/i.test(sType)) {
        const callRe = new RegExp(`#${sv}\\s*\\([^)]*\\bIN\\s*:=`, 'g');
        if (!callRe.test(execPart)) {
          errors.push(`${label} [${bName}]: TON_TIME "#${sv}" declared without IN := drive call (AL001)`);
        }
      }
    }

    // PC008: Real subtraction inside ABS must have decimals and use NOT (ABS(...) <= tol)
    const absMatches = execPart.matchAll(/ABS\s*\(\s*#([A-Za-z0-9_.]+)\s*-\s*([^\s)]+)\s*\)/g);
    for (const am of absMatches) {
      const lit = am[2];
      if (/^-?\d+$/.test(lit)) {
        errors.push(`${label} [${bName}]: ABS Real comparison uses integer literal "${lit}" without decimal point (PC008)`);
      }
    }

    // Check global DB_TestSummary non-optimized attribute
    if (kind === 'DATA_BLOCK' && bName === 'DB_TestSummary') {
      if (!/S7_Optimized_Access\s*:=\s*'FALSE'/.test(declPart)) {
        errors.push(`${label} [${bName}]: DB_TestSummary must specify { S7_Optimized_Access := 'FALSE' }`);
      }
    }
  }

  return { errors, warnings, blocksChecked: matches.length };
}

function writeUtf8Bom(filePath, content) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const textWithBom = content.charCodeAt(0) === 0xfeff ? content : `\uFEFF${content}`;
  fs.writeFileSync(filePath, textWithBom, 'utf8');
  return crypto.createHash('sha256').update(textWithBom, 'utf8').digest('hex').slice(0, 12);
}

function loadInputsForBlocks(options) {
  const manifestExists = fs.existsSync(options.manifestPath);
  if (!options.manifestMode) {
    options.manifestMode = manifestExists ? 'manifest' : 'raw';
  }
  const manifest =
    options.manifestMode === 'manifest' && manifestExists
      ? JSON.parse(stripBom(fs.readFileSync(options.manifestPath, 'utf8')))
      : { blockPolicies: {}, deviations: [], tolerances: { realAbs: 1e-5, realRel: 1e-5 } };

  const vecFiles = fs.readdirSync(options.vectorsDir).filter((f) => f.endsWith('.json')).sort();
  const catalog = [];
  for (const vf of vecFiles) {
    const vecJson = JSON.parse(stripBom(fs.readFileSync(path.join(options.vectorsDir, vf), 'utf8')));
    catalog.push({ vf, vecJson });
  }

  let selected = catalog;
  const wantAll = options.blocks.some((b) => b.toLowerCase() === 'all');
  if (!wantAll) {
    const wantedSet = new Set(options.blocks.map((b) => b.toLowerCase()));
    selected = catalog.filter(
      (c) =>
        wantedSet.has(c.vecJson.blockName.toLowerCase()) ||
        wantedSet.has(String(c.vecJson.blockId || '').toLowerCase())
    );
    if (selected.length === 0) {
      throw new Error(`No matching block(s) for --block ${options.blocks.join(',')}`);
    }
  }

  const loaded = [];
  for (const item of selected) {
    const bn = item.vecJson.blockName;
    const sclPath = path.join(options.sclDir, `${bn}.scl`);
    const sclText = fs.readFileSync(sclPath, 'utf8');
    const iface = parseSclInterface(sclText);
    const ioHmiRaw = iface.sections.VAR_IN_OUT && iface.sections.VAR_IN_OUT.ioHmi;
    if (!ioHmiRaw) {
      throw new Error(`${bn}.scl does not declare VAR_IN_OUT ioHmi`);
    }
    const udtName = unquoteType(ioHmiRaw);
    const udtPath = path.join(options.udtDir, `${udtName}.xml`);
    const udtMembers = parseUdtMembers(fs.readFileSync(udtPath, 'utf8'));
    const hardcodedPts = detectHardcodedTimerPts(sclText);
    loaded.push({
      vecJson: item.vecJson,
      sclPath,
      udtPath,
      udtName,
      iface,
      udtMembers,
      hardcodedPts,
    });
  }

  return { manifest, blocks: loaded };
}

function generateBlockHarness(blockInput, manifest, options) {
  const plan = buildBlockPlan(blockInput, manifest, options);
  const filesContent = [
    { filename: '01_DB_TestSummary.scl', text: `\uFEFF${generateDbTestSummaryScl()}` },
    { filename: `02_FB_Harness_${plan.blockName}.scl`, text: `\uFEFF${generateFbHarnessScl(plan, options)}` },
    { filename: `03_DB_Harness_${plan.blockName}.scl`, text: `\uFEFF${generateDbHarnessScl(plan)}` },
    { filename: `04_OB_TestRunner_${plan.blockName}.scl`, text: `\uFEFF${generateObTestRunnerScl(plan)}` },
  ];

  if (options.singleFile) {
    const combined = filesContent.map((f) => stripBom(f.text).trimEnd()).join('\r\n\r\n') + '\r\n';
    filesContent.push({ filename: `Harness_${plan.blockName}.scl`, text: `\uFEFF${combined}` });
  }

  const lintResults = [];
  const lintErrors = [];
  const lintWarnings = [];
  for (const fc of filesContent) {
    const res = lintSclSource(fc.text, { requireBom: true, label: `${plan.blockName}/${fc.filename}` });
    lintResults.push({ filename: fc.filename, ...res });
    lintErrors.push(...res.errors);
    lintWarnings.push(...res.warnings);
  }

  const blockOutDir = path.join(options.outDir, plan.blockName);
  const writtenFiles = [];
  const summaryPayload = {
    blockId: plan.blockId,
    blockName: plan.blockName,
    blockType: plan.blockType,
    udtName: plan.udtName,
    manifestMode: options.manifestMode,
    timingMode: plan.timingMode,
    caseIsolation: plan.effectiveIsolation,
    timeScale: options.timeScale,
    marginMs: options.marginMs,
    scanMs: options.scanMs,
    totalCases: plan.totalCases,
    executedCases: plan.executedCases,
    skippedCases: plan.skippedCases,
    plannedSteps: plan.planSteps.length,
    warnings: plan.warnings,
    cases: plan.caseSummaries,
    fieldMap: plan.fieldMap,
    lintErrors,
    lintWarnings,
  };

  if (!options.checkOnly) {
    for (const fc of filesContent) {
      const targetPath = path.join(blockOutDir, fc.filename);
      const sha12 = writeUtf8Bom(targetPath, fc.text);
      writtenFiles.push({ path: targetPath, bytes: Buffer.byteLength(fc.text, 'utf8'), sha12 });
    }
    const sumPath = path.join(blockOutDir, 'harness-summary.json');
    fs.writeFileSync(sumPath, JSON.stringify(summaryPayload, null, 2) + '\n', 'utf8');
    writtenFiles.push({ path: sumPath, bytes: Buffer.byteLength(JSON.stringify(summaryPayload, null, 2) + '\n', 'utf8') });
  }

  return {
    summary: summaryPayload,
    writtenFiles,
    lintErrors,
    lintWarnings,
  };
}

function generateAll(options) {
  const { manifest, blocks } = loadInputsForBlocks(options);
  const blockReports = [];
  let totalErrors = 0;
  let totalWarnings = 0;

  for (const blk of blocks) {
    const res = generateBlockHarness(blk, manifest, options);
    totalErrors += res.lintErrors.length;
    totalWarnings += res.summary.warnings.length + res.lintWarnings.length;
    blockReports.push({ ...res.summary, writtenFiles: res.writtenFiles });
  }

  const manifestOut = {
    generatedAt: new Date().toISOString(),
    options: {
      manifestMode: options.manifestMode,
      timeScale: options.timeScale,
      marginMs: options.marginMs,
      scanMs: options.scanMs,
      caseIsolation: options.caseIsolation,
      singleFile: options.singleFile,
      checkOnly: options.checkOnly,
    },
    totals: {
      blocks: blockReports.length,
      totalCases: blockReports.reduce((a, b) => a + b.totalCases, 0),
      executedCases: blockReports.reduce((a, b) => a + b.executedCases, 0),
      skippedCases: blockReports.reduce((a, b) => a + b.skippedCases, 0),
      plannedSteps: blockReports.reduce((a, b) => a + b.plannedSteps, 0),
      lintErrors: totalErrors,
      warnings: totalWarnings,
    },
    blocks: blockReports,
  };

  if (!options.checkOnly) {
    fs.mkdirSync(options.outDir, { recursive: true });
    fs.writeFileSync(
      path.join(options.outDir, 'harness-manifest.json'),
      JSON.stringify(manifestOut, null, 2) + '\n',
      'utf8'
    );
  }

  return manifestOut;
}

function main() {
  let opts;
  try {
    opts = parseCliArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  let report;
  try {
    report = generateAll(opts);
  } catch (err) {
    process.stderr.write(`Generation failed: ${err.message}\n`);
    process.exit(1);
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    const t = report.totals;
    console.log(
      `PLC Harness Generator (${opts.checkOnly ? 'check-only' : 'write'}) | mode=${report.options.manifestMode} timeScale=${report.options.timeScale} marginMs=${report.options.marginMs}`
    );
    console.log(
      `Blocks: ${t.blocks} | Cases: ${t.executedCases}/${t.totalCases} executed (${t.skippedCases} skipped) | Steps: ${t.plannedSteps} | LintErrors: ${t.lintErrors} | Warnings: ${t.warnings}`
    );
    for (const b of report.blocks) {
      console.log(
        `  [${b.blockId}] ${b.blockName} (${b.blockType}, ${b.timingMode}): cases=${b.executedCases}/${b.totalCases}, steps=${b.plannedSteps}, lintErr=${b.lintErrors.length}${b.warnings.length ? ` [WARN: ${b.warnings.length}]` : ''}`
      );
      for (const w of b.warnings) {
        console.warn(`     WARN: ${w}`);
      }
      for (const e of b.lintErrors) {
        console.error(`     LINT ERROR: ${e}`);
      }
    }
    if (!opts.checkOnly) {
      console.log(`Output written to: ${opts.outDir}`);
    }
  }

  if (report.totals.lintErrors > 0) {
    process.exit(2);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  generateAll,
  generateBlockHarness,
  buildBlockPlan,
  lintSclSource,
  parseCliArgs,
  resolveHarnessStepTiming,
  detectHardcodedTimerPts,
};
