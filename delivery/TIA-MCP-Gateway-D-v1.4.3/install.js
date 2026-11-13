#!/usr/bin/env node
'use strict';
/*
 * 一键安装与多宿主配置同步：
 *   1. 复制 skills/ 到通用目录及已检测宿主的 skills 目录
 *   2. 幂等合并 MCP 配置到本机已安装的 10 类主流 AI 客户端（改前自动备份）
 *   3. 在 生成的配置/ 下输出全宿主参考模板与目标路径说明
 *
 * 设计原则：
 *   - 仅“路径感知合并”，绝不破坏用户已有其他 MCP server 或原有 env
 *   - 防父目录假阳性误报（如 Claude Code ~/.claude.json、Gemini CLI ~/.gemini/settings.json）
 *   - 路径未变化跳过且不产生多余 .bak-*；改前备份并用 临时文件+rename 原子写
 *   - 支持 --list / --dry-run / --configs-only / --host <id[,id]> / --update / --out <dir> / --help
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = __dirname;
const NODE = path.join(ROOT, 'gateway', 'runtime', 'node.exe');
const GW = path.join(ROOT, 'gateway', 'gateway.js');
const DEFAULT_OUT = process.env.TIA_INSTALL_OUT_DIR
  ? path.resolve(process.env.TIA_INSTALL_OUT_DIR)
  : path.join(ROOT, '生成的配置');

const SERVER_KEY = 'tia-gateway';
const OPENCODE_KEY = 'tia';
const DSH_ID = 'mcp-tia-gateway';

const log = (s) => console.log(s);
const ok = (s) => console.log('  [完成] ' + s);
const skip = (s) => console.log('  [跳过] ' + s);
const warn = (s) => console.log('  [注意] ' + s);
const dry = (s) => console.log('  [预演] ' + s);

function getEnvPaths() {
  const home = process.env.USERPROFILE || os.homedir();
  const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  const xdgConfig = process.env.XDG_CONFIG_HOME || '';
  return { home, appData, xdgConfig };
}

function exists(p) {
  try {
    return Boolean(p) && fs.existsSync(p);
  } catch {
    return false;
  }
}

function stripBom(s) {
  return typeof s === 'string' ? s.replace(/^\uFEFF/, '') : '';
}

function normPath(p) {
  if (typeof p !== 'string') return '';
  const trimmed = p.trim();
  if (!trimmed) return '';
  const uncPrefix = trimmed.startsWith('\\\\') ? '\\\\' : '';
  const cleaned = uncPrefix + (uncPrefix ? trimmed.slice(2) : trimmed).replace(/\\+/g, '\\');
  const n = path.normalize(cleaned);
  return process.platform === 'win32' ? n.toLowerCase() : n;
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function sleepMsSync(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    // 忽略不支持 Atomics.wait 的受限环境
  }
}

function atomicWriteFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const rand = Math.random().toString(16).slice(2, 10);
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}.${rand}`;
  try {
    fs.writeFileSync(tmp, content, 'utf8');
    let lastErr = null;
    for (let i = 0; i < 4; i++) {
      try {
        fs.renameSync(tmp, filePath);
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        if (i < 3 && (e.code === 'EPERM' || e.code === 'EBUSY' || e.code === 'EACCES')) {
          sleepMsSync(15);
          continue;
        }
        throw e;
      }
    }
    if (lastErr) throw lastErr;
  } finally {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      // 清理临时文件失败不影响主结果
    }
  }
}

function backup(file) {
  const base = `${file}.bak-${stamp()}`;
  let target = base;
  let seq = 1;
  while (exists(target)) {
    target = `${base}-${seq++}`;
  }
  fs.copyFileSync(file, target);
  return target;
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

/* ------------------------------------------------------------------ */
/* JSON / TOML / YAML 条目构造与解析                                   */
/* ------------------------------------------------------------------ */

function isPlainObject(v) {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function parseJsonObjectFile(file) {
  let raw;
  try {
    raw = stripBom(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return { ok: false, err: e.message };
  }
  if (!raw.trim()) return { ok: true, data: {} };
  try {
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed)) {
      return { ok: false, err: '根配置不是 JSON 对象' };
    }
    return { ok: true, data: parsed };
  } catch (e) {
    return { ok: false, err: e.message };
  }
}

function stdMcpEntry(existing) {
  const env = existing && isPlainObject(existing.env) ? { ...existing.env } : {};
  const base = isPlainObject(existing) ? { ...existing } : {};
  base.command = NODE;
  base.args = [GW];
  base.env = env;
  return base;
}

function vscodeMcpEntry(existing) {
  const env = existing && isPlainObject(existing.env) ? { ...existing.env } : {};
  const base = isPlainObject(existing) ? { ...existing } : {};
  base.type = 'stdio';
  base.command = NODE;
  base.args = [GW];
  base.env = env;
  return base;
}

function opencodeEntry(existing) {
  const base = isPlainObject(existing) ? { ...existing } : {};
  const timeout = isPlainObject(base.timeout)
    ? base.timeout
    : { startup: 180000, catalog: 180000, execution: 1800000 };
  base.type = 'local';
  base.command = [NODE, GW];
  base.timeout = timeout;
  return base;
}

