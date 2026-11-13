#!/usr/bin/env node
'use strict';

/**
 * Route 1 LAD (Ladder) Self-Driving Harness Generator (TIA Portal V20)
 *
 * Parses SimaticML V20 LAD XML (.xml) or SIMATIC SD (.s7dcl) interfaces and
 * emits self-driving Route 1 SCL test harnesses:
 *   - 01_DB_TestSummary.scl      (62-byte non-optimized S7 status DB)
 *   - 02_FB_Harness_<Block>.scl  (Per-case isolated state machine + assertions)
 *   - 03_DB_Harness_<Block>.scl  (Instance DB for FB_Harness_<Block>)
 *   - 04_OB_TestRunner_<Block>.scl (Cyclic OB driving the harness once on RUN)
 *
 * All generated .scl files use CRLF newlines, UTF-8 BOM, and pass lintSclSource
 * (DA008, SE002, AL001, PC008, non-Main OB, pre-header cleanliness) before disk write.
 */

const fs = require('fs');
const path = require('path');
const {
  parseS7TimeToMs,
  parseS7Word,
  parseScanCycleOrDuration,
} = require('./validate-vectors');
const { lintSclSource } = require('./generate-plc-harness');

const ELEMENTARY_TYPES = new Map([
  ['bool', 'Bool'],
  ['sint', 'SInt'],
  ['int', 'Int'],
  ['dint', 'DInt'],
  ['usint', 'USInt'],
  ['uint', 'UInt'],
  ['udint', 'UDInt'],
  ['real', 'Real'],
  ['lreal', 'LReal'],
  ['byte', 'Byte'],
  ['word', 'Word'],
  ['dword', 'DWord'],
  ['time', 'Time'],
]);

