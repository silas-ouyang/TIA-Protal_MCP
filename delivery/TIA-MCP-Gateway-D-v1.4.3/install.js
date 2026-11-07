#!/usr/bin/env node
'use strict';
/*
 * 一键安装：复制 skills + 自动把 MCP 配置写进你机器上已装的 AI 客户端。
 * 用包里自带的 node 运行，不需要系统装 Node。
 *
 * 设计原则：
 *  - 只做"合并"，不覆盖你原有的 MCP 配置
 *  - 改之前一律备份成 xxx.bak-时间戳
 *  - 找不到的客户端不猜，把模板留在 生成的配置/ 里并提示手动放
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = __dirname;
const NODE = path.join(ROOT, 'gateway', 'runtime', 'node.exe');
const GW = path.join(ROOT, 'gateway', 'gateway.js');
const OUT = path.join(ROOT, '生成的配置');
const HOME = os.homedir();

const log = (s) => console.log(s);
const ok = (s) => console.log('  [完成] ' + s);
const skip = (s) => console.log('  [跳过] ' + s);
const warn = (s) => console.log('  [注意] ' + s);

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
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

function backup(file) {
  const b = file + '.bak-' + stamp();
  fs.copyFileSync(file, b);
  return b;
}

/* ------------------------------------------------------------------ */
/* 三个客户端的配置合并                                                */
/* ------------------------------------------------------------------ */

function opencodeEntry() {
  return {
    type: 'local',
    command: [NODE, GW],
    timeout: { startup: 180000, catalog: 180000, execution: 1800000 },
  };
}

function tryOpencode() {
  const candidates = [];
  if (process.env.XDG_CONFIG_HOME) {
    candidates.push(path.join(process.env.XDG_CONFIG_HOME, 'opencode', 'opencode.json'));
  }
  candidates.push(path.join(HOME, '.config', 'opencode', 'opencode.json'));
  candidates.push(path.join(HOME, '.opencode', 'opencode.json'));

  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) return { status: 'notfound', hint: candidates[0] };

  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(found, 'utf8'));
  } catch (e) {
    return { status: 'unparsable', file: found, err: e.message };
  }
  cfg.mcp = cfg.mcp || {};
  cfg.mcp.servers = cfg.mcp.servers || {};
  if (cfg.mcp.servers.tia) return { status: 'exists', file: found };
  cfg.mcp.servers.tia = opencodeEntry();
  const bak = backup(found);
  fs.writeFileSync(found, JSON.stringify(cfg, null, 2), 'utf8');
  return { status: 'written', file: found, backup: bak };
}

function tryWorkbuddy() {
  const found = path.join(HOME, '.workbuddy-ai', 'mcp.json');
  if (!fs.existsSync(found)) return { status: 'notfound', hint: found };

  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(found, 'utf8'));
  } catch (e) {
    return { status: 'unparsable', file: found, err: e.message };
  }
  cfg.mcpServers = cfg.mcpServers || {};
  if (cfg.mcpServers['tia-gateway']) return { status: 'exists', file: found };
  cfg.mcpServers['tia-gateway'] = { command: NODE, args: [GW], env: {} };
  const bak = backup(found);
  fs.writeFileSync(found, JSON.stringify(cfg, null, 2), 'utf8');
  return { status: 'written', file: found, backup: bak };
}

function dshBlock() {
  return [
    '',
    '# TIA 统一网关 D（内部路由到 A/B 两套博途 MCP）',
    '- insert:',
    '    - id: mcp-tia-gateway',
    "      name: '@deepseek-ai/dsh-mcp-client'",
    '      config:',
    '        serverName: tia',
    '        transport: stdio',
    "        command: '" + NODE.replace(/\\/g, '\\\\') + "'",
    "        args: ['" + GW.replace(/\\/g, '\\\\') + "']",
    '        toolCallTimeoutMs: 1800000',
    '        failOnStartupError: false',
    '',
  ].join('\n');
}

function tryDsh() {
  const found = path.join(HOME, '.dsh', 'profiles', 'desktop', 'cordis.patch.yml');
  if (!fs.existsSync(found)) return { status: 'notfound', hint: found };

  const text = fs.readFileSync(found, 'utf8');
  if (text.includes('mcp-tia-gateway')) return { status: 'exists', file: found };
  const bak = backup(found);
  fs.writeFileSync(found, text.replace(/\s*$/, '\n') + dshBlock(), 'utf8');
  return { status: 'written', file: found, backup: bak };
}

