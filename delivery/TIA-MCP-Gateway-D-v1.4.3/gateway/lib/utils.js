'use strict';
/*
 * gateway/lib/utils.js — 网关 D 的无状态常量与纯函数工具库。
 *
 * 职责：
 *  - 基础配置读取（CONFIG_PATH / config）与路径解析（resolvePath，基准为 gateway 根目录）
 *  - 块文件编码落盘（writeBlockFile，处理 .scl / .s7dcl / .s7res / .xml 的 BOM 规则）
 *  - 名称/路径规范化（slug / stripRoot / normalizeBlockTarget / stamp）
 *  - MCP 结果包装与失败判定（textOf / ok / fail / isToolFailure / isTolerableFailure / extractProjectName）
 *  - 编译诊断解析（parseLoose / compileHasErrors）
 *  - 版本探测与路由映射（versionFromPath / normalizeVersion / pickServerForVersion / resolveConnectVersion）
 */

const fs = require('fs');
const path = require('path');

const PROTOCOL = '2025-06-18';
const VERSION = '1.4.3';
const GATEWAY_DIR = path.resolve(__dirname, '..');
const CONFIG_PATH = process.env.D_GATEWAY_CONFIG || path.join(GATEWAY_DIR, 'd.config.json');
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

const IS_WINDOWS = process.platform === 'win32';

function log(...args) {
  process.stderr.write('[D] ' + args.join(' ') + '\n');
}

/**
 * 配置里的路径支持相对写法（相对 gateway.js 所在目录）。
 * 这样整个交付包可以随便搬位置，不用改配置。
 */
function resolvePath(p) {
  if (!p) return p;
  const s = String(p).trim();
  if (!s) return s;
  if (/^[A-Za-z]:[\\/]/.test(s) || s.startsWith('\\\\') || s.startsWith('/')) return s; // 已是绝对路径
  return path.resolve(GATEWAY_DIR, s);
}

/* ------------------------------------------------------------------ */
/* 工作目录 / 编码 / 名称规范化                                        */
/* ------------------------------------------------------------------ */

const WIN_RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function hasNonAscii(text) {
  return /[^\x00-\x7F]/.test(text);
}

/**
 * 按博途的坑写文件：
 *  - .scl 纯 ASCII → 无 BOM；含中文 → 必须带 BOM，否则被当 GBK 读成乱码
 *  - .s7dcl / .s7res / .xml → 一律带 BOM
 */
function writeBlockFile(filePath, content, format) {
  const needsBom = format === 'scl' ? hasNonAscii(content) : true;
  const payload = needsBom ? '\uFEFF' + content : content;
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, payload, 'utf8');
  return { path: filePath, bom: needsBom, bytes: Buffer.byteLength(payload, 'utf8') };
}