function normalizeS7Type(typeName) {
  const raw = String(typeName || '').replace(/"/g, '').replace(/\s+/g, ' ').trim();
  const canonical = ELEMENTARY_TYPES.get(raw.toLowerCase());
  return canonical || raw;
}

function isElementaryType(typeName) {
  return ELEMENTARY_TYPES.has(String(typeName || '').toLowerCase());
}

function stripBom(str) {
  return str.charCodeAt(0) === 0xfeff ? str.slice(1) : str;
}

function decodeXmlEntities(str) {
  return String(str || '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function getXmlAttr(attrText, attrName) {
  const re = new RegExp(`\\b${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i');
  const m = attrText.match(re);
  return m ? decodeXmlEntities(m[1] !== undefined ? m[1] : m[2]) : '';
}

function parseXmlAttrBlockName(xml) {
  const cleanXml = xml.replace(/<!--[\s\S]*?-->/g, '');
  const mBlock = cleanXml.match(/<SW\.Blocks\.(FB|FC)\b/i);
  if (!mBlock) {
    throw new Error('LAD XML must contain <SW.Blocks.FB> or <SW.Blocks.FC>');
  }
  const blockType = mBlock[1].toUpperCase();
  const afterBlock = cleanXml
    .slice(mBlock.index)
    .replace(/<Interface\b[^>]*>[\s\S]*?<\/Interface>/gi, '')
    .replace(/<ObjectList\b[^>]*>[\s\S]*?<\/ObjectList>/gi, '');
  const mName = afterBlock.match(/<AttributeList\b[^>]*>[\s\S]*?<Name>([^<]+)<\/Name>/i);
  if (!mName) {
    throw new Error('Could not find <Name> in LAD XML <AttributeList>');
  }
  return { blockType, blockName: decodeXmlEntities(mName[1]).trim() };
}

function extractTopLevelSectionBody(xml, sectionName) {
  const cleanXml = xml.replace(/<!--[\s\S]*?-->/g, '');
  const ifaceMatch = cleanXml.match(/<Interface\b[^>]*>([\s\S]*?)<\/Interface>/i);
  const searchSrc = ifaceMatch ? ifaceMatch[1] : cleanXml;
  const tagRe = /<\/?Section\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  let depth = 0;
  let targetStart = -1;
  let m;
  while ((m = tagRe.exec(searchSrc)) !== null) {
    const full = m[0];
    const attrs = m[1] || '';
    const isClose = full.startsWith('</');
    const isSelfClosing = !isClose && /\/\s*$/.test(attrs);
    if (isClose) {
      if (depth === 1 && targetStart >= 0) {
        return searchSrc.slice(targetStart, m.index);
      }
      if (depth > 0) depth -= 1;
      continue;
    }
    if (isSelfClosing) {
      if (depth === 0 && getXmlAttr(attrs, 'Name').toLowerCase() === sectionName.toLowerCase()) {
        return '';
      }
      continue;
    }
    depth += 1;
    if (depth === 1 && getXmlAttr(attrs, 'Name').toLowerCase() === sectionName.toLowerCase()) {
      targetStart = tagRe.lastIndex;
    }
  }
  return '';
}

function parseXmlMembers(xml, sectionName) {
  const secBody = extractTopLevelSectionBody(xml, sectionName);
  if (!secBody) return [];
  const members = [];
  const memTagRe = /<\/?Member\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  let depth = 0;
  let m;
  while ((m = memTagRe.exec(secBody)) !== null) {
    const full = m[0];
    const attrs = m[1] || '';
    const isClose = full.startsWith('</');
    const isSelfClosing = !isClose && /\/\s*$/.test(attrs);
    if (isClose) {
      if (depth > 0) depth -= 1;
      continue;
    }
    if (depth === 0) {
      const name = getXmlAttr(attrs, 'Name').trim();
      const dtype = normalizeS7Type(getXmlAttr(attrs, 'Datatype'));
      if (name && dtype) {
        members.push({ name, type: dtype });
      }
    }
    if (!isSelfClosing) depth += 1;
  }
  return members;
}

/**
 * Strip S7DCL / SCL comments (//..., (*...*)) and { ... } attribute blocks
 * while respecting '...' and "..." quoted strings/identifiers.
 */
function stripS7dclCommentsAndAttrs(text) {
  let out = '';
  let i = 0;
  const len = text.length;
  let quote = '';
  let inLineComment = false;
  let inBlockComment = false;
  let braceDepth = 0;
  let braceQuote = '';

  while (i < len) {
    const ch = text[i];
    const next = i + 1 < len ? text[i + 1] : '';

    if (inLineComment) {
      if (ch === '\n' || ch === '\r') {
        inLineComment = false;
        out += ch;
      }
      i += 1;
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && next === ')') {
        inBlockComment = false;
        out += ' ';
        i += 2;
      } else {
        if (ch === '\n' || ch === '\r') out += ch;
        i += 1;
      }
      continue;
    }

    if (braceDepth > 0) {
      if (braceQuote) {
        if (ch === braceQuote) {
          if (next === braceQuote) {
            i += 2;
            continue;
          }
          braceQuote = '';
        }
        i += 1;
        continue;
      }
      if (ch === '"' || ch === "'") {
        braceQuote = ch;
        i += 1;
        continue;
      }
      if (ch === '{') {
        braceDepth += 1;
      } else if (ch === '}') {
        braceDepth -= 1;
        if (braceDepth === 0) out += ' ';
      }
      i += 1;
      continue;
    }

    if (quote) {
      out += ch;
      if (ch === quote) {
        if (next === quote) {
          out += next;
          i += 2;
          continue;
        }
        quote = '';
      }
      i += 1;
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (ch === '(' && next === '*') {
      inBlockComment = true;
      i += 2;
      continue;
    }
    if (ch === '{') {
      braceDepth = 1;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

function splitOutsideQuotes(str, sepChar, firstOnly = false) {
  const parts = [];
  let start = 0;
  let quote = '';
  for (let i = 0; i < str.length; i += 1) {
    const ch = str[i];
    const next = i + 1 < str.length ? str[i + 1] : '';
    if (quote) {
      if (ch === quote) {
        if (next === quote) {
          i += 1;
          continue;
        }
        quote = '';
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === sepChar) {
      // Avoid splitting `:=` when searching for `:`
      if (sepChar === ':' && next === '=') {
        i += 1;
        continue;
      }
      parts.push(str.slice(start, i));
      start = i + 1;
      if (firstOnly) {
        parts.push(str.slice(start));
        return parts;
      }
    }
  }
  parts.push(str.slice(start));
  return parts;
}

function findAssignOutsideQuotes(str) {
  let quote = '';
  for (let i = 0; i < str.length - 1; i += 1) {
    const ch = str[i];
    const next = str[i + 1];
    if (quote) {
      if (ch === quote) {
        if (next === quote) {
          i += 1;
          continue;
        }
        quote = '';
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ':' && next === '=') {
      return i;
    }
  }
  return -1;
}

function parseS7dclIdentifier(token) {
  const trimmed = token.trim();
  if (!trimmed) return '';
  // Handle quoted identifier optionally followed by AT overlay
  if (trimmed.startsWith('"')) {
    const mQ = trimmed.match(/^"((?:[^"]|"")+)"(?:\s+AT\b[\s\S]*)?$/i);
    if (mQ) return mQ[1].replace(/""/g, '"').trim();
  }
  const mU = trimmed.match(/^([^\s,:;"]+)(?:\s+AT\b[\s\S]*)?$/i);
  return mU ? mU[1].trim() : '';
}

function parseS7dclSection(body, sectionKeyword) {
  const clean = stripS7dclCommentsAndAttrs(stripBom(String(body || '')));
  const secRe = new RegExp(
    `\\b${sectionKeyword}(?!_)(?:\\s+(?:RETAIN|NON_RETAIN|CONSTANT))*\\b([\\s\\S]*?)\\bEND_VAR\\b`,
    'gi'
  );
  const res = [];
  let m;
  while ((m = secRe.exec(clean)) !== null) {
    const statements = splitOutsideQuotes(m[1], ';', false);
    for (const rawStmt of statements) {
      const stmt = rawStmt.trim();
      if (!stmt || /^ATTRIBUTE\b/i.test(stmt)) continue;
      const splitColon = splitOutsideQuotes(stmt, ':', true);
      if (splitColon.length !== 2) continue;
      const lhs = splitColon[0].trim();
      const rhs = splitColon[1].trim();
      if (!lhs || !rhs) continue;

      const assignIdx = findAssignOutsideQuotes(rhs);
      const typeRaw = assignIdx >= 0 ? rhs.slice(0, assignIdx).trim() : rhs;
      const dtype = normalizeS7Type(typeRaw);
      if (!dtype) continue;

      const varTokens = splitOutsideQuotes(lhs, ',', false);
      for (const tok of varTokens) {
        const name = parseS7dclIdentifier(tok);
        if (name) {
          res.push({ name, type: dtype });
        }
      }
    }
  }
  return res;
}

function parseLadInterface(filePath) {
  const raw = stripBom(fs.readFileSync(filePath, 'utf8'));
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.xml') {
    const { blockType, blockName } = parseXmlAttrBlockName(raw);
    return {
      format: 'xml',
      blockType,
      blockName,
      inputs: parseXmlMembers(raw, 'Input'),
      outputs: parseXmlMembers(raw, 'Output'),
      inouts: parseXmlMembers(raw, 'InOut'),
    };
  }
  if (ext === '.s7dcl') {
    const clean = stripS7dclCommentsAndAttrs(raw);
    const mHdr = clean.match(
      /\b(FUNCTION_BLOCK|FUNCTION)\s+(?:"((?:[^"]|"")+)"|([A-Za-z_\u00C0-\uFFFF][A-Za-z0-9_.\u00C0-\uFFFF]*))/i
    );
    if (!mHdr) {
      throw new Error(`Could not parse FUNCTION_BLOCK / FUNCTION header in ${filePath}`);
    }
    const blockType = mHdr[1].toUpperCase() === 'FUNCTION_BLOCK' ? 'FB' : 'FC';
    const blockName = (mHdr[2] !== undefined ? mHdr[2].replace(/""/g, '"') : mHdr[3]).trim();
    return {
      format: 's7dcl',
      blockType,
      blockName,
      inputs: parseS7dclSection(clean, 'VAR_INPUT'),
      outputs: parseS7dclSection(clean, 'VAR_OUTPUT'),
      inouts: parseS7dclSection(clean, 'VAR_IN_OUT'),
    };
  }
  throw new Error(`Unsupported LAD DUT extension '${ext}'. Expected .xml or .s7dcl`);
}

function defaultVectorsForBlock(iface) {
  if (iface.blockName === 'FB_Motor_DirectStart_LAD') {
    return {
      blockId: 'LAD01',
      blockName: 'FB_Motor_DirectStart_LAD',
      initialState: {
        inputs: { startBtn: false, stopBtn: false, overloadNC: true },
      },
      testCases: [
        {
          caseId: 'TC01_IDLE_INIT',
          steps: [
            {
              step: 1,
              scanCycleOrDuration: '1 scan cycle',
              inputs: { startBtn: false, stopBtn: false, overloadNC: true },
              expectedOutputs: { motor: false },
            },
          ],
        },
        {
          caseId: 'TC02_START_AND_HOLD',
          steps: [
            {
              step: 1,
              scanCycleOrDuration: '1 scan cycle',
              inputs: { startBtn: true, stopBtn: false, overloadNC: true },
              expectedOutputs: { motor: true },
            },
            {
              step: 2,
              scanCycleOrDuration: '1 scan cycle',
              inputs: { startBtn: false, stopBtn: false, overloadNC: true },
              expectedOutputs: { motor: true },
            },
          ],
        },
        {
          caseId: 'TC03_STOP_RESETS_LATCH',
          steps: [
            {
              step: 1,
              scanCycleOrDuration: '1 scan cycle',
              inputs: { startBtn: true, stopBtn: false, overloadNC: true },
              expectedOutputs: { motor: true },
            },
            {
              step: 2,
              scanCycleOrDuration: '1 scan cycle',
              inputs: { startBtn: false, stopBtn: true, overloadNC: true },
              expectedOutputs: { motor: false },
            },
            {
              step: 3,
              scanCycleOrDuration: '1 scan cycle',
              inputs: { startBtn: false, stopBtn: false, overloadNC: true },
              expectedOutputs: { motor: false },
            },
          ],
        },
        {
          caseId: 'TC04_OVERLOAD_TRIPS_MOTOR',
          steps: [
            {
              step: 1,
              scanCycleOrDuration: '1 scan cycle',
              inputs: { startBtn: true, stopBtn: false, overloadNC: true },
              expectedOutputs: { motor: true },
            },
            {
              step: 2,
              scanCycleOrDuration: '1 scan cycle',
              inputs: { startBtn: true, stopBtn: false, overloadNC: false },
              expectedOutputs: { motor: false },
            },
            {
              step: 3,
              scanCycleOrDuration: '1 scan cycle',
              inputs: { startBtn: false, stopBtn: false, overloadNC: true },
              expectedOutputs: { motor: false },
            },
          ],
        },
        {
          caseId: 'TC05_STOP_OVERRIDES_START',
          steps: [
            {
              step: 1,
              scanCycleOrDuration: '1 scan cycle',
              inputs: { startBtn: true, stopBtn: true, overloadNC: true },
              expectedOutputs: { motor: false },
            },
          ],
        },
      ],
    };
  }
  throw new Error(`No default vector set for '${iface.blockName}'; pass --vectors <jsonPath>`);
}

function defaultJsValueForType(typeName) {
  const t = normalizeS7Type(typeName);
  switch (t) {
    case 'Bool':
      return false;
    case 'SInt':
    case 'Int':
    case 'DInt':
    case 'USInt':
    case 'UInt':
    case 'UDInt':
      return 0;
    case 'Real':
    case 'LReal':
      return 0.0;
    case 'Byte':
      return '16#00';
    case 'Word':
      return '16#0000';
    case 'DWord':
      return '16#00000000';
    case 'Time':
      return 0;
    default:
      throw new Error(`Unsupported S7 type '${typeName}' for default literal`);
  }
}

function parseS7BitString(val, bitWidth, prefixLabel) {
  const maxVal = bitWidth === 8 ? 0xff : bitWidth === 16 ? 0xffff : 0xffffffff;
  if (typeof val === 'number') {
    if (!Number.isInteger(val) || val < 0 || val > maxVal) return null;
    return val >>> 0;
  }
  if (typeof val !== 'string') return null;
  let s = val.trim();
  const typedRe = new RegExp(`^${prefixLabel}#(.+)$`, 'i');
  const mTyped = typedRe.exec(s);
  if (mTyped) s = mTyped[1].trim();
  const mHex = /^(?:16#|0x)([0-9a-fA-F_]+)$/i.exec(s);
  if (mHex) {
    const cleanHex = mHex[1].replace(/_/g, '');
    if (!cleanHex) return null;
    const n = Number.parseInt(cleanHex, 16);
    return Number.isSafeInteger(n) && n >= 0 && n <= maxVal ? n >>> 0 : null;
  }
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return Number.isInteger(n) && n >= 0 && n <= maxVal ? n >>> 0 : null;
  }
  return null;
}

function formatSclReal(num) {
  const n = Number(num);
  if (typeof num !== 'number' || !Number.isFinite(n)) {
    throw new Error(`Invalid Real/LReal literal: ${JSON.stringify(num)}`);
  }
  if (Object.is(n, -0) || n === 0) return '0.0';
  const abs = Math.abs(n);
  if (abs >= 1e-6 && abs < 1e9) {
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

function formatSclLiteral(typeName, val, opts = {}) {
  const { timeScale = 1.0, scaleNonZeroTime = false } = opts;
  const t = normalizeS7Type(typeName);
  switch (t) {
    case 'Bool':
      if (typeof val !== 'boolean') {
        throw new Error(`Invalid Bool literal: expected boolean, got ${JSON.stringify(val)}`);
      }
      return val ? 'TRUE' : 'FALSE';
    case 'SInt': {
      if (typeof val !== 'number' || !Number.isInteger(val) || val < -128 || val > 127) {
        throw new Error(`Invalid SInt literal: ${JSON.stringify(val)}`);
      }
      return `SINT#${val}`;
    }
    case 'Int': {
      if (typeof val !== 'number' || !Number.isInteger(val) || val < -32768 || val > 32767) {
        throw new Error(`Invalid Int literal: ${JSON.stringify(val)}`);
      }
      return `INT#${val}`;
    }
    case 'DInt': {
      if (typeof val !== 'number' || !Number.isInteger(val) || val < -2147483648 || val > 2147483647) {
        throw new Error(`Invalid DInt literal: ${JSON.stringify(val)}`);
      }
      return `DINT#${val}`;
    }
    case 'USInt': {
      if (typeof val !== 'number' || !Number.isInteger(val) || val < 0 || val > 255) {
        throw new Error(`Invalid USInt literal: ${JSON.stringify(val)}`);
      }
      return `USINT#${val}`;
    }
    case 'UInt': {
      if (typeof val !== 'number' || !Number.isInteger(val) || val < 0 || val > 65535) {
        throw new Error(`Invalid UInt literal: ${JSON.stringify(val)}`);
      }
      return `UINT#${val}`;
    }
    case 'UDInt': {
      if (typeof val !== 'number' || !Number.isInteger(val) || val < 0 || val > 4294967295) {
        throw new Error(`Invalid UDInt literal: ${JSON.stringify(val)}`);
      }
      return `UDINT#${val}`;
    }
    case 'Real':
      return formatSclReal(val);
    case 'LReal':
      return `LREAL#${formatSclReal(val)}`;
    case 'Byte': {
      const b = parseS7BitString(val, 8, 'BYTE');
      if (b === null) throw new Error(`Invalid Byte literal: ${JSON.stringify(val)}`);
      return `BYTE#16#${b.toString(16).toUpperCase().padStart(2, '0')}`;
    }
    case 'Word': {
      let w = parseS7Word(val);
      if (w === null) w = parseS7BitString(val, 16, 'WORD');
      if (w === null) throw new Error(`Invalid Word literal: ${JSON.stringify(val)}`);
      return `16#${w.toString(16).toUpperCase().padStart(4, '0')}`;
    }
    case 'DWord': {
      const dw = parseS7BitString(val, 32, 'DWORD');
      if (dw === null) throw new Error(`Invalid DWord literal: ${JSON.stringify(val)}`);
      return `DWORD#16#${dw.toString(16).toUpperCase().padStart(8, '0')}`;
    }
    case 'Time': {
      const ms = typeof val === 'number' ? val : parseS7TimeToMs(val);
      if (ms === null || !Number.isFinite(ms)) {
        throw new Error(`Invalid Time literal: ${JSON.stringify(val)}`);
      }
      const rounded = Math.round(ms);
      if (rounded === 0) return 'T#0s';
      const scaled = scaleNonZeroTime && timeScale !== 1.0 && rounded > 0
        ? Math.max(1, Math.round(rounded * timeScale))
        : rounded;
      return `T#${scaled}ms`;
    }
    default:
      throw new Error(`Unsupported S7 type '${typeName}' for literal ${JSON.stringify(val)}`);
  }
}

function formatDWordMask(bitIndexZeroBased) {
  if (bitIndexZeroBased < 0 || bitIndexZeroBased >= 32) return null;
  const val = (1 << bitIndexZeroBased) >>> 0;
  return `DWORD#16#${val.toString(16).toUpperCase().padStart(8, '0')}`;
}

function emitSummaryDbScl() {
  return [
    `DATA_BLOCK "DB_TestSummary"`,
    `{ S7_Optimized_Access := 'FALSE' }`,
    `VERSION : 0.1`,
    `NON_RETAIN`,
    `   VAR`,
    `      done : Bool := FALSE;`,
    `      passed : Bool := FALSE;`,
    `      running : Bool := FALSE;`,
    `      hasError : Bool := FALSE;`,
    `      totalCases : Int := 0;`,
    `      executedCases : Int := 0;`,
    `      passedCases : Int := 0;`,
    `      failedCases : Int := 0;`,
    `      skippedCases : Int := 0;`,
    `      currentCaseIndex : Int := 0;`,
    `      currentStepIndex : Int := 0;`,
    `      firstFailCase : Int := 0;`,
    `      firstFailStep : Int := 0;`,
    `      firstFailFieldIndex : Int := 0;`,
    `      firstFailIsHmi : Bool := FALSE;`,
    `      padByte23 : Byte := 16#00;`,
    `      firstFailMask : DWord := 16#00000000;`,
    `      statusCode : Word := 16#0000;`,
    `      padWord30 : Word := 16#0000;`,
    `      totalStepsExecuted : DInt := 0;`,
    `      failedStepsCount : DInt := 0;`,
    `      firstFailActualReal : Real := 0.0;`,
    `      firstFailExpectedReal : Real := 0.0;`,
    `      firstFailActualDInt : DInt := 0;`,
    `      firstFailExpectedDInt : DInt := 0;`,
    `      firstFailActualWord : Word := 16#0000;`,
    `      firstFailExpectedWord : Word := 16#0000;`,
    `      firstFailActualBool : Bool := FALSE;`,
    `      firstFailExpectedBool : Bool := FALSE;`,
    `      padByte61 : Byte := 16#00;`,
    `   END_VAR`,
    `BEGIN`,
    `END_DATA_BLOCK`,
    ``,
  ].join('\r\n');
}

function makePinHelpers(iface) {
  const used = new Set();
  const safeMap = new Map();

  const registerPin = (pin) => {
    if (safeMap.has(pin)) return safeMap.get(pin);
    let base = /^[A-Za-z_][A-Za-z0-9_]*$/.test(pin)
      ? pin
      : pin.replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1') || 'pin';
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) {
      candidate = `${base}_${suffix}`;
      suffix += 1;
    }
    used.add(candidate);
    safeMap.set(pin, candidate);
    return candidate;
  };

  for (const m of iface.inputs) registerPin(m.name);
  for (const m of iface.outputs) registerPin(m.name);
  for (const m of iface.inouts) registerPin(m.name);

  const sclArgName = (pin) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(pin) ? pin : `"${pin}"`);
  const safeSuffix = (pin) => safeMap.get(pin);
  return { sclArgName, safeSuffix };
}

function resolveLadStepTiming(stepObj, options) {
  const { scanMs, marginMs, timeScale, timingMode } = options;
  if (stepObj.scanCycleOrDuration == null || String(stepObj.scanCycleOrDuration).trim() === '') {
    return { mode: 'scan_cycles', nominalMs: scanMs, waitMs: 0, minScans: 1, scans: 1 };
  }
  const parsed = parseScanCycleOrDuration(stepObj.scanCycleOrDuration);
  if (!parsed) {
    throw new Error(`Invalid scanCycleOrDuration ${JSON.stringify(stepObj.scanCycleOrDuration)}`);
  }
  if (parsed.kind === 'scan_cycles') {
    const cycles = Math.max(1, parsed.cycles);
    return {
      mode: 'scan_cycles',
      nominalMs: cycles * scanMs,
      waitMs: 0,
      minScans: cycles,
      scans: cycles,
    };
  }
  // parsed.kind === 'duration_ms'
  if (timingMode === 'combinational' || parsed.ms <= scanMs) {
    return {
      mode: 'scan_cycles',
      nominalMs: parsed.ms,
      waitMs: 0,
      minScans: 1,
      scans: 1,
    };
  }
  const waitMs = Math.max(1, Math.round(parsed.ms * timeScale)) + marginMs;
  return {
    mode: 'ton_wait',
    nominalMs: parsed.ms,
    waitMs,
    minScans: 2,
    scans: null,
  };
}

function validateMapKeysAndValues(obj, typeMap, contextLabel, { allowSubset = false, allowEmpty = true } = {}) {
  if (obj === undefined || obj === null) {
    if (!allowEmpty) {
      throw new Error(`${contextLabel}: missing required object`);
    }
    return;
  }
  if (typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error(`${contextLabel}: must be a plain object`);
  }
  for (const [k, v] of Object.entries(obj)) {
    if (!typeMap.has(k)) {
      throw new Error(`${contextLabel}: unknown pin '${k}' (not declared in block interface)`);
    }
    formatSclLiteral(typeMap.get(k), v);
  }
  if (!allowSubset) {
    for (const k of typeMap.keys()) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) {
        throw new Error(`${contextLabel}: missing required pin '${k}' (${typeMap.get(k)})`);
      }
    }
  }
}

function validateVectorsAgainstInterface(vectors, iface) {
  if (!vectors || typeof vectors !== 'object' || Array.isArray(vectors)) {
    throw new Error('Vectors payload must be a JSON object');
  }
  const testCases = Array.isArray(vectors.testCases) ? vectors.testCases : [];
  if (testCases.length === 0) {
    throw new Error(`No testCases in vectors for ${iface.blockName}`);
  }

  const inputTypeMap = new Map(iface.inputs.map((m) => [m.name, normalizeS7Type(m.type)]));
  const outputTypeMap = new Map(iface.outputs.map((m) => [m.name, normalizeS7Type(m.type)]));
  const inoutTypeMap = new Map(iface.inouts.map((m) => [m.name, normalizeS7Type(m.type)]));
  const outputOrInOutMap = new Map([...outputTypeMap, ...inoutTypeMap]);

  if (vectors.initialState !== undefined && vectors.initialState !== null) {
    if (typeof vectors.initialState !== 'object' || Array.isArray(vectors.initialState)) {
      throw new Error('initialState must be a plain object');
    }
    if (vectors.initialState.inputs !== undefined) {
      validateMapKeysAndValues(vectors.initialState.inputs, inputTypeMap, 'initialState.inputs', {
        allowSubset: true,
        allowEmpty: true,
      });
    }
    if (vectors.initialState.inouts !== undefined) {
      validateMapKeysAndValues(vectors.initialState.inouts, inoutTypeMap, 'initialState.inouts', {
        allowSubset: true,
        allowEmpty: true,
      });
    }
  }

  for (let cIdx = 0; cIdx < testCases.length; cIdx += 1) {
    const tc = testCases[cIdx];
    const caseLabel = `testCases[${tc.caseId || cIdx + 1}]`;
    if (!tc || typeof tc !== 'object' || !Array.isArray(tc.steps) || tc.steps.length === 0) {
      throw new Error(`${caseLabel}: steps must be a non-empty array`);
    }
    for (let sIdx = 0; sIdx < tc.steps.length; sIdx += 1) {
      const st = tc.steps[sIdx];
      const stepLabel = `${caseLabel}.step(${st && st.step != null ? st.step : sIdx + 1})`;
      if (!st || typeof st !== 'object') {
        throw new Error(`${stepLabel}: step must be an object`);
      }

      validateMapKeysAndValues(st.inputs, inputTypeMap, `${stepLabel}.inputs`, {
        allowSubset: false,
        allowEmpty: false,
      });
      validateMapKeysAndValues(st.inouts, inoutTypeMap, `${stepLabel}.inouts`, {
        allowSubset: true,
        allowEmpty: true,
      });
      validateMapKeysAndValues(st.expectedOutputs, outputOrInOutMap, `${stepLabel}.expectedOutputs`, {
        allowSubset: true,
        allowEmpty: true,
      });
      validateMapKeysAndValues(st.expectedInOuts, inoutTypeMap, `${stepLabel}.expectedInOuts`, {
        allowSubset: true,
        allowEmpty: true,
      });

      if (st.expectedOutputs && st.expectedInOuts) {
        for (const [k, expIoVal] of Object.entries(st.expectedInOuts)) {
          if (Object.prototype.hasOwnProperty.call(st.expectedOutputs, k)) {
            const dtype = inoutTypeMap.get(k);
            if (formatSclLiteral(dtype, expIoVal) !== formatSclLiteral(dtype, st.expectedOutputs[k])) {
              throw new Error(
                `${stepLabel}: conflicting assertions for InOut pin '${k}' between expectedOutputs and expectedInOuts`
              );
            }
          }
        }
      }
    }
  }

  return { inputTypeMap, outputTypeMap, inoutTypeMap };
}

function generateDutCallBlock(iface, blockName, pinHelpers, indent) {
  const { sclArgName, safeSuffix } = pinHelpers;
  const pad = ' '.repeat(indent);
  const args = [
    ...iface.inputs.map((m) => `${sclArgName(m.name)} := #in_${safeSuffix(m.name)}`),
    ...iface.inouts.map((m) => `${sclArgName(m.name)} := #io_${safeSuffix(m.name)}`),
    ...iface.outputs.map((m) => `${sclArgName(m.name)} => #out_${safeSuffix(m.name)}`),
  ];

  if (iface.blockType === 'FC') {
    return `${pad}"${blockName}"(${args.join(', ')});`;
  }
  return null;
}

function generateAssertionLines(step, fieldLookup, pinHelpers, realTol, indent) {
  const { safeSuffix } = pinHelpers;
  const pad = ' '.repeat(indent);
  const inner = ' '.repeat(indent + 3);
  const lines = [];

  const emitFieldCheck = (fieldMeta, expectedRaw) => {
    const t = normalizeS7Type(fieldMeta.type);
    const actualExpr =
      fieldMeta.bucket === 'expectedInOuts'
        ? `#io_${safeSuffix(fieldMeta.name)}`
        : `#out_${safeSuffix(fieldMeta.name)}`;
    let condExpr = '';
    const recLines = [];

    if (t === 'Bool') {
      const expBool = Boolean(expectedRaw);
      condExpr = expBool ? `NOT ${actualExpr}` : `${actualExpr}`;
      recLines.push(`${inner}   "DB_TestSummary".firstFailActualBool := ${actualExpr};`);
      recLines.push(`${inner}   "DB_TestSummary".firstFailExpectedBool := ${expBool ? 'TRUE' : 'FALSE'};`);
    } else if (t === 'Real') {
      const expNum = Number(expectedRaw);
      const effTol = Math.max(realTol.abs, realTol.rel * Math.abs(expNum));
      const expLit = formatSclReal(expNum);
      const tolLit = effTol === 1e-5 ? '1.0E-5' : formatSclReal(effTol);
      condExpr = `NOT (ABS(${actualExpr} - ${expLit}) <= ${tolLit})`;
      recLines.push(`${inner}   "DB_TestSummary".firstFailActualReal := ${actualExpr};`);
      recLines.push(`${inner}   "DB_TestSummary".firstFailExpectedReal := ${expLit};`);
    } else if (t === 'LReal') {
      const expNum = Number(expectedRaw);
      const effTol = Math.max(realTol.abs, realTol.rel * Math.abs(expNum));
      const expLit = formatSclReal(expNum);
      const tolLit = effTol === 1e-5 ? 'LREAL#1.0E-5' : `LREAL#${formatSclReal(effTol)}`;
      condExpr = `NOT (ABS(${actualExpr} - LREAL#${expLit}) <= ${tolLit})`;
      recLines.push(`${inner}   "DB_TestSummary".firstFailActualReal := LREAL_TO_REAL(${actualExpr});`);
      recLines.push(`${inner}   "DB_TestSummary".firstFailExpectedReal := LREAL_TO_REAL(LREAL#${expLit});`);
    } else if (t === 'Time') {
      const ms = Math.round(parseS7TimeToMs(expectedRaw));
      const lit = formatSclLiteral('Time', expectedRaw);
      condExpr = `${actualExpr} <> ${lit}`;
      recLines.push(`${inner}   "DB_TestSummary".firstFailActualDInt := TIME_TO_DINT(${actualExpr});`);
      recLines.push(`${inner}   "DB_TestSummary".firstFailExpectedDInt := DINT#${ms};`);
    } else if (t === 'SInt' || t === 'Int' || t === 'USInt' || t === 'UInt') {
      const lit = formatSclLiteral(t, expectedRaw);
      const convFn = `${t.toUpperCase()}_TO_DINT`;
      condExpr = `${actualExpr} <> ${lit}`;
      recLines.push(`${inner}   "DB_TestSummary".firstFailActualDInt := ${convFn}(${actualExpr});`);
      recLines.push(`${inner}   "DB_TestSummary".firstFailExpectedDInt := DINT#${Number(expectedRaw)};`);
    } else if (t === 'DInt') {
      const lit = formatSclLiteral('DInt', expectedRaw);
      condExpr = `${actualExpr} <> ${lit}`;
      recLines.push(`${inner}   "DB_TestSummary".firstFailActualDInt := ${actualExpr};`);
      recLines.push(`${inner}   "DB_TestSummary".firstFailExpectedDInt := ${lit};`);
    } else if (t === 'UDInt') {
      const lit = formatSclLiteral('UDInt', expectedRaw);
      condExpr = `${actualExpr} <> ${lit}`;
      recLines.push(`${inner}   "DB_TestSummary".firstFailActualDInt := UDINT_TO_DINT(${actualExpr});`);
      recLines.push(`${inner}   "DB_TestSummary".firstFailExpectedDInt := UDINT_TO_DINT(${lit});`);
    } else if (t === 'Byte') {
      const lit = formatSclLiteral('Byte', expectedRaw);
      condExpr = `${actualExpr} <> ${lit}`;
      recLines.push(`${inner}   "DB_TestSummary".firstFailActualWord := BYTE_TO_WORD(${actualExpr});`);
      recLines.push(`${inner}   "DB_TestSummary".firstFailExpectedWord := BYTE_TO_WORD(${lit});`);
    } else if (t === 'Word') {
      const lit = formatSclLiteral('Word', expectedRaw);
      condExpr = `${actualExpr} <> ${lit}`;
      recLines.push(`${inner}   "DB_TestSummary".firstFailActualWord := ${actualExpr};`);
      recLines.push(`${inner}   "DB_TestSummary".firstFailExpectedWord := ${lit};`);
    } else if (t === 'DWord') {
      const lit = formatSclLiteral('DWord', expectedRaw);
      condExpr = `${actualExpr} <> ${lit}`;
      recLines.push(`${inner}   "DB_TestSummary".firstFailActualDInt := DWORD_TO_DINT(${actualExpr});`);
      recLines.push(`${inner}   "DB_TestSummary".firstFailExpectedDInt := DWORD_TO_DINT(${lit});`);
    } else {
      throw new Error(`Unsupported assertion type '${fieldMeta.type}' for '${fieldMeta.name}'`);
    }

    lines.push(`${pad}IF ${condExpr} THEN`);
    lines.push(`${inner}#statStepFailed := TRUE;`);
    lines.push(`${inner}#statCaseFailed := TRUE;`);
    const maskHex = formatDWordMask(fieldMeta.index - 1);
    if (maskHex) {
      lines.push(
        `${inner}IF ("DB_TestSummary".firstFailCase = 0) OR (("DB_TestSummary".firstFailCase = #statCurrentCaseNum) AND ("DB_TestSummary".firstFailStep = #statCurrentStepNum)) THEN`
      );
      lines.push(`${inner}   "DB_TestSummary".firstFailMask := "DB_TestSummary".firstFailMask OR ${maskHex};`);
      lines.push(`${inner}END_IF;`);
    }
    lines.push(`${inner}IF "DB_TestSummary".firstFailCase = 0 THEN`);
    lines.push(`${inner}   "DB_TestSummary".firstFailCase := #statCurrentCaseNum;`);
    lines.push(`${inner}   "DB_TestSummary".firstFailStep := #statCurrentStepNum;`);
    lines.push(`${inner}   "DB_TestSummary".firstFailFieldIndex := INT#${fieldMeta.index};`);
    lines.push(`${inner}   "DB_TestSummary".firstFailIsHmi := FALSE;`);
    lines.push(...recLines);
    lines.push(`${inner}END_IF;`);
    lines.push(`${pad}END_IF;`);
  };

  for (const [k, expVal] of Object.entries(step.assertOutputs)) {
    const fieldMeta = fieldLookup.get(`out:${k}`);
    emitFieldCheck(fieldMeta, expVal);
  }
  for (const [k, expVal] of Object.entries(step.assertInOuts)) {
    const fieldMeta = fieldLookup.get(`io:${k}`);
    emitFieldCheck(fieldMeta, expVal);
  }

  return lines.join('\r\n');
}

function resolveVectorsForDut(dutPath, vectorsPath, iface) {
  if (vectorsPath) {
    return JSON.parse(stripBom(fs.readFileSync(vectorsPath, 'utf8')));
  }
  const siblingVectors = dutPath.replace(/\.(xml|s7dcl)$/i, '.vectors.json');
  if (siblingVectors !== dutPath && fs.existsSync(siblingVectors)) {
    return JSON.parse(stripBom(fs.readFileSync(siblingVectors, 'utf8')));
  }
  return defaultVectorsForBlock(iface);
}

function generateLadHarness({
  dutPath,
  vectorsPath = '',
  outDir,
  scanMs = 10,
  marginMs = 20,
  timeScale = 1.0,
  timingMode = 'auto',
  checkOnly = false,
} = {}) {
  if (!dutPath) {
    throw new Error('dutPath is required');
  }
  if (!outDir && !checkOnly) {
    throw new Error('outDir is required unless checkOnly=true');
  }
  if (!Number.isFinite(scanMs) || scanMs <= 0) {
    throw new Error(`Invalid scanMs ${scanMs}; must be > 0`);
  }
  if (!Number.isInteger(marginMs) || marginMs < 0) {
    throw new Error(`Invalid marginMs ${marginMs}; must be a non-negative integer`);
  }
  if (!Number.isFinite(timeScale) || timeScale <= 0 || timeScale > 10) {
    throw new Error(`Invalid timeScale ${timeScale}; must be in (0, 10]`);
  }

  const iface = parseLadInterface(dutPath);
  const vectors = resolveVectorsForDut(dutPath, vectorsPath, iface);
  const { outputTypeMap, inoutTypeMap } = validateVectorsAgainstInterface(vectors, iface);

  const blockName = iface.blockName;
  const fbHarnessName = `FB_Harness_${blockName}`;
  const dbHarnessName = `DB_Harness_${blockName}`;
  const obRunnerName = `OB_TestRunner_${blockName}`;
  const testCases = vectors.testCases;
  const pinHelpers = makePinHelpers(iface);
  const { sclArgName, safeSuffix } = pinHelpers;

  const fieldMap = [];
  const fieldLookup = new Map();
  for (const m of iface.outputs) {
    const entry = {
      index: fieldMap.length + 1,
      name: m.name,
      bucket: 'expectedOutputs',
      isHmi: false,
      type: normalizeS7Type(m.type),
    };
    fieldMap.push(entry);
    fieldLookup.set(`out:${m.name}`, entry);
  }
  for (const m of iface.inouts) {
    const entry = {
      index: fieldMap.length + 1,
      name: m.name,
      bucket: 'expectedInOuts',
      isHmi: false,
      type: normalizeS7Type(m.type),
    };
    fieldMap.push(entry);
    fieldLookup.set(`io:${m.name}`, entry);
  }

  const realTol = {
    abs: vectors.tolerances && typeof vectors.tolerances.realAbs === 'number' ? vectors.tolerances.realAbs : 1e-5,
    rel: vectors.tolerances && typeof vectors.tolerances.realRel === 'number' ? vectors.tolerances.realRel : 1e-6,
  };

  const timingOpts = {
    scanMs,
    marginMs,
    timeScale,
    timingMode: timingMode === 'auto' ? vectors.timingMode || 'auto' : timingMode,
  };

  const flatSteps = [];
  const initialInOuts = (vectors.initialState && vectors.initialState.inouts) || {};
  const activeDutCount = iface.blockType === 'FB' ? testCases.length : 0;

  for (let cIdx = 0; cIdx < testCases.length; cIdx += 1) {
    const tc = testCases[cIdx];
    const caseNum = cIdx + 1;
    const dutSlot = iface.blockType === 'FB' ? caseNum : 0;
    const steps = tc.steps;

    for (let sIdx = 0; sIdx < steps.length; sIdx += 1) {
      const st = steps[sIdx];
      const assertOutputs = {};
      const assertInOuts = {};

      for (const [k, v] of Object.entries(st.expectedOutputs || {})) {
        if (outputTypeMap.has(k)) {
          assertOutputs[k] = v;
        } else if (inoutTypeMap.has(k)) {
          assertInOuts[k] = v;
        }
      }
      for (const [k, v] of Object.entries(st.expectedInOuts || {})) {
        assertInOuts[k] = v;
      }

      const timing = resolveLadStepTiming(st, timingOpts);
      flatSteps.push({
        planUid: flatSteps.length + 1,
        caseNum,
        caseId: tc.caseId || `TC_${caseNum}`,
        dutSlot,
        stepNum: st.step != null ? st.step : sIdx + 1,
        isFirstInCase: sIdx === 0,
        isLastInCase: sIdx === steps.length - 1,
        inputs: st.inputs || {},
        inouts: st.inouts || {},
        assertOutputs,
        assertInOuts,
        timing,
      });
    }
  }

  const hasTonWait = flatSteps.some((s) => s.timing.mode === 'ton_wait');
  const hasMultiScan = flatSteps.some((s) => (s.timing.scans || 1) > 1);
  const resolvedTimingMode =
    timingOpts.timingMode !== 'auto'
      ? timingOpts.timingMode
      : hasTonWait
        ? 'ton_time'
        : hasMultiScan
          ? 'scan_cycles'
          : 'combinational';

  const estimatedTimeMs = flatSteps.reduce(
    (acc, st) => acc + (st.timing.mode === 'ton_wait' ? st.timing.waitMs : st.timing.scans * scanMs) + 3 * scanMs,
    0
  );

  const lines = [];
  lines.push(`FUNCTION_BLOCK "${fbHarnessName}"`);
  lines.push(`{ S7_Optimized_Access := 'TRUE' }`);
  lines.push(`VERSION : 0.1`);
  lines.push(`   VAR_INPUT`);
  lines.push(`      start : Bool := TRUE;`);
  lines.push(`      reset : Bool := FALSE;`);
  lines.push(`   END_VAR`);
  lines.push(`   VAR_OUTPUT`);
  lines.push(`      done : Bool := FALSE;`);
  lines.push(`      passed : Bool := FALSE;`);
  lines.push(`   END_VAR`);
  lines.push(`   VAR`);
  lines.push(`      statState : Int := 0;`);
  lines.push(`      statPlanIdx : Int := 0;`);
  lines.push(`      statActiveDut : Int := 0;`);
  lines.push(`      statCurrentCaseNum : Int := 0;`);
  lines.push(`      statCurrentStepNum : Int := 0;`);
  lines.push(`      statIsLastStepInCase : Bool := FALSE;`);
  lines.push(`      statUseTonWait : Bool := FALSE;`);
  lines.push(`      statPrevStart : Bool := FALSE;`);
  lines.push(`      statPrevReset : Bool := FALSE;`);
  lines.push(`      statCaseFailed : Bool := FALSE;`);
  lines.push(`      statStepFailed : Bool := FALSE;`);
  lines.push(`      statDone : Bool := FALSE;`);
  lines.push(`      statPassed : Bool := FALSE;`);
  lines.push(`      statTargetScans : DInt := 1;`);
  lines.push(`      statExecScans : DInt := 0;`);
  lines.push(`      statMinWaitScans : DInt := 2;`);
  lines.push(`      statWaitPt : Time := T#0s;`);
  if (hasTonWait) {
    lines.push(`      instStepTimer : TON_TIME;`);
  }
  for (let slot = 1; slot <= activeDutCount; slot += 1) {
    lines.push(`      instDut_${slot} : "${blockName}";`);
  }
  for (const m of iface.inputs) {
    const t = normalizeS7Type(m.type);
    const defLit = formatSclLiteral(t, defaultJsValueForType(t));
    lines.push(`      in_${safeSuffix(m.name)} : ${t} := ${defLit};`);
  }
  for (const m of iface.outputs) {
    const t = normalizeS7Type(m.type);
    const defLit = formatSclLiteral(t, defaultJsValueForType(t));
    lines.push(`      out_${safeSuffix(m.name)} : ${t} := ${defLit};`);
  }
  for (const m of iface.inouts) {
    const t = normalizeS7Type(m.type);
    if (isElementaryType(t)) {
      const defLit = formatSclLiteral(t, defaultJsValueForType(t));
      lines.push(`      io_${safeSuffix(m.name)} : ${t} := ${defLit};`);
    } else {
      lines.push(`      io_${safeSuffix(m.name)} : "${t}";`);
    }
  }
  lines.push(`   END_VAR`);
  lines.push(`   VAR_TEMP`);
  lines.push(`      tempStartEdge : Bool;`);
  lines.push(`      tempResetEdge : Bool;`);
  lines.push(`      tempCallDut : Bool;`);
  if (hasTonWait) {
    lines.push(`      tempTimerEn : Bool;`);
    lines.push(`      tempTimerPt : Time;`);
  }
  lines.push(`      tempActBool : Bool;`);
  lines.push(`      tempExpBool : Bool;`);
  lines.push(`      tempActReal : Real;`);
  lines.push(`      tempExpReal : Real;`);
  lines.push(`      tempActDInt : DInt;`);
  lines.push(`      tempExpDInt : DInt;`);
  lines.push(`      tempActWord : Word;`);
  lines.push(`      tempExpWord : Word;`);
  lines.push(`   END_VAR`);
  lines.push(`   VAR CONSTANT`);
  lines.push(`      STATE_IDLE : Int := 0;`);
  lines.push(`      STATE_STEP_LOAD : Int := 10;`);
  lines.push(`      STATE_EXEC_SCANS : Int := 40;`);
  if (hasTonWait) {
    lines.push(`      STATE_TON_WAIT : Int := 50;`);
  }
  lines.push(`      STATE_STEP_CHECK : Int := 60;`);
  lines.push(`      STATE_COMPLETE : Int := 90;`);
  lines.push(`      TOTAL_PLAN_STEPS : Int := ${flatSteps.length};`);
  lines.push(`      TOTAL_CASES : Int := ${testCases.length};`);
  lines.push(`   END_VAR`);
  lines.push(`BEGIN`);
  lines.push(`   #tempStartEdge := #start AND (NOT #statPrevStart);`);
  lines.push(`   #statPrevStart := #start;`);
  lines.push(`   #tempResetEdge := #reset AND (NOT #statPrevReset);`);
  lines.push(`   #statPrevReset := #reset;`);
  lines.push(`   #tempCallDut := FALSE;`);
  if (hasTonWait) {
    lines.push(`   #tempTimerEn := FALSE;`);
    lines.push(`   #tempTimerPt := T#0s;`);
  }
  lines.push(`   #tempActBool := FALSE;`);
  lines.push(`   #tempExpBool := FALSE;`);
  lines.push(`   #tempActReal := 0.0;`);
  lines.push(`   #tempExpReal := 0.0;`);
  lines.push(`   #tempActDInt := 0;`);
  lines.push(`   #tempExpDInt := 0;`);
  lines.push(`   #tempActWord := 16#0000;`);
  lines.push(`   #tempExpWord := 16#0000;`);
  lines.push(``);
  lines.push(`   IF #tempResetEdge THEN`);
  lines.push(`      #statState := #STATE_IDLE;`);
  lines.push(`      #statPlanIdx := 0;`);
  lines.push(`      #statDone := FALSE;`);
  lines.push(`      #statPassed := FALSE;`);
  lines.push(`      #statCaseFailed := FALSE;`);
  lines.push(`      #statStepFailed := FALSE;`);
  lines.push(`      "DB_TestSummary".done := FALSE;`);
  lines.push(`      "DB_TestSummary".passed := FALSE;`);
  lines.push(`      "DB_TestSummary".running := FALSE;`);
  lines.push(`      "DB_TestSummary".hasError := FALSE;`);
  lines.push(`      "DB_TestSummary".statusCode := 16#0000;`);
  lines.push(`   END_IF;`);
  lines.push(``);
  lines.push(`   CASE #statState OF`);
  lines.push(`      #STATE_IDLE:`);
  lines.push(`         "DB_TestSummary".done := FALSE;`);
  lines.push(`         "DB_TestSummary".passed := FALSE;`);
  lines.push(`         "DB_TestSummary".running := FALSE;`);
  lines.push(`         "DB_TestSummary".hasError := FALSE;`);
  lines.push(`         "DB_TestSummary".totalCases := #TOTAL_CASES;`);
  lines.push(`         "DB_TestSummary".executedCases := 0;`);
  lines.push(`         "DB_TestSummary".passedCases := 0;`);
  lines.push(`         "DB_TestSummary".failedCases := 0;`);
  lines.push(`         "DB_TestSummary".skippedCases := 0;`);
  lines.push(`         "DB_TestSummary".currentCaseIndex := 0;`);
  lines.push(`         "DB_TestSummary".currentStepIndex := 0;`);
  lines.push(`         "DB_TestSummary".firstFailCase := 0;`);
  lines.push(`         "DB_TestSummary".firstFailStep := 0;`);
  lines.push(`         "DB_TestSummary".firstFailFieldIndex := 0;`);
  lines.push(`         "DB_TestSummary".firstFailIsHmi := FALSE;`);
  lines.push(`         "DB_TestSummary".firstFailMask := 16#00000000;`);
  lines.push(`         "DB_TestSummary".statusCode := 16#0000;`);
  lines.push(`         "DB_TestSummary".totalStepsExecuted := 0;`);
  lines.push(`         "DB_TestSummary".failedStepsCount := 0;`);
  lines.push(`         "DB_TestSummary".firstFailActualReal := 0.0;`);
  lines.push(`         "DB_TestSummary".firstFailExpectedReal := 0.0;`);
  lines.push(`         "DB_TestSummary".firstFailActualDInt := 0;`);
  lines.push(`         "DB_TestSummary".firstFailExpectedDInt := 0;`);
  lines.push(`         "DB_TestSummary".firstFailActualWord := 16#0000;`);
  lines.push(`         "DB_TestSummary".firstFailExpectedWord := 16#0000;`);
  lines.push(`         "DB_TestSummary".firstFailActualBool := FALSE;`);
  lines.push(`         "DB_TestSummary".firstFailExpectedBool := FALSE;`);
  lines.push(`         IF #tempStartEdge OR (#start AND (NOT #statDone)) THEN`);
  lines.push(`            "DB_TestSummary".running := TRUE;`);
  lines.push(`            "DB_TestSummary".statusCode := 16#0001;`);
  lines.push(`            #statDone := FALSE;`);
  lines.push(`            #statPassed := FALSE;`);
  lines.push(`            #statCaseFailed := FALSE;`);
  lines.push(`            #statStepFailed := FALSE;`);
  lines.push(`            IF #TOTAL_PLAN_STEPS > 0 THEN`);
  lines.push(`               #statPlanIdx := 1;`);
  lines.push(`               #statState := #STATE_STEP_LOAD;`);
  lines.push(`            ELSE`);
  lines.push(`               #statState := #STATE_COMPLETE;`);
  lines.push(`            END_IF;`);
  lines.push(`         END_IF;`);

  // STATE_STEP_LOAD
  lines.push(``);
  lines.push(`      #STATE_STEP_LOAD:`);
  lines.push(`         #statExecScans := 0;`);
  lines.push(`         #statStepFailed := FALSE;`);
  lines.push(`         CASE #statPlanIdx OF`);
  for (const step of flatSteps) {
    lines.push(`            ${step.planUid}: // ${step.caseId} step ${step.stepNum}`);
    lines.push(`               #statCurrentCaseNum := INT#${step.caseNum};`);
    lines.push(`               #statActiveDut := INT#${step.dutSlot};`);
    lines.push(`               #statCurrentStepNum := INT#${step.stepNum};`);
    lines.push(`               #statIsLastStepInCase := ${step.isLastInCase ? 'TRUE' : 'FALSE'};`);
    lines.push(`               #statUseTonWait := ${step.timing.mode === 'ton_wait' ? 'TRUE' : 'FALSE'};`);
    lines.push(`               #statTargetScans := DINT#${step.timing.scans != null ? step.timing.scans : 1};`);
    lines.push(`               #statMinWaitScans := DINT#${step.timing.minScans || 2};`);
    lines.push(`               #statWaitPt := T#${step.timing.waitMs > 0 ? `${step.timing.waitMs}ms` : '0s'};`);
    if (step.isFirstInCase) {
      lines.push(`               #statCaseFailed := FALSE;`);
    }
    for (const m of iface.inputs) {
      const val = step.inputs[m.name];
      const lit = formatSclLiteral(m.type, val, { timeScale, scaleNonZeroTime: true });
      lines.push(`               #in_${safeSuffix(m.name)} := ${lit};`);
    }
    for (const m of iface.inouts) {
      const hasStepIo = Object.prototype.hasOwnProperty.call(step.inouts, m.name);
      if (step.isFirstInCase) {
        const hasInitIo = Object.prototype.hasOwnProperty.call(initialInOuts, m.name);
        const rawVal = hasStepIo
          ? step.inouts[m.name]
          : hasInitIo
            ? initialInOuts[m.name]
            : defaultJsValueForType(m.type);
        const lit = formatSclLiteral(m.type, rawVal, { timeScale, scaleNonZeroTime: true });
        lines.push(`               #io_${safeSuffix(m.name)} := ${lit};`);
      } else if (hasStepIo) {
        const lit = formatSclLiteral(m.type, step.inouts[m.name], { timeScale, scaleNonZeroTime: true });
        lines.push(`               #io_${safeSuffix(m.name)} := ${lit};`);
      }
    }
  }
  lines.push(`            ELSE`);
  lines.push(`               "DB_TestSummary".hasError := TRUE;`);
  lines.push(`               "DB_TestSummary".statusCode := 16#80FF;`);
  lines.push(`               #statState := #STATE_COMPLETE;`);
  lines.push(`         END_CASE;`);
  lines.push(``);
  lines.push(`         IF #statState = #STATE_STEP_LOAD THEN`);
  lines.push(`            "DB_TestSummary".currentCaseIndex := #statCurrentCaseNum;`);
  lines.push(`            "DB_TestSummary".currentStepIndex := #statCurrentStepNum;`);
  if (hasTonWait) {
    lines.push(`            IF #statUseTonWait THEN`);
    lines.push(`               #statState := #STATE_TON_WAIT;`);
    lines.push(`            ELSE`);
    lines.push(`               #statState := #STATE_EXEC_SCANS;`);
    lines.push(`            END_IF;`);
  } else {
    lines.push(`            #statState := #STATE_EXEC_SCANS;`);
  }
  lines.push(`         END_IF;`);

  // STATE_EXEC_SCANS
  lines.push(``);
  lines.push(`      #STATE_EXEC_SCANS:`);
  lines.push(`         #tempCallDut := TRUE;`);
  lines.push(`         #statExecScans := #statExecScans + 1;`);

  // STATE_TON_WAIT
  if (hasTonWait) {
    lines.push(``);
    lines.push(`      #STATE_TON_WAIT:`);
    lines.push(`         #tempCallDut := TRUE;`);
    lines.push(`         #tempTimerEn := TRUE;`);
    lines.push(`         #tempTimerPt := #statWaitPt;`);
    lines.push(`         #statExecScans := #statExecScans + 1;`);
  }

  // STATE_STEP_CHECK
  lines.push(``);
  lines.push(`      #STATE_STEP_CHECK:`);
  lines.push(`         "DB_TestSummary".totalStepsExecuted := "DB_TestSummary".totalStepsExecuted + 1;`);
  lines.push(`         CASE #statPlanIdx OF`);
  for (const step of flatSteps) {
    const assertText = generateAssertionLines(step, fieldLookup, pinHelpers, realTol, 15);
    if (assertText) {
      lines.push(`            ${step.planUid}: // ${step.caseId} step ${step.stepNum}`);
      lines.push(assertText);
    }
  }
  lines.push(`            ELSE`);
  lines.push(`               #statStepFailed := FALSE;`);
  lines.push(`         END_CASE;`);
  lines.push(`         IF #statStepFailed THEN`);
  lines.push(`            "DB_TestSummary".failedStepsCount := "DB_TestSummary".failedStepsCount + 1;`);
  lines.push(`         END_IF;`);
  lines.push(`         IF #statIsLastStepInCase THEN`);
  lines.push(`            "DB_TestSummary".executedCases := "DB_TestSummary".executedCases + 1;`);
  lines.push(`            IF #statCaseFailed THEN`);
  lines.push(`               "DB_TestSummary".failedCases := "DB_TestSummary".failedCases + 1;`);
  lines.push(`            ELSE`);
  lines.push(`               "DB_TestSummary".passedCases := "DB_TestSummary".passedCases + 1;`);
  lines.push(`            END_IF;`);
  lines.push(`         END_IF;`);
  lines.push(`         IF #statPlanIdx < #TOTAL_PLAN_STEPS THEN`);
  lines.push(`            #statPlanIdx := #statPlanIdx + 1;`);
  lines.push(`            #statState := #STATE_STEP_LOAD;`);
  lines.push(`         ELSE`);
  lines.push(`            #statState := #STATE_COMPLETE;`);
  lines.push(`         END_IF;`);

  // STATE_COMPLETE
  lines.push(``);
  lines.push(`      #STATE_COMPLETE:`);
  lines.push(`         #statDone := TRUE;`);
  lines.push(
    `         #statPassed := ("DB_TestSummary".failedCases = 0) AND ("DB_TestSummary".failedStepsCount = 0) AND (NOT "DB_TestSummary".hasError);`
  );
  lines.push(`         "DB_TestSummary".running := FALSE;`);
  lines.push(`         "DB_TestSummary".done := TRUE;`);
  lines.push(`         "DB_TestSummary".passed := #statPassed;`);
  lines.push(`         IF NOT "DB_TestSummary".hasError THEN`);
  lines.push(`            IF #statPassed THEN`);
  lines.push(`               "DB_TestSummary".statusCode := 16#0002;`);
  lines.push(`            ELSE`);
  lines.push(`               "DB_TestSummary".statusCode := 16#0003;`);
  lines.push(`            END_IF;`);
  lines.push(`         END_IF;`);
  lines.push(`      ELSE`);
  lines.push(`         "DB_TestSummary".hasError := TRUE;`);
  lines.push(`         "DB_TestSummary".statusCode := 16#80FD;`);
  lines.push(`         #statState := #STATE_COMPLETE;`);
  lines.push(`   END_CASE;`);
  lines.push(``);

  // Unified single DUT invocation per scan
  lines.push(`   IF #tempCallDut THEN`);
  if (iface.blockType === 'FB') {
    const argParts = [
      ...iface.inputs.map((m) => `${sclArgName(m.name)} := #in_${safeSuffix(m.name)}`),
      ...iface.inouts.map((m) => `${sclArgName(m.name)} := #io_${safeSuffix(m.name)}`),
      ...iface.outputs.map((m) => `${sclArgName(m.name)} => #out_${safeSuffix(m.name)}`),
    ];
    lines.push(`      CASE #statActiveDut OF`);
    for (let slot = 1; slot <= activeDutCount; slot += 1) {
      lines.push(`         ${slot}:`);
      lines.push(`            #instDut_${slot}(${argParts.join(', ')});`);
    }
    lines.push(`         ELSE`);
    lines.push(`            "DB_TestSummary".hasError := TRUE;`);
    lines.push(`            "DB_TestSummary".statusCode := 16#80FE;`);
    lines.push(`            #statState := #STATE_COMPLETE;`);
    lines.push(`      END_CASE;`);
  } else {
    lines.push(generateDutCallBlock(iface, blockName, pinHelpers, 6));
  }
  lines.push(`   END_IF;`);
  lines.push(``);

  // Unified single TON_TIME call every scan (AL001)
  if (hasTonWait) {
    lines.push(`   #instStepTimer(IN := #tempTimerEn, PT := #tempTimerPt);`);
    lines.push(``);
  }

  // Post-DUT transitions
  lines.push(`   IF #statState = #STATE_EXEC_SCANS THEN`);
  lines.push(`      IF #statExecScans >= #statTargetScans THEN`);
  lines.push(`         #statState := #STATE_STEP_CHECK;`);
  lines.push(`      END_IF;`);
  if (hasTonWait) {
    lines.push(`   ELSIF #statState = #STATE_TON_WAIT THEN`);
    lines.push(`      IF #instStepTimer.Q AND (#statExecScans >= #statMinWaitScans) THEN`);
    lines.push(`         #statState := #STATE_STEP_CHECK;`);
    lines.push(`      END_IF;`);
  }
  lines.push(`   END_IF;`);
  lines.push(``);

  // Write-only output update (DA008)
  lines.push(`   #done := #statDone;`);
  lines.push(`   #passed := #statPassed;`);
  lines.push(`END_FUNCTION_BLOCK`);
  lines.push(``);

  const fbHarnessScl = lines.join('\r\n');
  const dbHarnessScl = [
    `DATA_BLOCK "${dbHarnessName}"`,
    `{ S7_Optimized_Access := 'TRUE' }`,
    `VERSION : 0.1`,
    `NON_RETAIN`,
    `"${fbHarnessName}"`,
    `BEGIN`,
    `END_DATA_BLOCK`,
    ``,
  ].join('\r\n');
  const obRunnerScl = [
    `ORGANIZATION_BLOCK "${obRunnerName}"`,
    `{ S7_Optimized_Access := 'TRUE' }`,
    `VERSION : 0.1`,
    `   VAR_TEMP`,
    `      tempRunEnable : Bool;`,
    `      tempResetRun : Bool;`,
    `   END_VAR`,
    `BEGIN`,
    `   #tempRunEnable := TRUE;`,
    `   #tempResetRun := FALSE;`,
    `   "${dbHarnessName}"(start := #tempRunEnable, reset := #tempResetRun);`,
    `END_ORGANIZATION_BLOCK`,
    ``,
  ].join('\r\n');

  const files = {
    '01_DB_TestSummary.scl': emitSummaryDbScl(),
    [`02_${fbHarnessName}.scl`]: fbHarnessScl,
    [`03_${dbHarnessName}.scl`]: dbHarnessScl,
    [`04_${obRunnerName}.scl`]: obRunnerScl,
  };

  const lintErrors = [];
  const renderedFiles = [];
  for (const [fname, content] of Object.entries(files)) {
    const withBom = content.charCodeAt(0) === 0xfeff ? content : `\uFEFF${content}`;
    const lint = lintSclSource(withBom, { requireBom: true, label: fname });
    for (const err of lint.errors) lintErrors.push(`${fname}: ${err}`);
    renderedFiles.push([fname, withBom]);
  }
  if (lintErrors.length > 0) {
    throw new Error(`LAD Harness lint failed: ${lintErrors.join(' | ')}`);
  }

  const summaryMeta = {
    blockId: vectors.blockId || 'LAD01',
    blockName,
    blockType: iface.blockType,
    timingMode: resolvedTimingMode,
    totalCases: testCases.length,
    executedCases: testCases.length,
    skippedCases: 0,
    plannedSteps: flatSteps.length,
    estimatedTimeMs,
    fieldMap,
    files: Object.keys(files),
    dutFormat: iface.format,
  };

  if (!checkOnly) {
    fs.mkdirSync(outDir, { recursive: true });
    for (const [fname, withBom] of renderedFiles) {
      fs.writeFileSync(path.join(outDir, fname), withBom, 'utf8');
    }
    fs.writeFileSync(path.join(outDir, 'harness-summary.json'), JSON.stringify(summaryMeta, null, 2) + '\n', 'utf8');
  }

  return summaryMeta;
}

function parseCliArgs(argv) {
  const opts = {
    dutPath: '',
    vectorsPath: '',
    outDir: '',
    scanMs: 10,
    marginMs: 20,
    timeScale: 1.0,
    timingMode: 'auto',
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
    if (arg === '-h' || arg === '--help') opts.help = true;
    else if (arg === '--dut' || arg === '--lad') opts.dutPath = path.resolve(nextVal());
    else if (arg === '--vectors') opts.vectorsPath = path.resolve(nextVal());
    else if (arg === '--out-dir') opts.outDir = path.resolve(nextVal());
    else if (arg === '--scan-ms') opts.scanMs = Number(nextVal());
    else if (arg === '--margin-ms') opts.marginMs = Number(nextVal());
    else if (arg === '--time-scale') opts.timeScale = Number(nextVal());
    else if (arg === '--timing-mode') opts.timingMode = nextVal();
    else if (arg === '--check-only') opts.checkOnly = true;
    else if (arg === '--json') opts.json = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return opts;
}

if (require.main === module) {
  try {
    const opts = parseCliArgs(process.argv.slice(2));
    if (opts.help) {
      console.log(
        'Usage: node lad-harness.js --dut <path.xml|.s7dcl> [--vectors <path.json>] --out-dir <dir> [--scan-ms 10] [--margin-ms 20] [--time-scale 1.0] [--check-only] [--json]'
      );
      process.exit(0);
    }
    const meta = generateLadHarness(opts);
    if (opts.json) {
      console.log(JSON.stringify(meta, null, 2));
    } else {
      console.log(
        `[lad-harness] ${meta.blockId} ${meta.blockName} (${meta.blockType}, ${meta.timingMode}): cases=${meta.executedCases}/${meta.totalCases}, steps=${meta.plannedSteps}, estMs=${meta.estimatedTimeMs}`
      );
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  parseLadInterface,
  parseS7dclSection,
  defaultVectorsForBlock,
  formatSclLiteral,
  emitSummaryDbScl,
  validateVectorsAgainstInterface,
  resolveLadStepTiming,
  generateLadHarness,
  parseCliArgs,
};