function applyJsonHost(host, opts) {
  const file = host.configPath();
  const fileExists = exists(file);
  const installed = host.detect();
  const forced = opts.hostSet !== null;

  if (!fileExists && !installed && !forced) {
    return { status: 'notfound', file };
  }

  let cfg = {};
  if (fileExists) {
    const parsed = parseJsonObjectFile(file);
    if (!parsed.ok) return { status: 'unparsable', file, err: parsed.err };
    cfg = parsed.data;
  }

  let existed = false;
  let samePath = false;
  let prevCommand = null;

  if (host.style === 'opencode') {
    cfg.mcp = isPlainObject(cfg.mcp) ? cfg.mcp : {};
    cfg.mcp.servers = isPlainObject(cfg.mcp.servers) ? cfg.mcp.servers : {};
    const cur = cfg.mcp.servers[OPENCODE_KEY];
    if (isPlainObject(cur)) {
      existed = true;
      prevCommand = Array.isArray(cur.command) ? cur.command.join(' ') : String(cur.command || '');
      samePath =
        cur.type === 'local' &&
        Array.isArray(cur.command) &&
        cur.command.length === 2 &&
        normPath(cur.command[0]) === normPath(NODE) &&
        normPath(cur.command[1]) === normPath(GW);
    }
    if (existed && samePath && !opts.update) {
      return { status: 'unchanged', file };
    }
    cfg.mcp.servers[OPENCODE_KEY] = opencodeEntry(cur);
  } else {
    const rootKey = host.style === 'vscode' ? 'servers' : 'mcpServers';
    cfg[rootKey] = isPlainObject(cfg[rootKey]) ? cfg[rootKey] : {};
    const cur = cfg[rootKey][SERVER_KEY];
    if (isPlainObject(cur)) {
      existed = true;
      prevCommand = cur.command || '';
      const typeOk = host.style === 'vscode' ? cur.type === 'stdio' : true;
      samePath =
        typeOk &&
        normPath(cur.command) === normPath(NODE) &&
        Array.isArray(cur.args) &&
        cur.args.length === 1 &&
        normPath(cur.args[0]) === normPath(GW);
    }
    if (existed && samePath && !opts.update) {
      return { status: 'unchanged', file };
    }
    cfg[rootKey][SERVER_KEY] = host.style === 'vscode' ? vscodeMcpEntry(cur) : stdMcpEntry(cur);
  }

  const nextText = JSON.stringify(cfg, null, 2) + '\n';
  if (opts.dryRun) {
    return { status: existed ? 'updated' : 'written', file, dryRun: true, prevCommand };
  }

  const bak = fileExists ? backup(file) : null;
  atomicWriteFile(file, nextText);
  return { status: existed ? 'updated' : 'written', file, backup: bak, prevCommand };
}

/* ---------------- Codex TOML ---------------- */

function tomlString(s) {
  if (!s.includes("'") && !s.includes('\n') && !s.includes('\r')) return "'" + s + "'";
  return (
    '"' +
    s
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\r/g, '')
      .replace(/\n/g, '\\n') +
    '"'
  );
}

function parseTomlStringAt(src, startIdx) {
  let i = startIdx;
  while (i < src.length && /\s/.test(src[i])) i++;
  if (i >= src.length) return null;
  const quote = src[i];
  if (quote === "'") {
    const end = src.indexOf("'", i + 1);
    if (end < 0) return null;
    return { value: src.slice(i + 1, end), next: end + 1 };
  }
  if (quote === '"') {
    let out = '';
    i++;
    while (i < src.length) {
      const ch = src[i];
      if (ch === '\\') {
        i++;
        if (i >= src.length) return null;
        const esc = src[i];
        if (esc === '\\' || esc === '"') out += esc;
        else if (esc === 'n') out += '\n';
        else if (esc === 'r') out += '\r';
        else if (esc === 't') out += '\t';
        else if (esc === 'b') out += '\b';
        else if (esc === 'f') out += '\f';
        else out += esc;
        i++;
      } else if (ch === '"') {
        return { value: out, next: i + 1 };
      } else {
        out += ch;
        i++;
      }
    }
    return null;
  }
  return null;
}

function parseTomlStringArray(raw) {
  let i = 0;
  while (i < raw.length && /\s/.test(raw[i])) i++;
  if (raw[i] !== '[') return null;
  i++;
  const items = [];
  while (i < raw.length) {
    while (i < raw.length) {
      const ch = raw[i];
      if (/\s|,/.test(ch)) {
        i++;
      } else if (ch === '#') {
        const nl = raw.indexOf('\n', i);
        if (nl < 0) return null;
        i = nl + 1;
      } else {
        break;
      }
    }
    if (i >= raw.length) return null;
    if (raw[i] === ']') return items;
    const parsed = parseTomlStringAt(raw, i);
    if (!parsed) return null;
    items.push(parsed.value);
    i = parsed.next;
  }
  return null;
}

function isCodexMainHeader(sec) {
  return sec === `[mcp_servers.${SERVER_KEY}]` || sec === `[mcp_servers."${SERVER_KEY}"]`;
}

function isCodexSubHeader(sec) {
  return (
    sec.startsWith(`[mcp_servers.${SERVER_KEY}.`) ||
    sec.startsWith(`[mcp_servers."${SERVER_KEY}".`)
  );
}

