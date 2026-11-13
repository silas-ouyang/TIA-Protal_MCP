#!/usr/bin/env node
/**
 * P2-2 Phase 0: benchmarks/test_vectors/*.json 实证校验器
 *
 * 依据 golden_library/scl/*.scl 与 golden_library/udt/*.xml 的真实接口/类型定义，
 * 校验 15 个测试向量文件的结构完整性、端口与 UDT 字段一致性和字面量合法性，
 * 并检测 scanCycleOrDuration、别名对一致性、单调时间与边沿连续置位等工程特性。
 *
 * 用法：
 *   node.exe validate-vectors.js [--strict] [--json] [--block <BlockName>] [--manifest <path>]
 */

'use strict';

const fs = require('fs');
const path = require('path');

const BENCHMARKS_DIR = path.resolve(__dirname, '..');
const VECTORS_DIR = path.join(BENCHMARKS_DIR, 'test_vectors');
const SCL_DIR = path.join(BENCHMARKS_DIR, 'golden_library', 'scl');
const UDT_DIR = path.join(BENCHMARKS_DIR, 'golden_library', 'udt');
const DEFAULT_MANIFEST_PATH = path.join(__dirname, 'deviation-manifest.json');

const KNOWN_CATEGORIES = new Set([
  'POWER_ON_INIT',
  'NORMAL_FLOW',
  'ESTOP_DURING_MOTION',
  'RESET_WHILE_ESTOP_ACTIVE',
  'SENSOR_CONFLICT_OR_STUCK',
  'ACTION_TIMEOUT',
  'MODE_SWITCH_TRANSIENT',
  'COMMAND_CONFLICT',
  'CASE_ELSE_ILLEGAL_STATE',
]);

const KNOWN_MANIFEST_KINDS = new Set([
  'VECTOR_SPEC_MISMATCH',
  'CASE_DEPENDS_ON_PRIVATE_STATE',
  'EDGE_RESET_OMITTED_BETWEEN_STEPS',
  'MULTI_STEP_TIMING_APPROXIMATION',
  'INTERNAL_STATE_NOT_READ_FROM_IOHMI',
]);

const KNOWN_OFFLINE_ACTIONS = new Set([
  'report_vector_spec_mismatch',
  'inject_private_var',
  'insert_edge_reset_cycle',
  'adapt_cycles',
  'adapt_step_timing',
  'adapt_step_timing_and_check_known',
]);

const KNOWN_PLC_ACTIONS = new Set([
  'skip_vector_scl_mismatch',
  'run_prefix_sequence',
  'insert_false_edge_cycle',
  'run_extra_settle_scan',
  'skip_untestable_private_state',
]);

/**
 * 解析 IEC 61131-3 TIME 字面量（如 T#0s、T#500ms、T#1m30s）为毫秒整数。
 * @param {unknown} val
 * @returns {number|null}
 */
function parseS7TimeToMs(val) {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val !== 'string') return null;
  const s = val.trim();
  const m = /^(?:T|TIME)#([+-]?)(.+)$/i.exec(s);
  if (!m) return null;
  const sign = m[1] === '-' ? -1 : 1;
  const body = m[2];
  const partRx = /(\d+(?:\.\d+)?)(ms|us|ns|d|h|m|s)/gi;
  let total = 0;
  let consumed = 0;
  let match;
  while ((match = partRx.exec(body)) !== null) {
    if (match.index !== consumed && body.slice(consumed, match.index) !== '_') return null;
    const num = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (!Number.isFinite(num)) return null;
    if (unit === 'd') total += num * 86400000;
    else if (unit === 'h') total += num * 3600000;
    else if (unit === 'm') total += num * 60000;
    else if (unit === 's') total += num * 1000;
    else if (unit === 'ms') total += num;
    else if (unit === 'us') total += num / 1000;
    else if (unit === 'ns') total += num / 1000000;
    consumed = partRx.lastIndex;
  }
  if (consumed === 0 || body.slice(consumed).replace(/_/g, '') !== '') return null;
  return sign * total;
}