function slug(s) {
  let out = String(s || 'block')
    .replace(/[\\/:*?"<>|\s]+/g, '_') // 非法字符
    .replace(/\.{2,}/g, '_') // 连续点（防路径穿越）
    .replace(/^\.+|\.+$/g, '') // 首尾点
    .slice(0, 60);
  if (!out) out = 'block';
  if (WIN_RESERVED.test(out)) out = '_' + out;
  return out;
}

/**
 * 剥掉博途"根容器"前缀。
 * B 的报错里会显示 `程序块/Main`，AI 很容易照着把 `程序块/` 一起传进来；
 * 但 McpGuides.cs:148 明确：Program blocks（程序块）这个容器**不是路径的一部分**，
 * 根级块必须用裸名。带上前缀反而会去找一个叫"程序块"的用户文件夹然后失败。
 */
const ROOT_CONTAINER_PREFIX = /^(?:Program blocks|程序块)[\\/]+/i;

function stripRoot(p) {
  let out = String(p == null ? '' : p).trim();
  // 可能被叠了多层（程序块/Program blocks/xxx）
  while (ROOT_CONTAINER_PREFIX.test(out)) out = out.replace(ROOT_CONTAINER_PREFIX, '');
  return out.replace(/^[\\/]+|[\\/]+$/g, '');
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/* ------------------------------------------------------------------ */
/* 工具结果辅助                                                        */
/* ------------------------------------------------------------------ */

function textOf(result) {
  if (!result) return '';
  if (Array.isArray(result.content)) {
    return result.content.map((c) => (c.type === 'text' ? c.text : `[${c.type}]`)).join('\n');
  }
  if (result.structuredContent) return JSON.stringify(result.structuredContent, null, 1);
  return JSON.stringify(result, null, 1);
}

function ok(payload) {
  return {
    content: [{ type: 'text', text: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 1) }],
  };
}

function fail(message, extra) {
  const body = extra ? `${message}\n\n${JSON.stringify(extra, null, 1)}` : message;
  return { content: [{ type: 'text', text: body }], isError: true };
}

/**
 * 统一判定"工具调用是否失败"。
 * MCP 的工具失败有两种形态，都不会抛异常：
 *   1) CallToolResult { isError: true }
 *   2) 正常返回，但载荷里 ok/success/Ready === false，或 meta.success === false
 * 只靠 try/catch 判断失败是错的——回退分支永远走不到。
 */
function isToolFailure(res) {
  if (!res) return true;
  if (res.isError) return true;
  let obj = null;
  try {
    obj = JSON.parse(textOf(res));
  } catch {
    return false;
  }
  if (!obj || typeof obj !== 'object') return false;
  if (obj.ok === false || obj.success === false || obj.ready === false || obj.Ready === false) return true;
  if (obj.meta && obj.meta.success === false) return true;
  if (obj.Meta && obj.Meta.success === false) return true;
  // 编译结果的大小写两种都要认：B 序列化出来是小写 state（真机见 {"state":"Error","errorCount":4}），
  // 认出来才能在 CompileSoftware 这一步停下，而不是走到 MoveBlockToGroup 报"inconsistent"
  const st = obj.State ?? obj.state ?? obj.overallState ?? obj.OverallState;
  if (typeof st === 'string' && /^(error|failed|failure)$/i.test(st.trim())) return true;
  return false;
}

/** 从各种形状里挖出工程名：数组 / {items} / {projects} / 单个对象 */
function extractProjectName(text) {
  let obj = null;
  try {
    obj = JSON.parse(text);
  } catch {
    const m = text.match(/"(?:projectName|ProjectName|name|Name)"\s*:\s*"([^"]+)"/);
    return m ? m[1] : null;
  }
  const pick = (o) => (o && (o.projectName || o.ProjectName || o.name || o.Name)) || null;
  if (Array.isArray(obj)) return obj.length === 1 ? pick(obj[0]) : null;
  const direct = pick(obj);
  if (direct) return direct;
  for (const key of ['items', 'Items', 'projects', 'Projects', 'sessions', 'Sessions']) {
    if (Array.isArray(obj[key])) return obj[key].length === 1 ? pick(obj[key][0]) : null;
  }
  if (obj.project) return pick(obj.project);
  return null;
}

/* ------------------------------------------------------------------ */
/* 编译错误判定：结构化优先，正则兜底                                  */
/* ------------------------------------------------------------------ */

const ERROR_KEYS = new Set(['errorcount', 'error_count', 'totalerrorcount', 'total_error_count']);
const STATE_KEYS = new Set(['state', 'overallstate', 'status', 'result']);
const OK_KEYS = new Set(['ok', 'success', 'succeeded']);

/** 先整体 parse；失败再尝试截取最外层大括号段落 */
function parseLoose(text) {
  if (typeof text !== 'string') return null;
  try {
    return JSON.parse(text);
  } catch {}
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try {
      return JSON.parse(text.slice(a, b + 1));
    } catch {}
  }
  return null;
}