function parseCodexTomlSections(text) {
  const lines = stripBom(text).replace(/\r\n/g, '\n').split('\n');
  const keptLines = [];
  const mainLines = [];
  const subLines = [];
  let mode = 'kept'; // 'kept' | 'main' | 'sub'
  let existed = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[')) {
      const sec = trimmed.replace(/\s+#.*$/, '').trim();
      if (isCodexMainHeader(sec)) {
        mode = 'main';
        existed = true;
        continue;
      }
      if (isCodexSubHeader(sec)) {
        mode = 'sub';
        existed = true;
        subLines.push(line);
        continue;
      }
      mode = 'kept';
    }
    if (mode === 'main') mainLines.push(line);
    else if (mode === 'sub') subLines.push(line);
    else keptLines.push(line);
  }

  return { existed, keptLines, mainLines, subLines };
}

function inspectCodexMainLines(mainLines) {
  let command = null;
  let args = null;
  let startupTimeoutSec = null;
  const extraLines = [];

  for (let i = 0; i < mainLines.length; i++) {
    const line = mainLines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    let m = trimmed.match(/^command\s*=\s*(.+)$/);
    if (m) {
      const p = parseTomlStringAt(m[1], 0);
      if (p) command = p.value;
      continue;
    }

    m = trimmed.match(/^args\s*=\s*(.+)$/);
    if (m) {
      let buf = m[1];
      let parsed = parseTomlStringArray(buf);
      while (!parsed && i + 1 < mainLines.length && !mainLines[i + 1].trim().startsWith('[')) {
        i++;
        buf += '\n' + mainLines[i];
        parsed = parseTomlStringArray(buf);
      }
      if (parsed) args = parsed;
      continue;
    }

    m = trimmed.match(/^startup_timeout_sec\s*=\s*(\d+)/);
    if (m) {
      startupTimeoutSec = Number(m[1]);
      continue;
    }

    extraLines.push(line);
  }

  return { command, args, startupTimeoutSec, extraLines };
}

function codexSectionText(extraMainLines, subLines) {
  const out = [
    `[mcp_servers.${SERVER_KEY}]`,
    `command = ${tomlString(NODE)}`,
    `args = [${tomlString(GW)}]`,
    'startup_timeout_sec = 120',
  ];
  if (extraMainLines && extraMainLines.length) {
    out.push(...extraMainLines);
  }
  if (subLines && subLines.length) {
    while (subLines.length && !subLines[subLines.length - 1].trim()) subLines.pop();
    if (subLines.length) {
      out.push('');
      out.push(...subLines);
    }
  }
  return out.join('\n') + '\n';
}

function applyCodexHost(host, opts) {
  const file = host.configPath();
  const fileExists = exists(file);
  const installed = host.detect();
  const forced = opts.hostSet !== null;

  if (!fileExists && !installed && !forced) {
    return { status: 'notfound', file };
  }

  let existed = false;
  let keptText = '';
  let extraMainLines = [];
  let subLines = [];
  let prevCommand = null;

  if (fileExists) {
    let raw;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch (e) {
      return { status: 'unparsable', file, err: e.message };
    }
    const parsed = parseCodexTomlSections(raw);
    existed = parsed.existed;
    subLines = parsed.subLines;

    if (existed) {
      const info = inspectCodexMainLines(parsed.mainLines);
      prevCommand = info.command || '';
      extraMainLines = info.extraLines;
      const samePath =
        normPath(info.command) === normPath(NODE) &&
        Array.isArray(info.args) &&
        info.args.length === 1 &&
        normPath(info.args[0]) === normPath(GW);
      if (samePath && !opts.update) {
        return { status: 'unchanged', file };
      }
    }

    while (parsed.keptLines.length && !parsed.keptLines[parsed.keptLines.length - 1].trim()) {
      parsed.keptLines.pop();
    }
    keptText = parsed.keptLines.join('\n');
  }

  const nextSection = codexSectionText(extraMainLines, subLines);
  const nextText = keptText ? `${keptText}\n\n${nextSection}` : nextSection;

  if (opts.dryRun) {
    return { status: existed ? 'updated' : 'written', file, dryRun: true, prevCommand };
  }

  const bak = fileExists ? backup(file) : null;
  atomicWriteFile(file, nextText);
  return { status: existed ? 'updated' : 'written', file, backup: bak, prevCommand };
}

/* ---------------- DeepSeek Harness YAML ---------------- */