/**
 * 解析 S7 WORD 字面量（如 "16#8401" 或数值）为 0..65535 整数。
 * @param {unknown} val
 * @returns {number|null}
 */
function parseS7Word(val) {
  if (typeof val === 'number' && Number.isInteger(val) && val >= 0 && val <= 0xffff) {
    return val;
  }
  if (typeof val !== 'string') return null;
  const s = val.trim();
  const hexMatch = /^(?:16#|0x)([0-9a-fA-F_]+)$/i.exec(s);
  if (hexMatch) {
    const n = parseInt(hexMatch[1].replace(/_/g, ''), 16);
    return Number.isInteger(n) && n >= 0 && n <= 0xffff ? n : null;
  }
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return Number.isInteger(n) && n >= 0 && n <= 0xffff ? n : null;
  }
  return null;
}

/**
 * 统一解析 scanCycleOrDuration 字符串（支持 "<n>ms" 与 "<n> scan cycle(s)"）。
 * @param {unknown} raw
 * @returns {{ kind: 'duration_ms'|'scan_cycles', ms: number|null, cycles: number|null, raw: string }|null}
 */
function parseScanCycleOrDuration(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  const msMatch = /^(\d+(?:\.\d+)?)\s*ms$/i.exec(s);
  if (msMatch) {
    const ms = Number(msMatch[1]);
    if (!Number.isFinite(ms) || ms < 0) return null;
    return { kind: 'duration_ms', ms, cycles: null, raw: s };
  }
  const cycMatch = /^(\d+)\s*scan\s*cycles?$/i.exec(s);
  if (cycMatch) {
    const cycles = Number(cycMatch[1]);
    if (!Number.isInteger(cycles) || cycles <= 0) return null;
    return { kind: 'scan_cycles', ms: null, cycles, raw: s };
  }
  return null;
}

/**
 * 从 .scl 源码解析块类型与 VAR_INPUT / VAR_OUTPUT / VAR_IN_OUT / VAR 声明表。
 * @param {string} sclText
 */
function parseSclInterface(sclText) {
  const clean = sclText.replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/);
  let kind = 'UNKNOWN';
  let name = '';
  for (const line of lines) {
    const m = /^\s*(FUNCTION_BLOCK|FUNCTION)\s+"([^"]+)"/i.exec(line);
    if (m) {
      kind = m[1].toUpperCase() === 'FUNCTION_BLOCK' ? 'FB' : 'FC';
      name = m[2];
      break;
    }
  }
  const sections = {
    VAR_INPUT: {},
    VAR_OUTPUT: {},
    VAR_IN_OUT: {},
    VAR: {},
    VAR_TEMP: {},
    VAR_CONSTANT: {},
  };
  let curSection = null;
  for (const rawLine of lines) {
    const line = rawLine.replace(/\/\/.*$/, '').trim();
    if (!line) continue;
    const secStart = /^(VAR_INPUT|VAR_OUTPUT|VAR_IN_OUT|VAR_TEMP|VAR_CONSTANT|VAR(?:\s+CONSTANT)?)\b/i.exec(line);
    if (secStart) {
      curSection = secStart[1].toUpperCase().replace(/\s+/g, '_');
      continue;
    }
    if (/^END_VAR\b/i.test(line)) {
      curSection = null;
      continue;
    }
    if (/^BEGIN\b/i.test(line)) break;
    if (!curSection || !sections[curSection]) continue;
    const decl = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^;:]+?)(?:\s*:=\s*([^;]+))?;/.exec(line);
    if (decl) {
      sections[curSection][decl[1]] = decl[2].trim().replace(/^"|"$/g, '');
    }
  }
  return { kind, name, sections };
}

/**
 * 从 SimaticML UDT XML 解析 <Member Name="..." Datatype="...">。
 * @param {string} xmlText
 */