function compileHasErrors(text) {
  if (!text) return false;
  const obj = parseLoose(text);

  if (obj && typeof obj === 'object') {
    const hits = [];
    const walk = (o, depth) => {
      if (!o || typeof o !== 'object' || depth > 8) return;
      for (const [k, v] of Object.entries(o)) {
        const key = k.toLowerCase();
        // ok/success 只在顶层与一层信封（meta 之类）上认，避免子项诊断属性误判
        if (depth <= 1 && OK_KEYS.has(key) && v === false) hits.push(`${k}=false`);
        if (STATE_KEYS.has(key) && typeof v === 'string' && /^(error|failed|failure)$/i.test(v.trim())) {
          hits.push(`${k}=${v}`);
        }
        if (ERROR_KEYS.has(key) && typeof v === 'number' && v > 0) hits.push(`${k}=${v}`);
        if (key === 'errors' && Array.isArray(v) && v.length > 0) hits.push(`errors=${v.length}`);
        walk(v, depth + 1);
      }
    };
    walk(obj, 0);
    if (hits.length) return true;
    // 结构化解析成功且没命中，就不再用正则猜（避免误报）
    return false;
  }

  // 兜底：JSON 解析失败时按文本匹配，键名后面可能跟引号
  return (
    /\b(error_count|errorCount|totalErrorCount|total_error_count)["']?\s*[:=]\s*["']?[1-9]/.test(text) ||
    /\b(state|overallState|status)["']?\s*[:=]\s*["']?(error|failed|failure)\b/i.test(text)
  );
}

/* ------------------------------------------------------------------ */
/* 块文件收集 / 目标规范化 / 计划容错                                  */
/* ------------------------------------------------------------------ */

function collectBlockFiles(dir) {
  const files = [];
  try {
    for (const ent of fs.readdirSync(dir, { recursive: true, withFileTypes: true })) {
      if (!ent.isFile()) continue;
      // .s7res 必须一起带回：它和 .s7dcl 是配对的，缺了改不回去
      if (!/\.(xml|scl|s7dcl|s7res)$/i.test(ent.name)) continue;
      const full = path.join(ent.parentPath ?? ent.path ?? dir, ent.name);
      const txt = fs.readFileSync(full, 'utf8');
      files.push({ name: ent.name, path: full, bytes: Buffer.byteLength(txt, 'utf8'), content: txt.slice(0, 120000) });
    }
  } catch (e) {
    log(`读导出目录失败：${e.message}`);
  }
  return files;
}

function normalizeBlockTarget(blockArg, groupArg) {
  let block = stripRoot(blockArg);
  let group = stripRoot(groupArg);
  if (!group && /[\\/]/.test(block)) {
    const parts = block.split(/[\\/]+/).filter(Boolean);
    block = parts.pop() || '';
    group = parts.join('/');
  }
  return { block, group };
}

const NOT_FOUND_RE = /\bnot found\b|does not exist|未找到|不存在/i;
const NOT_NOT_FOUND_RE = /Plc\s*Software not found|Software container not found|No project is open|online mode|Ambiguous/i;

/**
 * 判断某一步的失败是否可以忽略。
 *  - optional:true      → 什么都吞（幂等清理类，如 DeletePlcExternalSource）
 *  - allowNotFound:true → 只有"目标不存在"才吞；在线模式、软件路径错、歧义等一律中断
 *    这样可以避免 DeletePlcBlock 因为权限/在线/路径歧义失败被静默吞掉，
 *    进而让 GenerateBlocksFromExternalSource 保留旧代码。
 */
function isTolerableFailure(step, text) {
  if (step.optional) return true;
  if (step.allowNotFound) {
    return NOT_FOUND_RE.test(text) && !NOT_NOT_FOUND_RE.test(text);
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* 版本解析与路由                                                      */
/* ------------------------------------------------------------------ */

function versionFromPath(p) {
  if (!p) return null;
  const m = String(p).match(/\.(?:ap|als)(\d{2})\b/i);
  return m ? parseInt(m[1], 10) : null;
}

function normalizeVersion(input) {
  if (!input || input === 'auto') return null;
  const m = String(input).match(/(\d{2})/);
  return m ? parseInt(m[1], 10) : null;
}

function pickServerForVersion(major, upstreams) {
  if (!major) return 'b';
  if (major <= 19) return 'a';
  if (upstreams && typeof upstreams.has === 'function') {
    if (major >= 21 && upstreams.has('c') && upstreams.get('c').cfg.installed) return 'c';
    if (upstreams.has('b')) return 'b';
    return 'a';
  }
  const cfgUpstreams = config.upstreams || {};
  const cCfg = cfgUpstreams.c;
  const bCfg = cfgUpstreams.b;
  if (major >= 21 && cCfg && cCfg.enabled !== false && cCfg.installed) return 'c';
  if (bCfg && bCfg.enabled !== false) return 'b';
  return 'a';
}

function resolveConnectVersion(versionArg, projectPath) {
  const explicit = normalizeVersion(versionArg);
  const fromPath = versionFromPath(projectPath);
  if (versionArg && versionArg !== 'auto' && !explicit) {
    throw new Error(`无法识别的 TIA 版本：${versionArg}（示例：16、20、21、V20 或 auto）`);
  }
  if (explicit && fromPath && explicit !== fromPath) {
    throw new Error(
      `版本冲突：显式指定了 V${explicit}，但工程路径后缀为 V${fromPath}（${projectPath}）。请保持一致。`
    );
  }
  const major = explicit || fromPath || null;
  let autoNote = null;
  if (explicit && fromPath) autoNote = `已校验 version=V${explicit} 与工程后缀一致`;
  else if (!explicit && fromPath) autoNote = `从工程后缀推断版本 V${fromPath}`;
  return { major, explicit, fromPath, autoNote };
}

module.exports = {
  PROTOCOL,
  VERSION,
  GATEWAY_DIR,
  CONFIG_PATH,
  config,
  IS_WINDOWS,
  log,
  resolvePath,
  ensureDir,
  hasNonAscii,
  writeBlockFile,
  slug,
  stripRoot,
  stamp,
  textOf,
  ok,
  fail,
  isToolFailure,
  extractProjectName,
  parseLoose,
  compileHasErrors,
  collectBlockFiles,
  normalizeBlockTarget,
  versionFromPath,
  normalizeVersion,
  pickServerForVersion,
  resolveConnectVersion,
  isTolerableFailure,
};