function yamlSingleQuote(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function parseYamlScalar(raw) {
  if (typeof raw !== 'string') return '';
  let s = raw.trim();
  if (!s) return '';
  if (s[0] === "'") {
    let out = '';
    for (let i = 1; i < s.length; i++) {
      if (s[i] === "'" && s[i + 1] === "'") {
        out += "'";
        i++;
      } else if (s[i] === "'") {
        return out;
      } else {
        out += s[i];
      }
    }
    return out;
  }
  if (s[0] === '"') {
    let out = '';
    for (let i = 1; i < s.length; i++) {
      if (s[i] === '\\' && i + 1 < s.length) {
        const n = s[i + 1];
        if (n === '\\' || n === '"') out += n;
        else if (n === 'n') out += '\n';
        else if (n === 'r') out += '\r';
        else if (n === 't') out += '\t';
        else out += n;
        i++;
      } else if (s[i] === '"') {
        return out;
      } else {
        out += s[i];
      }
    }
    return out;
  }
  return s.replace(/\s+#.*$/, '').trim();
}

function parseYamlInlineArray(raw) {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  const inner = raw.slice(start + 1, end);
  const items = [];
  let i = 0;
  while (i < inner.length) {
    while (i < inner.length && /[\s,]/.test(inner[i])) i++;
    if (i >= inner.length) break;
    const ch = inner[i];
    if (ch === "'" || ch === '"') {
      const q = ch;
      let j = i + 1;
      while (j < inner.length) {
        if (q === "'" && inner[j] === "'" && inner[j + 1] === "'") {
          j += 2;
        } else if (q === '"' && inner[j] === '\\') {
          j += 2;
        } else if (inner[j] === q) {
          j++;
          break;
        } else {
          j++;
        }
      }
      items.push(parseYamlScalar(inner.slice(i, j)));
      i = j;
    } else {
      let j = i;
      while (j < inner.length && inner[j] !== ',') j++;
      const val = parseYamlScalar(inner.slice(i, j));
      if (val) items.push(val);
      i = j;
    }
  }
  return items;
}

function dshBlock() {
  return [
    '# TIA 统一网关 D（内部路由到 A/B 两套博途 MCP）',
    '- insert:',
    `    - id: ${DSH_ID}`,
    "      name: '@deepseek-ai/dsh-mcp-client'",
    '      config:',
    '        serverName: tia',
    '        transport: stdio',
    `        command: ${yamlSingleQuote(NODE)}`,
    `        args: [${yamlSingleQuote(GW)}]`,
    '        toolCallTimeoutMs: 1800000',
    '        failOnStartupError: false',
    '',
  ].join('\n');
}

function inspectAndUpdateDshYaml(raw) {
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = stripBom(raw).replace(/\r\n/g, '\n').split('\n');

  let startIdx = -1;
  let itemIndent = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)-\s+id:\s*(['"]?)mcp-tia-gateway\2\s*(?:#.*)?$/);
    if (m) {
      startIdx = i;
      itemIndent = m[1].length;
      break;
    }
  }

  if (startIdx < 0) {
    return { existed: false };
  }

  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const indent = line.match(/^(\s*)/)[1].length;
    if (indent < itemIndent || (indent === itemIndent && trimmed.startsWith('- '))) {
      endIdx = i;
      break;
    }
  }

  let cmdLineIdx = -1;
  let cmdIndent = '';
  let curCommand = null;

  let argsStartIdx = -1;
  let argsEndIdx = -1;
  let argsIndent = '';
  let curArgs = null;

  for (let i = startIdx + 1; i < endIdx; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    let m = line.match(/^(\s*)command\s*:\s*(.*)$/);
    if (m && cmdLineIdx < 0) {
      cmdLineIdx = i;
      cmdIndent = m[1];
      curCommand = parseYamlScalar(m[2]);
      continue;
    }

    m = line.match(/^(\s*)args\s*:\s*(.*)$/);
    if (m && argsStartIdx < 0) {
      argsStartIdx = i;
      argsEndIdx = i;
      argsIndent = m[1];
      const rest = m[2].replace(/\s+#.*$/, '').trim();
      if (rest.startsWith('[')) {
        curArgs = parseYamlInlineArray(rest);
      } else if (!rest) {
        const collected = [];
        const baseLen = argsIndent.length;
        for (let j = i + 1; j < endIdx; j++) {
          const sub = lines[j];
          const subTrim = sub.trim();
          if (!subTrim || subTrim.startsWith('#')) continue;
          const subIndent = sub.match(/^(\s*)/)[1].length;
          if (subIndent <= baseLen) break;
          const itemMatch = sub.match(/^\s*-\s*(.+)$/);
          if (!itemMatch) break;
          collected.push(parseYamlScalar(itemMatch[1]));
          argsEndIdx = j;
        }
        curArgs = collected;
      }
    }
  }

  if (cmdLineIdx < 0 || argsStartIdx < 0 || !Array.isArray(curArgs)) {
    return { existed: true, unparsable: true, err: '已有 mcp-tia-gateway 条目缺少可识别的 command/args' };
  }

  const samePath =
    normPath(curCommand) === normPath(NODE) &&
    curArgs.length === 1 &&
    normPath(curArgs[0]) === normPath(GW);

  const nextLines = [...lines];
  nextLines[cmdLineIdx] = `${cmdIndent}command: ${yamlSingleQuote(NODE)}`;
  const nextArgsLine = `${argsIndent}args: [${yamlSingleQuote(GW)}]`;
  nextLines.splice(argsStartIdx, argsEndIdx - argsStartIdx + 1, nextArgsLine);

  return {
    existed: true,
    samePath,
    prevCommand: curCommand,
    nextText: nextLines.join(eol),
  };
}

function applyDshHost(host, opts) {
  const file = host.configPath();
  const fileExists = exists(file);
  const installed = host.detect();
  const forced = opts.hostSet !== null;

  if (!fileExists && !installed && !forced) {
    return { status: 'notfound', file };
  }

  let existed = false;
  let prevCommand = null;
  let nextText;

  if (fileExists) {
    let raw;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch (e) {
      return { status: 'unparsable', file, err: e.message };
    }
    const inspected = inspectAndUpdateDshYaml(raw);
    if (inspected.unparsable) {
      return { status: 'unparsable', file, err: inspected.err };
    }
    if (inspected.existed) {
      existed = true;
      prevCommand = inspected.prevCommand;
      if (inspected.samePath && !opts.update) {
        return { status: 'unchanged', file };
      }
      nextText = inspected.nextText;
    } else {
      const cleaned = stripBom(raw).replace(/\s*$/, '');
      nextText = cleaned ? `${cleaned}\n\n${dshBlock()}` : dshBlock();
    }
  } else {
    nextText = dshBlock();
  }

  if (opts.dryRun) {
    return { status: existed ? 'updated' : 'written', file, dryRun: true, prevCommand };
  }

  const bak = fileExists ? backup(file) : null;
  atomicWriteFile(file, nextText);
  return { status: existed ? 'updated' : 'written', file, backup: bak, prevCommand };
}

/* ------------------------------------------------------------------ */
/* 10 类主流宿主定义与精准防误报探测                                    */
/* ------------------------------------------------------------------ */

function buildHosts(env) {
  const { home, appData, xdgConfig } = env;

  return [
    {
      id: 'antigravity',
      name: 'Antigravity',
      style: 'mcpServers',
      templateFile: 'antigravity-mcp_config.json',
      targetHint: '%USERPROFILE%\\.gemini\\config\\mcp_config.json',
      configPath() {
        const primary = path.join(home, '.gemini', 'config', 'mcp_config.json');
        const configDir = path.join(home, '.gemini', 'config');
        const legacy = path.join(home, '.gemini', 'antigravity', 'mcp_config.json');
        if (exists(primary) || exists(configDir)) return primary;
        if (exists(legacy)) return legacy;
        return primary;
      },
      detect() {
        return (
          exists(path.join(home, '.gemini', 'config', 'mcp_config.json')) ||
          exists(path.join(home, '.gemini', 'config')) ||
          exists(path.join(home, '.gemini', 'antigravity', 'mcp_config.json')) ||
          exists(path.join(home, '.gemini', 'antigravity'))
        );
      },
      skillDir() {
        const configDir = path.join(home, '.gemini', 'config');
        const legacy = path.join(home, '.gemini', 'antigravity', 'mcp_config.json');
        if (!exists(configDir) && exists(legacy)) {
          return path.join(home, '.gemini', 'antigravity', 'skills');
        }
        return path.join(home, '.gemini', 'config', 'skills');
      },
    },
    {
      id: 'gemini-cli',
      name: 'Gemini CLI',
      style: 'mcpServers',
      templateFile: 'gemini-cli-settings.json',
      targetHint: '%USERPROFILE%\\.gemini\\settings.json',
      configPath() {
        return path.join(home, '.gemini', 'settings.json');
      },
      detect() {
        // 严禁判断父目录 ~/.gemini，避免纯 Antigravity 机器误建 Gemini CLI settings.json
        return exists(path.join(home, '.gemini', 'settings.json'));
      },
    },
    {
      id: 'claude-desktop',
      name: 'Claude Desktop',
      style: 'mcpServers',
      templateFile: 'claude-desktop.json',
      targetHint: '%APPDATA%\\Claude\\claude_desktop_config.json',
      configPath() {
        return path.join(appData, 'Claude', 'claude_desktop_config.json');
      },
      detect() {
        return (
          exists(path.join(appData, 'Claude', 'claude_desktop_config.json')) ||
          exists(path.join(appData, 'Claude'))
        );
      },
    },
    {
      id: 'claude-code',
      name: 'Claude Code',
      style: 'mcpServers',
      templateFile: 'claude-code.json',
      targetHint: '%USERPROFILE%\\.claude.json',
      configPath() {
        return path.join(home, '.claude.json');
      },
      detect() {
        // 严禁判断父目录 %USERPROFILE%，仅查 ~/.claude.json 或 ~/.claude
        return exists(path.join(home, '.claude.json')) || exists(path.join(home, '.claude'));
      },
      skillDir() {
        return path.join(home, '.claude', 'skills');
      },
    },
    {
      id: 'cursor',
      name: 'Cursor',
      style: 'mcpServers',
      templateFile: 'cursor-mcp.json',
      targetHint: '%USERPROFILE%\\.cursor\\mcp.json',
      configPath() {
        return path.join(home, '.cursor', 'mcp.json');
      },
      detect() {
        return exists(path.join(home, '.cursor', 'mcp.json')) || exists(path.join(home, '.cursor'));
      },
    },
    {
      id: 'vscode',
      name: 'VS Code',
      style: 'vscode',
      templateFile: 'vscode-mcp.json',
      targetHint: '%APPDATA%\\Code\\User\\mcp.json',
      configPath() {
        return path.join(appData, 'Code', 'User', 'mcp.json');
      },
      detect() {
        return (
          exists(path.join(appData, 'Code', 'User', 'mcp.json')) ||
          exists(path.join(appData, 'Code', 'User'))
        );
      },
    },
    {
      id: 'codex',
      name: 'Codex',
      style: 'codex-toml',
      templateFile: 'codex-config.toml',
      targetHint: '%USERPROFILE%\\.codex\\config.toml',
      configPath() {
        return path.join(home, '.codex', 'config.toml');
      },
      detect() {
        return exists(path.join(home, '.codex', 'config.toml')) || exists(path.join(home, '.codex'));
      },
    },
    {
      id: 'workbuddy',
      name: 'WorkBuddy',
      style: 'mcpServers',
      templateFile: 'workbuddy-mcp.json',
      targetHint: '%USERPROFILE%\\.workbuddy-ai\\mcp.json',
      configPath() {
        return path.join(home, '.workbuddy-ai', 'mcp.json');
      },
      detect() {
        return (
          exists(path.join(home, '.workbuddy-ai', 'mcp.json')) ||
          exists(path.join(home, '.workbuddy-ai'))
        );
      },
      skillDir() {
        return path.join(home, '.workbuddy-ai', 'skills');
      },
    },
    {
      id: 'opencode',
      name: 'opencode',
      style: 'opencode',
      templateFile: 'opencode.json',
      targetHint: '%USERPROFILE%\\.config\\opencode\\opencode.json（或 %XDG_CONFIG_HOME%\\opencode\\opencode.json）',
      candidates() {
        const list = [];
        if (xdgConfig) list.push(path.join(xdgConfig, 'opencode', 'opencode.json'));
        list.push(path.join(home, '.config', 'opencode', 'opencode.json'));
        list.push(path.join(home, '.opencode', 'opencode.json'));
        return list;
      },
      configPath() {
        const list = this.candidates();
        return list.find((p) => exists(p)) || list.find((p) => exists(path.dirname(p))) || list[0];
      },
      detect() {
        return this.candidates().some((p) => exists(p) || exists(path.dirname(p)));
      },
    },
    {
      id: 'dsh',
      name: 'DeepSeek Harness',
      style: 'dsh-yaml',
      templateFile: 'dsh-cordis.patch.yml',
      targetHint: '%USERPROFILE%\\.dsh\\profiles\\desktop\\cordis.patch.yml',
      configPath() {
        return path.join(home, '.dsh', 'profiles', 'desktop', 'cordis.patch.yml');
      },
      detect() {
        return exists(this.configPath());
      },
    },
  ];
}

function applyHost(host, opts) {
  if (host.style === 'codex-toml') return applyCodexHost(host, opts);
  if (host.style === 'dsh-yaml') return applyDshHost(host, opts);
  return applyJsonHost(host, opts);
}

function inspectHost(host) {
  const detected = host.detect();
  const file = host.configPath();
  const fileExists = exists(file);
  const res = applyHost(host, { dryRun: true, update: false, hostSet: null });
  return {
    id: host.id,
    name: host.name,
    detected,
    file,
    fileExists,
    status: res.status,
    err: res.err || null,
  };
}

/* ------------------------------------------------------------------ */
/* 生成的配置/ 全宿主模板                                              */
/* ------------------------------------------------------------------ */

function buildTemplateContent(host) {
  if (host.style === 'codex-toml') {
    return codexSectionText([], []);
  }
  if (host.style === 'dsh-yaml') {
    return dshBlock();
  }
  if (host.style === 'opencode') {
    return JSON.stringify({ mcp: { servers: { [OPENCODE_KEY]: opencodeEntry(null) } } }, null, 2) + '\n';
  }
  if (host.style === 'vscode') {
    return JSON.stringify({ servers: { [SERVER_KEY]: vscodeMcpEntry(null) } }, null, 2) + '\n';
  }
  return JSON.stringify({ mcpServers: { [SERVER_KEY]: stdMcpEntry(null) } }, null, 2) + '\n';
}

function buildTemplateReadme(hosts) {
  const lines = [
    '====================================================================',
    'TIA MCP 网关 D - 生成的配置模板说明',
    '====================================================================',
    '',
    '所有模板中的 node.exe 与 gateway.js 路径均已按当前解压目录自动填好。',
    '建议优先运行：安装.bat（仅自动配置本机已安装的客户端，改前自动备份）。',
    '如需强制为尚未建文件的某个客户端生成配置，可执行：',
    '  gateway\\runtime\\node.exe install.js --host <宿主id>',
    '',
    '各模板文件与目标路径对照：',
  ];
  for (const h of hosts) {
    lines.push(`- ${h.templateFile.padEnd(28)} -> ${h.name} (${h.id}): ${h.targetHint}`);
  }
  lines.push(
    '',
    '注意事项：',
    '1. 合并时请保留目标文件内原有的其他 MCP 服务器，仅合入 tia-gateway（opencode 为 tia）。',
    '2. WorkBuddy 首次启用需在界面「专家技能连接器 -> 自定义连接器 -> tia-gateway」点「信任」。',
    '3. Antigravity 请确认写入 .gemini\\config\\mcp_config.json（不要误放入 Gemini CLI 的 settings.json）。',
    '4. Codex 使用单引号 TOML 字面量与 startup_timeout_sec = 120，避免启动博途超时被判定崩溃。',
    '5. 首次连接 TIA Portal 会弹出 Siemens Openness 授权窗口，必须人工点击「是，全部接受」。',
    ''
  );
  return lines.join('\r\n');
}

function writeTemplates(outDir, hosts) {
  fs.mkdirSync(outDir, { recursive: true });
  for (const h of hosts) {
    atomicWriteFile(path.join(outDir, h.templateFile), buildTemplateContent(h));
  }
  atomicWriteFile(path.join(outDir, '使用说明.txt'), buildTemplateReadme(hosts));
}

/* ------------------------------------------------------------------ */
/* CLI 参数解析与主流程                                                */
/* ------------------------------------------------------------------ */

function printUsage(hosts) {
  const ids = hosts.map((h) => h.id).join(', ');
  log(`用法: node install.js [选项]

选项:
  --list                列出全部 10 类宿主探测与当前配置状态（只读，不修改任何文件）
  --dry-run             预演全部步骤与变更，不写入配置、备份、skills 或 生成的配置/
  --configs-only        仅生成全部 10 份配置模板与 使用说明.txt 到 --out 目录，不写入用户 skills 或宿主配置
  --host <id[,id]>      仅处理指定宿主（可逗号分隔或重复传参）；即使未提前建配置文件也会创建
                        支持 id: ${ids}
  --update, --force     即使现有命令路径与当前目录一致，也备份并强制重写更新（仍保留原有 env）
  --out <dir>           指定模板输出目录（默认: 包根目录\\生成的配置）
  -h, --help            显示本帮助信息`);
}

function parseArgs(argv, hosts) {
  const validIds = new Set(hosts.map((h) => h.id));
  const opts = {
    list: false,
    dryRun: false,
    configsOnly: false,
    update: false,
    help: false,
    hostSet: null,
    outDir: DEFAULT_OUT,
  };

  const addHosts = (raw) => {
    if (!opts.hostSet) opts.hostSet = new Set();
    for (const part of String(raw).split(',')) {
      const id = part.trim().toLowerCase();
      if (!id) continue;
      if (!validIds.has(id)) {
        throw new Error(`未知宿主 id: "${id}"。可选值: ${[...validIds].join(', ')}`);
      }
      opts.hostSet.add(id);
    }
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--list') opts.list = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--configs-only' || a === '--templates-only') opts.configsOnly = true;
    else if (a === '--update' || a === '--force') opts.update = true;
    else if (a === '-h' || a === '--help') opts.help = true;
    else if (a === '--host') {
      if (i + 1 >= argv.length) throw new Error('--host 缺少参数');
      addHosts(argv[++i]);
    } else if (a.startsWith('--host=')) {
      addHosts(a.slice('--host='.length));
    } else if (a === '--out') {
      if (i + 1 >= argv.length) throw new Error('--out 缺少目录参数');
      opts.outDir = path.resolve(argv[++i]);
    } else if (a.startsWith('--out=')) {
      opts.outDir = path.resolve(a.slice('--out='.length));
    } else {
      throw new Error(`未知参数: ${a}（用 --help 查看用法）`);
    }
  }

  if (opts.hostSet && opts.hostSet.size === 0) {
    throw new Error('--host 未提供有效宿主 id');
  }
  return opts;
}

function resolveSkillTargets(env, targetHosts, opts) {
  const targets = [path.join(env.home, '.agents', 'skills')];
  for (const h of targetHosts) {
    if (typeof h.skillDir !== 'function') continue;
    const isTarget = opts.hostSet ? opts.hostSet.has(h.id) : h.detect();
    if (!isTarget) continue;
    // Claude Code 仅在 ~/.claude 已存在或明确指定 --host claude-code 时同步 ~/.claude/skills
    if (h.id === 'claude-code' && !opts.hostSet && !exists(path.join(env.home, '.claude'))) {
      continue;
    }
    const dir = h.skillDir();
    if (!targets.includes(dir)) targets.push(dir);
  }
  return targets;
}

function runList(hosts) {
  log('==========================================');
  log('  TIA MCP 网关 D - 宿主环境探测 (--list)');
  log('  包目录: ' + ROOT);
  log('==========================================\n');

  for (const h of hosts) {
    const info = inspectHost(h);
    const detLabel = info.detected ? '已检测到' : '未检测到';
    let stateLabel = '未配置';
    if (info.status === 'unchanged') stateLabel = '已配置(路径一致)';
    else if (info.status === 'updated') stateLabel = info.fileExists ? '已配置(旧路径/待更新)' : '未建文件(可初始化)';
    else if (info.status === 'written') stateLabel = '未配置(可写入)';
    else if (info.status === 'unparsable') stateLabel = `配置损坏(${info.err})`;

    log(`- ${h.id.padEnd(15)} | ${h.name.padEnd(17)} | ${detLabel} | ${stateLabel}`);
    log(`    目标: ${info.file}`);
  }
}

function main() {
  const env = getEnvPaths();
  const hosts = buildHosts(env);

  let opts;
  try {
    opts = parseArgs(process.argv.slice(2), hosts);
  } catch (e) {
    console.error('参数错误: ' + e.message);
    process.exit(1);
  }

  if (opts.help) {
    printUsage(hosts);
    return;
  }

  if (!fs.existsSync(NODE) || !fs.existsSync(GW)) {
    console.error('包不完整：找不到 gateway/runtime/node.exe 或 gateway/gateway.js');
    process.exit(1);
  }

  if (opts.list) {
    runList(hosts);
    return;
  }

  const modeTag = opts.dryRun ? '（预演模式）' : opts.configsOnly ? '（仅生成配置模板）' : '';
  log('==========================================');
  log('  TIA MCP 网关 D  v1.4.3  安装' + modeTag);
  log('  安装目录: ' + ROOT);
  log('==========================================\n');

  const targetHosts = opts.hostSet ? hosts.filter((h) => opts.hostSet.has(h.id)) : hosts;

  /* 1. skills */
  log('[1/3] 安装 skills');
  const skillsSrc = path.join(ROOT, 'skills');
  const skillNames = exists(skillsSrc)
    ? fs
        .readdirSync(skillsSrc, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
    : [];
  if (opts.configsOnly) {
    skip(`--configs-only 模式，跳过同步用户目录 skills（包内共 ${skillNames.length} 个 skill）`);
  } else {
    const skillTargets = resolveSkillTargets(env, targetHosts, opts);
    for (const dstRoot of skillTargets) {
      if (opts.dryRun) {
        dry(`将同步 ${skillNames.length} 个 skills → ${dstRoot}`);
        continue;
      }
      fs.mkdirSync(dstRoot, { recursive: true });
      for (const name of skillNames) {
        copyDir(path.join(skillsSrc, name), path.join(dstRoot, name));
      }
      ok(`${dstRoot}（${skillNames.length} 个 skill）`);
    }
  }

  /* 2. 客户端配置 */
  log('\n[2/3] 自动配置 AI 客户端' + (opts.hostSet ? `（限定: ${[...opts.hostSet].join(', ')}）` : ''));
  const manual = [];
  const activeNames = [];
  let workbuddyActive = false;

  if (opts.configsOnly) {
    skip('--configs-only 模式，跳过探测与修改用户宿主配置文件');
  } else {
    for (const h of targetHosts) {
      const r = applyHost(h, opts);
      if (r.status === 'written' || r.status === 'updated') {
        if (opts.dryRun) {
          dry(`${h.name} ${r.status === 'updated' ? '将更新' : '将写入'} → ${r.file}`);
        } else {
          ok(`${h.name} ${r.status === 'updated' ? '已更新' : '已配置'} → ${r.file}`);
          if (r.backup) console.log(`         原文件已备份为 ${path.basename(r.backup)}`);
        }
        activeNames.push(h.name);
        if (h.id === 'workbuddy') workbuddyActive = true;
      } else if (r.status === 'unchanged') {
        skip(`${h.name} 路径已一致，跳过（未产生备份） → ${r.file}`);
        activeNames.push(h.name);
        if (h.id === 'workbuddy') workbuddyActive = true;
      } else if (r.status === 'unparsable') {
        warn(`${h.name} 的配置无法安全解析（${r.err}） → ${r.file}`);
        manual.push(`${h.name}(${h.templateFile})`);
      } else {
        skip(`${h.name} 未安装或未找到配置 → 模板见 生成的配置\\${h.templateFile}`);
        manual.push(h.name);
      }
    }
  }

  /* 3. 模板输出 */
  if (opts.dryRun) {
    dry(`将生成 10 份客户端配置模板与 使用说明.txt → ${opts.outDir}`);
  } else {
    writeTemplates(opts.outDir, hosts);
    ok(`已生成全部 10 份配置模板与 使用说明.txt → ${opts.outDir}`);
  }

  /* 4. 包完整性自检 */
  log('\n[3/3] 自检');
  const checks = [
    ['网关主程序', GW],
    ['Node 运行时', NODE],
    ['上游 A（47 工具 / V15–V21.1）', path.join(ROOT, 'upstreams', 'a', 'tia-portal-mcp.exe')],
    ['上游 B V20 运行时', path.join(ROOT, 'upstreams', 'b', 'runtime', 'v20', 'TiaMcpServer.exe')],
    ['上游 B V21 运行时', path.join(ROOT, 'upstreams', 'b', 'runtime', 'v21', 'TiaMcpServer.exe')],
    ['规则层 skill (tia-portal-ops)', path.join(ROOT, 'skills', 'tia-portal-ops', 'SKILL.md')],
    ['V20 实操 skill (siemens-v20-ops)', path.join(ROOT, 'skills', 'siemens-v20-ops', 'SKILL.md')],
    ['PLC 知识库 skill (plc-skill)', path.join(ROOT, 'skills', 'plc-skill', 'SKILL.md')],
    ['S7-1200/1500 官方编程与LGF库 skill (siemens-s7-1200-1500-programming)', path.join(ROOT, 'skills', 'siemens-s7-1200-1500-programming', 'SKILL.md')],
    ['黄金标准块与 Factory I/O 蓝本 skill (tia-golden-blocks)', path.join(ROOT, 'skills', 'tia-golden-blocks', 'SKILL.md')],
    ['先规格后搬砖流程 skill (tia-spec-first)', path.join(ROOT, 'skills', 'tia-spec-first', 'SKILL.md')],
  ];
  let bad = 0;
  for (const [n, p] of checks) {
    if (fs.existsSync(p)) ok(n);
    else {
      warn('缺失：' + n);
      bad++;
    }
  }

  log('\n==========================================');
  const doneLabel = opts.dryRun ? ' 预演完成' : opts.configsOnly ? ' 模板生成完成' : ' 安装完成';
  log(bad === 0 ? `${doneLabel}（${checks.length} 项自检全过）` : `${doneLabel}，但有 ${bad} 项缺失`);
  log('==========================================');
  if (opts.configsOnly) {
    log(`\n模板目录: ${opts.outDir}`);
    log('如需同步 skills 并自动配置本机已装 AI 客户端，请执行 安装.bat（不带 --configs-only）。\n');
    return;
  }
  log('\n还需要你自己做的事：');
  log('  1) 打开 TIA Portal（V20 或 V21），载入或新建一个工程');
  if (activeNames.length) {
    log(`  2) 重启已配置的 AI 客户端（${activeNames.join(' / ')}）`);
  } else {
    log('  2) 按 生成的配置\\使用说明.txt 配置并重启你的 AI 客户端');
  }
  if (workbuddyActive) {
    log('  3) 若使用 WorkBuddy，请在界面「专家技能连接器 → 自定义连接器 → tia-gateway」点一次「信任」');
  }
  if (manual.length) {
    log('\n未自动写入的客户端（如需使用，参考模板目录或传 --host <id> 强制生成）：' + manual.join('、'));
  }
  log('\n首次连接 TIA 会弹西门子 Openness 授权窗口，必须人工点「是，全部接受」。');
  log('详细说明见 快速开始.md\n');
}

main();