function parseUdtMembers(xmlText) {
  const members = {};
  const rx = /<Member\s+Name="([^"]+)"\s+Datatype="([^"]+)"/g;
  let m;
  while ((m = rx.exec(xmlText)) !== null) {
    members[m[1]] = m[2];
  }
  return members;
}

/**
 * 校验值是否符合指定 SCL/S7 数据类型。
 * @param {unknown} val
 * @param {string} s7Type
 * @returns {boolean}
 */
function validateS7ValueType(val, s7Type) {
  const t = s7Type.toUpperCase();
  if (t === 'BOOL') return typeof val === 'boolean';
  if (t === 'INT') return typeof val === 'number' && Number.isInteger(val) && val >= -32768 && val <= 32767;
  if (t === 'DINT') return typeof val === 'number' && Number.isInteger(val) && val >= -2147483648 && val <= 2147483647;
  if (t === 'REAL') return typeof val === 'number' && Number.isFinite(val);
  if (t === 'TIME') return parseS7TimeToMs(val) !== null;
  if (t === 'WORD') return parseS7Word(val) !== null;
  return true;
}

function normalizeForAliasCompare(obj) {
  if (Array.isArray(obj)) return obj.map(normalizeForAliasCompare);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const k of Object.keys(obj).sort()) {
      out[k] = normalizeForAliasCompare(obj[k]);
    }
    return out;
  }
  return obj;
}

function deepEqual(a, b) {
  return JSON.stringify(normalizeForAliasCompare(a)) === JSON.stringify(normalizeForAliasCompare(b));
}

function validateValueMap(mapObj, schemaTypes, contextLabel, errors, allowSubset) {
  if (!mapObj || typeof mapObj !== 'object' || Array.isArray(mapObj)) {
    errors.push(`${contextLabel}: 必须是非数组对象`);
    return;
  }
  for (const [key, val] of Object.entries(mapObj)) {
    if (!(key in schemaTypes)) {
      errors.push(`${contextLabel}.${key}: 不存在于对应的 SCL/UDT 定义中`);
      continue;
    }
    if (!validateS7ValueType(val, schemaTypes[key])) {
      errors.push(`${contextLabel}.${key}: 值 ${JSON.stringify(val)} 不符合类型 ${schemaTypes[key]}`);
    }
  }
  if (!allowSubset) {
    for (const key of Object.keys(schemaTypes)) {
      if (!(key in mapObj)) {
        errors.push(`${contextLabel}: 缺少必需字段 ${key} (${schemaTypes[key]})`);
      }
    }
  }
}

/**
 * 校验全部或指定测试向量文件，返回结构化结果。
 */