/* ------------------------------------------------------------------ */
/* 主流程                                                              */
/* ------------------------------------------------------------------ */

function main() {
  log('==========================================');
  log('  TIA MCP 网关 D  v1.4.3  安装');
  log('  安装目录: ' + ROOT);
  log('==========================================\n');

  if (!fs.existsSync(NODE) || !fs.existsSync(GW)) {
    console.error('包不完整：找不到 gateway/runtime/node.exe 或 gateway/gateway.js');
    process.exit(1);
  }

  /* 1. skills */
  log('[1/3] 安装 skills');
  const skillRoots = [path.join(HOME, '.agents', 'skills'), path.join(HOME, '.workbuddy-ai', 'skills')];
  const skillsSrc = path.join(ROOT, 'skills');
  const skillNames = fs
    .readdirSync(skillsSrc, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  for (const root of skillRoots) {
    fs.mkdirSync(root, { recursive: true });
    for (const name of skillNames) copyDir(path.join(skillsSrc, name), path.join(root, name));
    ok(root);
  }

  /* 2. 客户端配置 */
  log('\n[2/3] 自动配置 AI 客户端');
  fs.mkdirSync(OUT, { recursive: true });
  const manual = [];

  const results = [
    ['opencode', tryOpencode()],
    ['WorkBuddy', tryWorkbuddy()],
    ['DeepSeek Harness', tryDsh()],
  ];

  for (const [name, r] of results) {
    if (r.status === 'written') {
      ok(`${name} 已自动配置 → ${r.file}`);
      console.log(`         原文件已备份为 ${path.basename(r.backup)}`);
    } else if (r.status === 'exists') {
      skip(`${name} 里已经有 tia 配置，没动它 → ${r.file}`);
    } else if (r.status === 'unparsable') {
      warn(`${name} 的配置不是标准 JSON，没法自动合并 → ${r.file}`);
      manual.push(name);
    } else {
      skip(`${name} 没装或没找到配置 → 模板在 生成的配置\\`);
      manual.push(name);
    }
  }

  /* 3. 模板 */
  fs.writeFileSync(
    path.join(OUT, 'opencode.json'),
    JSON.stringify({ mcp: { servers: { tia: opencodeEntry() } } }, null, 2),
    'utf8'
  );
  fs.writeFileSync(
    path.join(OUT, 'workbuddy-mcp.json'),
    JSON.stringify({ mcpServers: { 'tia-gateway': { command: NODE, args: [GW], env: {} } } }, null, 2),
    'utf8'
  );
  fs.writeFileSync(path.join(OUT, 'dsh-cordis.patch.yml'), dshBlock().trimStart(), 'utf8');

  /* 4. 自检 */
  log('\n[3/3] 自检');
  const checks = [
    ['网关主程序', GW],
    ['Node 运行时', NODE],
    ['上游 A（47 工具 / V15–V21.1）', path.join(ROOT, 'upstreams', 'a', 'tia-portal-mcp.exe')],
    ['上游 B V20 运行时', path.join(ROOT, 'upstreams', 'b', 'runtime', 'v20', 'TiaMcpServer.exe')],
    ['上游 B V21 运行时', path.join(ROOT, 'upstreams', 'b', 'runtime', 'v21', 'TiaMcpServer.exe')],
    ['规则层 skill', path.join(ROOT, 'skills', 'tia-portal-ops', 'SKILL.md')],
    ['V20 实操 skill', path.join(ROOT, 'skills', 'siemens-v20-ops', 'SKILL.md')],
    ['PLC 知识库 skill', path.join(ROOT, 'skills', 'plc-skill', 'SKILL.md')],
    ['S7-1200/1500 官方编程与LGF库 skill', path.join(ROOT, 'skills', 'siemens-s7-1200-1500-programming', 'SKILL.md')],
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
  log(bad === 0 ? ' 安装完成（' + checks.length + ' 项自检全过）' : ' 安装完成，但有 ' + bad + ' 项缺失');
  log('==========================================');
  log('\n还需要你自己做的两件事：');
  log('  1) 打开 TIA Portal（V20 或 V21），载入或新建一个工程');
  log('  2) 重启你的 AI 客户端（opencode / DSH / WorkBuddy）');
  if (manual.length) {
    log('\n这些客户端的配置需要手动放一次（模板在 生成的配置\\）：' + manual.join('、'));
  }
  log('\n首次连接 TIA 会弹西门子 Openness 授权窗口，必须人工点「是，全部接受」。');
  log('详细说明见 快速开始.md\n');
}

main();