function validateAll(options = {}) {
  const filterBlock = options.block || null;
  const manifestPath = options.manifestPath || DEFAULT_MANIFEST_PATH;
  let manifest = null;
  if (fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''));
  }

  const vectorFiles = fs.readdirSync(VECTORS_DIR).filter((f) => f.endsWith('.json')).sort();
  const reports = [];
  let totalCases = 0;
  let totalSteps = 0;
  let totalErrors = 0;
  let totalWarnings = 0;

  for (const fileName of vectorFiles) {
    const filePath = path.join(VECTORS_DIR, fileName);
    const json = JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
    const blockName = json.blockName || path.basename(fileName, '.json');
    if (filterBlock && blockName !== filterBlock && json.blockId !== filterBlock) continue;

    const errors = [];
    const warnings = [];
    const info = [];

    for (const reqKey of ['blockId', 'blockName', 'udtName', 'specReference', 'initialState', 'testCases']) {
      if (!(reqKey in json)) errors.push(`缺少顶层必需字段 ${reqKey}`);
    }

    const sclPath = path.join(SCL_DIR, `${blockName}.scl`);
    const udtPath = path.join(UDT_DIR, `${json.udtName}.xml`);
    if (!fs.existsSync(sclPath)) {
      errors.push(`找不到对应 SCL 源文件: ${sclPath}`);
    }
    if (!fs.existsSync(udtPath)) {
      errors.push(`找不到对应 UDT XML 文件: ${udtPath}`);
    }

    let scl = null;
    let udtMembers = {};
    if (fs.existsSync(sclPath)) {
      scl = parseSclInterface(fs.readFileSync(sclPath, 'utf8'));
      if (scl.name !== blockName) {
        errors.push(`SCL 块名 ${scl.name} 与 JSON blockName ${blockName} 不一致`);
      }
    }
    if (fs.existsSync(udtPath)) {
      udtMembers = parseUdtMembers(fs.readFileSync(udtPath, 'utf8'));
    }

    if (json.initialState && scl) {
      validateValueMap(json.initialState.inputs, scl.sections.VAR_INPUT, 'initialState.inputs', errors, false);
      validateValueMap(json.initialState.ioHmi, udtMembers, 'initialState.ioHmi', errors, false);
      if (json.initialState.internalState && typeof json.initialState.internalState === 'object') {
        for (const k of Object.keys(json.initialState.internalState)) {
          if (!(k in scl.sections.VAR) && !(k in udtMembers)) {
            info.push(`initialState.internalState.${k}: 属于说明性/规范态键，不在 SCL VAR 中`);
          }
        }
      }
    }

    const cases = Array.isArray(json.testCases) ? json.testCases : [];
    if (cases.length === 0) errors.push('testCases 不能为空');

    let lastCaseEndElapsed = -1;
    let caseCount = 0;
    let stepCount = 0;
    let hasCycleFormat = false;
    let hasMsFormat = false;

    for (const tc of cases) {
      caseCount += 1;
      const tcPrefix = `testCases[${tc.caseId || caseCount}]`;
      if (!tc.caseId) errors.push(`${tcPrefix}: 缺少 caseId`);
      if (!KNOWN_CATEGORIES.has(tc.category)) {
        errors.push(`${tcPrefix}: 未知 category "${tc.category}"`);
      }
      const steps = Array.isArray(tc.steps) ? tc.steps : [];
      if (steps.length === 0) errors.push(`${tcPrefix}: steps 不能为空`);

      let prevStepNum = 0;
      let prevStepElapsed = -1;
      for (const st of steps) {
        stepCount += 1;
        const stPrefix = `${tcPrefix}.step(${st.step})`;
        if (st.step !== prevStepNum + 1) {
          errors.push(`${stPrefix}: step 编号不连续 (期望 ${prevStepNum + 1})`);
        }
        prevStepNum = st.step;

        if ('waitMs' in st || 'cycles' in st || 'tolerance' in st) {
          warnings.push(`${stPrefix}: 出现非标准扩展键 waitMs/cycles/tolerance`);
        }

        const parsedDur = parseScanCycleOrDuration(st.scanCycleOrDuration);
        if (!parsedDur) {
          errors.push(`${stPrefix}: scanCycleOrDuration "${st.scanCycleOrDuration}" 无法解析`);
        } else if (parsedDur.kind === 'scan_cycles') {
          hasCycleFormat = true;
        } else {
          hasMsFormat = true;
        }

        if (typeof st.elapsedTimeMs !== 'number' || st.elapsedTimeMs < 0) {
          errors.push(`${stPrefix}: elapsedTimeMs 必须为非负数`);
        } else {
          if (st.elapsedTimeMs < prevStepElapsed) {
            warnings.push(`${stPrefix}: 同 Case 内 elapsedTimeMs 回退 (${prevStepElapsed} -> ${st.elapsedTimeMs})`);
          }
          prevStepElapsed = st.elapsedTimeMs;
        }

        const inHmi = st.ioHmi_in || st.ioHmi;
        if (st.ioHmi && st.ioHmi_in && !deepEqual(st.ioHmi, st.ioHmi_in)) {
          errors.push(`${stPrefix}: ioHmi 与 ioHmi_in 不一致`);
        }
        const expHmi = st.expectedHmi_out || st.expectedHmi;
        if (st.expectedHmi && st.expectedHmi_out && !deepEqual(st.expectedHmi, st.expectedHmi_out)) {
          errors.push(`${stPrefix}: expectedHmi 与 expectedHmi_out 不一致`);
        }

        if (scl) {
          validateValueMap(st.inputs, scl.sections.VAR_INPUT, `${stPrefix}.inputs`, errors, false);
          validateValueMap(inHmi, udtMembers, `${stPrefix}.ioHmi_in`, errors, false);
          validateValueMap(st.expectedOutputs, scl.sections.VAR_OUTPUT, `${stPrefix}.expectedOutputs`, errors, false);
          validateValueMap(expHmi, udtMembers, `${stPrefix}.expectedHmi_out`, errors, true);
        }
      }

      if (steps.length > 0) {
        const firstElapsed = steps[0].elapsedTimeMs;
        if (lastCaseEndElapsed >= 0 && firstElapsed < lastCaseEndElapsed) {
          info.push(`${tcPrefix}: 跨 Case elapsedTimeMs 回落 (${lastCaseEndElapsed} -> ${firstElapsed})，Case 独立起始时间`);
        }
        lastCaseEndElapsed = steps[steps.length - 1].elapsedTimeMs;
      }
    }

    if (hasCycleFormat && hasMsFormat) {
      info.push('该块混用 "<n> scan cycle(s)" 与 "<n>ms" 两种 scanCycleOrDuration 格式');
    }

    const manifestDevs = manifest && Array.isArray(manifest.deviations)
      ? manifest.deviations.filter((d) => d.blockName === blockName)
      : [];

    const caseStepMap = new Map();
    for (const tc of cases) {
      const sSet = new Set();
      if (Array.isArray(tc.steps)) {
        for (const st of tc.steps) sSet.add(st.step);
      }
      caseStepMap.set(tc.caseId, sSet);
    }

    if (!manifest) {
      warnings.push(`未加载 deviation-manifest.json (${manifestPath})`);
    } else {
      const bp = manifest.blockPolicies && manifest.blockPolicies[blockName];
      if (!bp) {
        errors.push(`deviation-manifest.json 缺少 blockPolicies.${blockName}`);
      } else {
        if (bp.blockId !== json.blockId) {
          errors.push(`manifest.blockPolicies.${blockName}.blockId (${bp.blockId}) != ${json.blockId}`);
        }
        if (scl && bp.blockType !== scl.kind) {
          errors.push(`manifest.blockPolicies.${blockName}.blockType (${bp.blockType}) != ${scl.kind}`);
        }
      }

      for (const dev of manifestDevs) {
        for (const reqKey of ['id', 'blockName', 'caseId', 'kind', 'sclEvidence', 'offlineEvalAction', 'plcHarnessAction']) {
          if (typeof dev[reqKey] !== 'string' || !dev[reqKey].trim()) {
            errors.push(`manifest deviation "${dev.id || '?'}" 缺少非空字段 ${reqKey}`);
          }
        }
        if (dev.kind && !KNOWN_MANIFEST_KINDS.has(dev.kind)) {
          errors.push(`manifest deviation "${dev.id}" 使用了未知 kind "${dev.kind}"`);
        }
        if (dev.offlineEvalAction && !KNOWN_OFFLINE_ACTIONS.has(dev.offlineEvalAction)) {
          errors.push(`manifest deviation "${dev.id}" 使用了未知 offlineEvalAction "${dev.offlineEvalAction}"`);
        }
        if (dev.plcHarnessAction && !KNOWN_PLC_ACTIONS.has(dev.plcHarnessAction)) {
          errors.push(`manifest deviation "${dev.id}" 使用了未知 plcHarnessAction "${dev.plcHarnessAction}"`);
        }
        const sSet = caseStepMap.get(dev.caseId);
        if (!sSet) {
          errors.push(`manifest deviation "${dev.id}" 指向不存在的 caseId "${dev.caseId}"`);
        } else {
          if (dev.step != null && !sSet.has(dev.step)) {
            errors.push(`manifest deviation "${dev.id}" 指向 ${dev.caseId} 中不存在的 step=${dev.step}`);
          }
          if (dev.stepOverrides && typeof dev.stepOverrides === 'object') {
            for (const stepKey of Object.keys(dev.stepOverrides)) {
              const sNum = Number(stepKey);
              if (!Number.isInteger(sNum) || !sSet.has(sNum)) {
                errors.push(`manifest deviation "${dev.id}" stepOverrides 包含无效步号 "${stepKey}"`);
              }
            }
          }
        }
        if (
          dev.privateInit &&
          (!Array.isArray(dev.prefixSteps) || dev.prefixSteps.length === 0) &&
          dev.plcHarnessAction !== 'run_prefix_sequence' &&
          dev.plcHarnessAction !== 'skip_untestable_private_state'
        ) {
          errors.push(
            `manifest deviation "${dev.id}" 含 privateInit 但缺少 prefixSteps，plcHarnessAction 不能为 "${dev.plcHarnessAction}"`
          );
        }
      }
    }

    totalCases += caseCount;
    totalSteps += stepCount;
    totalErrors += errors.length;
    totalWarnings += warnings.length;

    reports.push({
      blockId: json.blockId,
      blockName,
      sclKind: scl ? scl.kind : 'UNKNOWN',
      udtName: json.udtName,
      cases: caseCount,
      steps: stepCount,
      errors,
      warnings,
      info,
      manifestDeviationsCount: manifestDevs.length,
    });
  }

  const manifestErrors = [];
  if (!manifest) {
    manifestErrors.push(`缺少 deviation-manifest.json: ${manifestPath}`);
  } else {
    const knownBlocks = new Set(reports.map((r) => r.blockName));
    const seenIds = new Set();
    for (const dev of manifest.deviations || []) {
      if (dev.id) {
        if (seenIds.has(dev.id)) manifestErrors.push(`deviation-manifest.json 存在重复 id: ${dev.id}`);
        seenIds.add(dev.id);
      }
      if (!filterBlock && !knownBlocks.has(dev.blockName)) {
        manifestErrors.push(`manifest deviation "${dev.id || '?'}" 指向未知块名 "${dev.blockName}"`);
      }
    }
    if (!filterBlock && manifest.blockPolicies) {
      for (const bName of Object.keys(manifest.blockPolicies)) {
        if (!knownBlocks.has(bName)) {
          manifestErrors.push(`manifest blockPolicies 包含未知块名 "${bName}"`);
        }
      }
    }
  }
  totalErrors += manifestErrors.length;

  return {
    summary: {
      blocks: reports.length,
      cases: totalCases,
      steps: totalSteps,
      errors: totalErrors,
      warnings: totalWarnings,
      manifestDeviations: manifest && Array.isArray(manifest.deviations) ? manifest.deviations.length : 0,
      passed: totalErrors === 0,
    },
    manifestErrors,
    reports,
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let asJson = false;
  let strict = false;
  let block = null;
  let manifestPath = DEFAULT_MANIFEST_PATH;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--json') asJson = true;
    else if (args[i] === '--strict') strict = true;
    else if (args[i] === '--block' && args[i + 1]) block = args[++i];
    else if (args[i] === '--manifest' && args[i + 1]) manifestPath = args[++i];
  }
  const result = validateAll({ block, manifestPath });
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(
      `[validate-vectors] blocks=${result.summary.blocks}, cases=${result.summary.cases}, steps=${result.summary.steps}, manifestDevs=${result.summary.manifestDeviations}, errors=${result.summary.errors}, warnings=${result.summary.warnings}`
    );
    for (const me of result.manifestErrors) {
      console.log(`  [MANIFEST_ERROR] ${me}`);
    }
    for (const r of result.reports) {
      const status = r.errors.length === 0 ? 'PASS' : 'FAIL';
      console.log(
        `  ${status} ${r.blockId} ${r.blockName} (${r.sclKind}, ${r.cases} cases / ${r.steps} steps, warn=${r.warnings.length}, manifestDevs=${r.manifestDeviationsCount})`
      );
      for (const e of r.errors) console.log(`    [ERROR] ${e}`);
      for (const w of r.warnings) console.log(`    [WARN]  ${w}`);
      for (const inf of r.info) console.log(`    [INFO]  ${inf}`);
    }
  }
  const failCount = strict ? result.summary.errors + result.summary.warnings : result.summary.errors;
  process.exit(failCount > 0 ? 1 : 0);
}

module.exports = {
  parseS7TimeToMs,
  parseS7Word,
  parseScanCycleOrDuration,
  parseSclInterface,
  parseUdtMembers,
  validateAll,
};
