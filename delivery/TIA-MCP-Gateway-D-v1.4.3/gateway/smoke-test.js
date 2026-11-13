#!/usr/bin/env node
'use strict';
/*
 * 网关 D 的全量离线自检（不依赖 TIA 运行，也不触碰宿主机 8000 端口外部进程）。
 * 覆盖：
 *  1. 纯函数单元测试（utils / blocks / connect / upstreams）
 *  2. 真实 d.config.json 零拉起诊断（d_doctor/d_versions）、真 B（lite 65 工具 + CallTool 转发 + 干跑计划）
 *  3. Mock HTTP A (listen(0)) 端口守卫 / 跨进程独占锁 / B->A 回退与 OpenProject 禁回退
 *  4. Mock B 故障注入矩阵 F1–F14 + pending_recovery 阻断与自愈
 * 用法：node smoke-test.js [gateway 文件名]
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');

const GW_FILE = process.argv[2] || 'gateway.js';
const NODE = process.execPath;
const GW = path.join(__dirname, GW_FILE);
const RUNTIME = fs.mkdtempSync(path.join(os.tmpdir(), 'tia-gw-smoke-'));
process.env.D_RUNTIME_DIR = RUNTIME;

const results = [];
const activeHttpServers = new Set();

function record(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  const tail = detail ? ' — ' + String(detail).replace(/\n/g, ' ').slice(0, 160) : '';
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${tail}`);
}

function text(res) {
  const r = (res && res.result) || {};
  if (r.content) return r.content.map((c) => c.text).join('\n');
  return JSON.stringify(r);
}

function parse(res) {
  const raw = text(res);
  try {
    return JSON.parse(raw);
  } catch {
    // failJson 返回 "message\n\n{json}" 时提取尾部 JSON 负载
    const idx = raw.indexOf('\n\n{');
    if (idx >= 0) {
      try {
        return JSON.parse(raw.slice(idx + 2));
      } catch {}
    }
    return null;
  }
}

function makeClient(tag, extraEnv) {
  const env = {
    ...process.env,
    D_RUNTIME_DIR: RUNTIME,
    HTTP_PROXY: '',
    HTTPS_PROXY: '',
    http_proxy: '',
    https_proxy: '',
    ...(extraEnv || {}),
  };
  const p = spawn(NODE, [GW], { cwd: __dirname, stdio: ['pipe', 'pipe', 'pipe'], env });
  let buf = '';
  const pending = new Map();
  let id = 1;
  const stderrLines = [];
  p.stdout.setEncoding('utf8');
  p.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.id !== undefined && pending.has(msg.id)) {
        const { resolve } = pending.get(msg.id);
        pending.delete(msg.id);
        resolve(msg);
      }
    }
  });
  p.stderr.on('data', (d) => stderrLines.push(d.toString()));
  p.on('exit', () => {
    for (const [, pWait] of pending) pWait.resolve({ error: { message: 'gateway exited' } });
    pending.clear();
  });
  const rpc = (method, params, timeoutMs = 600000) =>
    new Promise((resolve, reject) => {
      const rid = id++;
      const t = setTimeout(() => {
        pending.delete(rid);
        reject(new Error(`timeout ${method}`));
      }, timeoutMs);
      pending.set(rid, {
        resolve: (m) => {
          clearTimeout(t);
          resolve(m);
        },
      });
      p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: rid, method, params: params || {} }) + '\n');
    });
  return {
    p,
    stderrLines,
    rpc,
    async init() {
      const r = await rpc('initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: tag, version: '1' },
      });
      p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
      return r;
    },
    call: (name, args, timeoutMs) => rpc('tools/call', { name, arguments: args || {} }, timeoutMs),
  };
}

async function closeClient(c) {
  if (!c || !c.p || c.p.exitCode !== null) return;
  await new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    c.p.once('exit', finish);
    try {
      c.p.stdin.end();
    } catch {}
    setTimeout(() => {
      try {
        if (c.p.exitCode === null) c.p.kill();
      } catch {}
    }, 350);
    setTimeout(finish, 1800);
  });
}

function listenMockHttp(handler) {
  return new Promise((resolve) => {
    const srv = http.createServer(handler);
    activeHttpServers.add(srv);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      resolve({
        server: srv,
        port: addr.port,
        url: `http://127.0.0.1:${addr.port}/mcp`,
        close: () =>
          new Promise((r) => {
            activeHttpServers.delete(srv);
            srv.close(() => r());
          }),
      });
    });
  });
}

function getUnusedPort() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function createMockStreamableHttpA(opts = {}) {
  const stats = {
    initialized: 0,
    deletedSessions: [],
    calls: [],
    nonSse406Count: 0,
  };
  let nextSid = 1;
  return listenMockHttp((req, res) => {
    if (req.method === 'DELETE') {
      const sid = req.headers['mcp-session-id'];
      if (sid) stats.deletedSessions.push(sid);
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('terminated');
      return;
    }
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const accept = req.headers.accept || '';
      if (!accept.includes('text/event-stream')) {
        stats.nonSse406Count++;
        res.writeHead(406, { 'Content-Type': 'text/plain' });
        res.end('Not Acceptable: Client must accept both application/json and text/event-stream');
        return;
      }
      let msg;
      try {
        msg = JSON.parse(body || '{}');
      } catch {
        res.writeHead(400);
        res.end('invalid json');
        return;
      }
      if (msg.method === 'initialize') {
        stats.initialized++;
        const sid = `mock-a-sess-${nextSid++}`;
        res.writeHead(200, { 'Content-Type': 'application/json', 'mcp-session-id': sid });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            result: { protocolVersion: '2025-06-18', serverInfo: { name: 'mock-a', version: '1.4.1' }, capabilities: {} },
          })
        );
        return;
      }
      if (msg.method === 'notifications/initialized') {
        res.writeHead(202);
        res.end('');
        return;
      }
      if (msg.method === 'tools/list') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            result: {
              tools: [
                { name: 'get_tia_status', inputSchema: { type: 'object', properties: {} } },
                { name: 'connect_tia', inputSchema: { type: 'object', properties: {} } },
                { name: 'disconnect_tia', inputSchema: { type: 'object', properties: {} } },
              ],
            },
          })
        );
        return;
      }
      if (msg.method === 'tools/call') {
        const name = msg.params && msg.params.name;
        const args = (msg.params && msg.params.arguments) || {};
        stats.calls.push({ name, args });
        if (name === 'connect_tia' && opts.failConnectTia) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id: msg.id,
              result: { isError: true, content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'mock A connect failed' }) }] },
            })
          );
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            result: { content: [{ type: 'text', text: JSON.stringify({ ok: true, tool: name, args }) }] },
          })
        );
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }));
    });
  }).then((srv) => ({ ...srv, stats }));
}

function buildMockBScriptSource() {
  return `
const fs = require('fs');
const path = require('path');
let buf = '';
const logPath = process.env.MOCK_LOG;
const ctlPath = process.env.MOCK_CTL || '';
const staticMode = process.env.MOCK_MODE || 'normal';
let blockInfoSeqState = { id: null, idx: 0 };

const readCtl = () => {
  if (!ctlPath) return {};
  try { return JSON.parse(fs.readFileSync(ctlPath, 'utf8')); } catch { return {}; }
};
const rec = (e) => {
  if (logPath) fs.appendFileSync(logPath, JSON.stringify({ ...e, ts: Date.now() }) + '\\n');
};
const reply = (id, result) => {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\\n');
};
const textRes = (obj, isError = false) => ({
  ...(isError ? { isError: true } : {}),
  content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj) }],
});

const LITE_TOOLS = [
  'Connect','OpenProject','AttachToOpenProject','GetProject','Disconnect',
  'GoOffline','CompileAndDiagnosePlc','SaveProject','DescribeBlockLogic',
  'ExportBlock','ExportAsDocuments','ImportFromDocuments','ImportBlock','ImportType',
  'GenerateBlocksFromExternalSource','DeletePlcBlock','DeletePlcExternalSource',
  'GetBlocks','GetBlocksWithHierarchy','GetBlockInfo','CheckDownloadReadiness',
  'DownloadToPlc','PingSlow','Bootstrap','CallTool'
];

process.stdin.setEncoding('utf8');
process.stdin.on('data', async (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.method === 'initialize') {
      reply(msg.id, { protocolVersion: '2025-06-18', serverInfo: { name: 'mock-b', version: '2.7.8' }, capabilities: {} });
    } else if (msg.method === 'tools/list') {
      reply(msg.id, { tools: LITE_TOOLS.map((name) => ({ name, inputSchema: { type: 'object', properties: {} } })) });
    } else if (msg.method === 'tools/call') {
      const rawName = msg.params.name;
      const rawArgs = msg.params.arguments || {};
      let name = rawName;
      let args = rawArgs;
      if (rawName === 'CallTool') {
        name = rawArgs.name;
        try { args = JSON.parse(rawArgs.argumentsJson || '{}'); } catch { args = {}; }
      }
      const ctl = readCtl();
      const mode = ctl.mode || staticMode;
      rec({ phase: 'start', name, via: rawName, args });

      if (ctl.deleteLockOnTool && ctl.deleteLockOnTool === name && ctl.lockPath) {
        try { fs.unlinkSync(ctl.lockPath); } catch {}
      }

      if (name === 'PingSlow') {
        await new Promise((r) => setTimeout(r, 120));
        rec({ phase: 'end', name, args });
        reply(msg.id, textRes({ seq: args.seq }));
        continue;
      }
      if (name === 'Connect') {
        rec({ phase: 'end', name });
        if (mode === 'connect-fail') {
          reply(msg.id, textRes('TIA Not Running', true));
        } else if (mode === 'connect-infra-fail') {
          reply(msg.id, textRes('FileNotFoundException: Siemens.Engineering.dll not found', true));
        } else {
          reply(msg.id, textRes({ ok: true, connected: true }));
        }
        continue;
      }
      if (name === 'OpenProject') {
        rec({ phase: 'end', name });
        if (mode === 'open-fail') {
          reply(msg.id, textRes('Project file not found: missing.ap20', true));
        } else {
          reply(msg.id, textRes({ ok: true, path: args.path }));
        }
        continue;
      }
      if (name === 'AttachToOpenProject') {
        rec({ phase: 'end', name });
        if (mode === 'open-fail') {
          reply(msg.id, textRes('AttachToOpenProject failed: no matching open project', true));
        } else {
          reply(msg.id, textRes({ ok: true, projectName: args.projectName }));
        }
        continue;
      }
      if (name === 'GetProject') {
        rec({ phase: 'end', name });
        if (mode === 'getproject-fail') {
          reply(msg.id, textRes('COM GetProject error', true));
        } else {
          reply(msg.id, textRes({ items: ctl.projects || [] }));
        }
        continue;
      }
      if (name === 'GoOffline' && mode === 'offline-fail') {
        rec({ phase: 'end', name });
        reply(msg.id, textRes({ ok: false, message: 'go offline failed' }));
        continue;
      }
      if (name === 'GetBlocksWithHierarchy') {
        rec({ phase: 'end', name });
        if (ctl.failTools && ctl.failTools.GetBlocksWithHierarchy) {
          reply(msg.id, textRes(ctl.failTools.GetBlocksWithHierarchy, true));
        } else {
          reply(msg.id, textRes(ctl.hierarchy || { root: { blocks: [{ name: 'FB1', isConsistent: true }], groups: [] } }));
        }
        continue;
      }
      if (name === 'GetBlockInfo') {
        rec({ phase: 'end', name });
        if (ctl.failTools && ctl.failTools.GetBlockInfo) {
          reply(msg.id, textRes(ctl.failTools.GetBlockInfo, true));
        } else {
          let override = null;
          if (Array.isArray(ctl.blockInfoSeq) && ctl.blockInfoSeq.length > 0) {
            const sid = ctl.blockInfoSeqId || 'default';
            if (blockInfoSeqState.id !== sid) blockInfoSeqState = { id: sid, idx: 0 };
            const pos = Math.min(blockInfoSeqState.idx, ctl.blockInfoSeq.length - 1);
            override = ctl.blockInfoSeq[pos];
            blockInfoSeqState.idx += 1;
          } else {
            override = (ctl.blockInfoByPath && ctl.blockInfoByPath[args.blockPath]) || ctl.blockInfo;
          }
          reply(msg.id, textRes(override || { isConsistent: true, typeName: 'FB', attributes: { Number: 10, AutoNumber: true } }));
        }
        continue;
      }
      if (name === 'ExportBlock') {
        rec({ phase: 'end', name });
        if (ctl.failTools && ctl.failTools.ExportBlock) {
          reply(msg.id, textRes(ctl.failTools.ExportBlock, true));
          continue;
        }
        fs.mkdirSync(args.exportPath, { recursive: true });
        const leaf = String(args.blockPath || 'Block').split(/[\\\\/]/).pop();
        const xmlBody = ctl.backupXmlOverride !== undefined ? ctl.backupXmlOverride : '<Document><SW.Blocks.FB/></Document>';
        fs.writeFileSync(path.join(args.exportPath, leaf + '.xml'), xmlBody, 'utf8');
        reply(msg.id, textRes({ ok: true, exported: leaf + '.xml' }));
        continue;
      }
      if (name === 'ExportAsDocuments') {
        rec({ phase: 'end', name });
        if (ctl.failTools && ctl.failTools.ExportAsDocuments) {
          reply(msg.id, textRes(ctl.failTools.ExportAsDocuments, true));
          continue;
        }
        fs.mkdirSync(args.exportPath, { recursive: true });
        const leaf = String(args.blockPath || 'Block').split(/[\\\\/]/).pop();
        fs.writeFileSync(path.join(args.exportPath, leaf + '.s7dcl'), 'FUNCTION_BLOCK "' + leaf + '"', 'utf8');
        fs.writeFileSync(path.join(args.exportPath, leaf + '.s7res'), 'Resources: []', 'utf8');
        reply(msg.id, textRes({ ok: true, blockPath: args.blockPath }));
        continue;
      }
      if (name === 'DeletePlcBlock') {
        rec({ phase: 'end', name });
        if (args.dryRun) {
          reply(msg.id, textRes({ data: ctl.dryRunData || { crossReferenceAvailable: true, crossReferenceCount: 0 } }));
          continue;
        }
        if (ctl.failTools && ctl.failTools.DeletePlcBlock) {
          reply(msg.id, textRes(ctl.failTools.DeletePlcBlock, true));
        } else {
          reply(msg.id, textRes({ ok: true, deleted: args.blockPath }));
        }
        continue;
      }
      if (name === 'GenerateBlocksFromExternalSource') {
        rec({ phase: 'end', name });
        if (ctl.failTools && ctl.failTools.GenerateBlocksFromExternalSource) {
          reply(msg.id, textRes(ctl.failTools.GenerateBlocksFromExternalSource, true));
        } else {
          reply(msg.id, textRes({ ok: true, generated: args.externalSourceName }));
        }
        continue;
      }
      if (name === 'CompileAndDiagnosePlc') {
        rec({ phase: 'end', name });
        if (ctl.compileResult !== undefined) {
          reply(msg.id, textRes(ctl.compileResult));
        } else {
          reply(msg.id, textRes({ State: 'Success', ErrorCount: 0, Errors: [], Meta: { success: true, diagnosticsComplete: true } }));
        }
        continue;
      }
      if (name === 'MoveBlockToGroup') {
        rec({ phase: 'end', name });
        if (ctl.failTools && ctl.failTools.MoveBlockToGroup) {
          reply(msg.id, textRes(ctl.failTools.MoveBlockToGroup, true));
        } else {
          reply(msg.id, textRes({ ok: true, targetGroupPath: args.targetGroupPath }));
        }
        continue;
      }
      if (name === 'CreatePlcBlockGroup') {
        rec({ phase: 'end', name });
        if (ctl.failTools && ctl.failTools.CreatePlcBlockGroup) {
          reply(msg.id, textRes(ctl.failTools.CreatePlcBlockGroup, true));
        } else {
          reply(msg.id, textRes({ ok: true, groupPath: args.groupPath }));
        }
        continue;
      }
      if (name === 'ImportBlock') {
        rec({ phase: 'end', name });
        const failMap = ctl.failImportByGroup || {};
        const key = args.groupPath || '<root>';
        if (failMap[key]) {
          reply(msg.id, textRes(failMap[key], true));
        } else if (ctl.failTools && ctl.failTools.ImportBlock) {
          reply(msg.id, textRes(ctl.failTools.ImportBlock, true));
        } else {
          reply(msg.id, textRes({ ok: true, groupPath: args.groupPath }));
        }
        continue;
      }
      rec({ phase: 'end', name });
      reply(msg.id, textRes({ ok: true, tool: name, args }));
    }
  }
});
`;
}

(async () => {
  try {
    /* ================================================================ */
    /* 1. 纯函数单元测试（utils / blocks / connect / upstreams）          */
    /* ================================================================ */
    const g = require(GW);

    const errCases = [
      ['{"errorCount": 2}', true],
      ['{"error_count": 1}', true],
      ['{"State": "Error", "ErrorCount": 0}', true],
      ['{"totalErrorCount": 1}', true],
      ['{"overallState": "Error"}', true],
      ['{"ok": false}', true],
      ['{"errorCount": 0, "warningCount": 3}', false],
      ['{"ok": true}', false],
      ['编译完成，0 个错误', false],
    ];
    record('compileHasErrors 9 种形态', errCases.every(([t, want]) => g.compileHasErrors(t) === want), errCases.length + ' 个用例');
    record('slug 过滤路径穿越与保留名', g.slug('..') === '_' && g.slug('CON') === '_CON', `${g.slug('..')} / ${g.slug('CON')}`);
    record('versionFromPath 从 .ap20 推断', g.versionFromPath('D:\\p\\line.ap20') === 20, '');
    record(
      'compileHasErrors 容忍带前缀与引号',
      g.compileHasErrors('编译输出如下 {"errorCount": 2}') === true && g.compileHasErrors('result: {"error_count":1}') === true,
      ''
    );
    record(
      'compileHasErrors 不被子项 ok:false 误判',
      g.compileHasErrors('{"errorCount":0,"state":"Success","items":[{"ok":false}]}') === false,
      ''
    );
    record('slug 保留块名中间的单个点', g.slug('FB_Motor.V2') === 'FB_Motor.V2', g.slug('FB_Motor.V2'));

    const tf = [
      [{ isError: true }, true],
      [{ content: [{ type: 'text', text: '{"success":false}' }] }, true],
      [{ content: [{ type: 'text', text: '{"Ready":false}' }] }, true],
      [{ content: [{ type: 'text', text: '{"meta":{"success":false}}' }] }, true],
      [{ content: [{ type: 'text', text: '{"ok":true}' }] }, false],
      [{ content: [{ type: 'text', text: 'not json' }] }, false],
      [null, true],
    ];
    record('isToolFailure 7 种形态', tf.every(([r, want]) => g.isToolFailure(r) === want), tf.length + ' 个用例');
    record(
      'stripRoot 剥根容器前缀',
      g.stripRoot('程序块/Main') === 'Main' &&
        g.stripRoot('Program blocks/工位A/FC_1') === '工位A/FC_1' &&
        g.stripRoot('工位A/子功能/FC_1') === '工位A/子功能/FC_1' &&
        g.stripRoot('') === '',
      ''
    );
    record(
      'isTolerableFailure 只吞 NotFound',
      g.isTolerableFailure({ allowNotFound: true }, "block 'X' not found in 'PLC_1'") === true &&
        g.isTolerableFailure({ allowNotFound: true }, 'PLC software not found at PLC') === false &&
        g.isTolerableFailure({ allowNotFound: true }, "PlcSoftware not found at 'PLC'") === false &&
        g.isTolerableFailure({ allowNotFound: true }, "Software container not found for path 'PLC'") === false &&
        g.isTolerableFailure({ allowNotFound: true }, 'not permitted in online mode') === false &&
        g.isTolerableFailure({}, 'anything') === false &&
        g.isTolerableFailure({ optional: true }, 'anything') === true,
      ''
    );
    record(
      'isToolFailure 认小写 state / overallState',
      g.isToolFailure({ content: [{ type: 'text', text: '{"state":"Error","errorCount":4}' }] }) === true &&
        g.isToolFailure({ content: [{ type: 'text', text: '{"overallState":"Failed"}' }] }) === true &&
        g.isToolFailure({ content: [{ type: 'text', text: '{"state":"Success","errorCount":0}' }] }) === false,
      ''
    );

    const splitRes = g.normalizeBlockTarget('程序块/工位A/子功能/FB_1', '');
    let verConflictCaught = false;
    try {
      g.resolveConnectVersion('V20', 'line.ap16');
    } catch (e) {
      verConflictCaught = /版本冲突/.test(e.message);
    }
    record(
      'normalizeBlockTarget 拆分 Group/Block + resolveConnectVersion 冲突校验',
      splitRes.block === 'FB_1' &&
        splitRes.group === '工位A/子功能' &&
        g.resolveConnectVersion('auto', 'line.ap20').major === 20 &&
        verConflictCaught,
      `${splitRes.group}/${splitRes.block}`
    );

    const pn = [
      ['{"projectName":"Line1"}', 'Line1'],
      ['[{"name":"P1"}]', 'P1'],
      ['{"items":[{"ProjectName":"P2"}]}', 'P2'],
      ['{"items":[{"name":"A"},{"name":"B"}]}', null],
      ['{"projects":[]}', null],
    ];
    record('extractProjectName 5 种形态', pn.every(([t, want]) => g.extractProjectName(t) === want), pn.length + ' 个用例');

    // 新增 P0-1 / P1-2 纯函数单测
    const decls1 = g.parseSclDeclarations(
      '(* FUNCTION_BLOCK "InComment" *)\n// FUNCTION "LineComment"\nFUNCTION_BLOCK "FB_Main"\nVAR s: STRING := \'FUNCTION "InStr"\'; END_VAR\nBEGIN\nEND_FUNCTION_BLOCK\nTYPE "UDT_Aux"\nSTRUCT a: INT; END_STRUCT;\nEND_TYPE'
    );
    record(
      'parseSclDeclarations 忽略注释与字符串并识别多块声明',
      decls1.declarations.length === 2 &&
        decls1.declarations[0].name === 'FB_Main' &&
        decls1.declarations[1].name === 'UDT_Aux',
      decls1.declarations.map((d) => `${d.kind}:${d.name}`).join(', ')
    );

    const hierSample = {
      root: {
        name: 'Program blocks',
        blocks: [{ name: 'Main', typeName: 'OB' }],
        groups: [
          {
            name: '工位A',
            blocks: [{ name: 'FB_Target', isConsistent: true, attributes: { Number: 12, AutoNumber: false } }],
            groups: [{ name: '子组1', blocks: [{ name: 'FB_Sub', isConsistent: true }] }],
          },
          { name: '工位B', blocks: [{ name: 'FB_Dup' }] },
          { name: '工位C', blocks: [{ name: 'FB_Dup' }] },
        ],
      },
    };
    const hFound = g.findBlockInHierarchy(hierSample, 'fb_sub');
    const hAmb = g.findBlockInHierarchy(hierSample, 'FB_Dup');
    record(
      'findBlockInHierarchy 剥根定位与跨组重名判别',
      hFound.valid &&
        hFound.match &&
        hFound.match.originGroup === '工位A/子组1' &&
        hFound.match.originPath === '工位A/子组1/FB_Sub' &&
        hAmb.ambiguous === true &&
        hAmb.matches.length === 2,
      hFound.match && hFound.match.originPath
    );

    const polBlocked = g.decideBackupPolicy({ exists: true, originPath: 'FB1', isConsistent: false }, { overwrite: true });
    const polAllow = g.decideBackupPolicy(
      { exists: true, originPath: 'FB1', isConsistent: false },
      { overwrite: true, allow_unbacked_overwrite: true }
    );
    record(
      'decideBackupPolicy 不一致旧块默认阻断且支持显式放行',
      polBlocked.allowed === false &&
        polBlocked.status === 'blocked_inconsistent' &&
        polAllow.allowed === true &&
        polAllow.status === 'skipped_unbacked',
      `${polBlocked.status}/${polAllow.status}`
    );

    const diagF12 = g.checkSclCompileDiagnostics({ State: 'Success', ErrorCount: 2, Errors: [] }, 'FB_Target', '工位A');
    const diagForeign = g.checkSclCompileDiagnostics(
      { State: 'Error', ErrorCount: 1, Errors: [{ Path: '工位B/OtherFB', Message: 'err' }], Meta: { diagnosticsComplete: true } },
      'FB_Target',
      '工位A'
    );
    const diagIncomplete = g.checkSclCompileDiagnostics(
      { State: 'Error', ErrorCount: 1, Errors: [{ Path: '工位B/OtherFB', Message: 'err' }], Meta: { diagnosticsComplete: false } },
      'FB_Target',
      '工位A'
    );
    record(
      'checkSclCompileDiagnostics F12 残缺诊断/foreignErrors 隔离/incomplete fail-closed',
      diagF12.hasTargetErrors === true &&
        diagForeign.hasTargetErrors === false &&
        diagForeign.foreignErrors.length === 1 &&
        diagIncomplete.hasTargetErrors === true,
      ''
    );

    record(
      'isEngineeringNotSupportedError 精确匹配并排除 not found/IsConsistent',
      g.isEngineeringNotSupportedError('EngineeringNotSupportedException: Language SCL not supported') === true &&
        g.isEngineeringNotSupportedError('EngineeringNotSupportedException: Block not found') === false &&
        g.isEngineeringNotSupportedError('InvalidState: IsConsistent=false') === false,
      ''
    );

    // P0-2 / P1-1 纯函数单测
    const fakeProbe = { installedMajors: [16, 20], portals: [{ pid: 1001, major: 16 }] };
    const fakeProbeWithBg = {
      installedMajors: [16, 20],
      portals: [
        { pid: 1001, major: 16, cmd: '"C:\\Program Files\\Siemens\\Automation\\Portal V16\\Bin\\Siemens.Automation.Portal.exe"' },
        {
          pid: 1002,
          major: 16,
          cmd: '"C:\\Program Files\\Siemens\\Automation\\Portal V16\\Bin\\Siemens.Automation.Portal.exe" -Name=SearchReplaceBackgroundProcess -processId=1001',
        },
      ],
    };
    let missingVerErr = false;
    try {
      g.routeCandidates(19, fakeProbe);
    } catch {
      missingVerErr = true;
    }
    record(
      'routeCandidates 版本路由/单 Portal+过滤伴生后台进程/未装版本拒连 & isBInfraFallbackError',
      g.resolveAutoVersion(null, fakeProbe, { hasProjectPath: false }).major === 16 &&
        g.resolveAutoVersion(null, fakeProbeWithBg, { hasProjectPath: false }).major === 16 &&
        g.routeCandidates(20, fakeProbe).join(',') === 'b,a' &&
        g.routeCandidates(16, fakeProbe).join(',') === 'a' &&
        missingVerErr &&
        g.isBInfraFallbackError('FileNotFoundException', 'connect') === true &&
        g.isBInfraFallbackError('FileNotFoundException', 'open_project') === false,
      ''
    );

    const unusedPort = await getUnusedPort();
    const probeFree = await g.probePort8000(`http://127.0.0.1:${unusedPort}/mcp`, null, {
      _runCmd: async () => ({ ok: true, stdout: '', stderr: '' }),
    });
    const probeMcpSrv = await createMockStreamableHttpA();
    const probeMcpRes = await g.probePort8000(probeMcpSrv.url, null, { withServerInfo: true });
    await probeMcpSrv.close();
    record(
      'probePort8000 (free / foreign_mcp + 配对 DELETE /mcp 清理 session)',
      probeFree.status === 'free' &&
        probeMcpRes.status === 'foreign_mcp' &&
        probeMcpRes.serverInfo &&
        probeMcpRes.serverInfo.name === 'mock-a' &&
        probeMcpRes.sessionClosed === true &&
        probeMcpSrv.stats.deletedSessions.length === 1,
      `del=${probeMcpSrv.stats.deletedSessions.join(',')}`
    );

    if (process.platform === 'win32') {
      g.resetProbeLocalTiaCache();
      const lp1 = await g.probeLocalTia(null, { refresh: true });
      const lp2 = await g.probeLocalTia(null);
      record(
        'probeLocalTia 零进程探测 (V20 存在 / TIAP12 排除 / 60s 缓存)',
        lp1.ok === true && lp1.installedMajors.includes(20) && !lp1.installedMajors.includes(12) && lp2.cached === true,
        lp1.installed.map((x) => x.version).join(',')
      );
    }

    /* ================================================================ */
    /* 2. 真实 d.config.json 协议层 + 零拉起诊断 + 真 B 离线/干跑校验    */
    /*    （严禁碰默认 8000 端口 / PID 19756）                             */
    /* ================================================================ */
    const c = makeClient('test');
    const init = await c.init();
    record('initialize', init.result && init.result.serverInfo.name === 'tia-gateway-d', init.result && init.result.serverInfo.version);

    const tools = await c.rpc('tools/list', {});
    const names = (tools.result.tools || []).map((t) => t.name);
    record('tools/list 数量 = 15', names.length === 15, names.join(','));
    record(
      '关键工具齐全',
      ['d_status', 'd_call', 'd_connect', 'd_write_block', 'd_read_block', 'd_doctor', 'd_finish'].every((n) => names.includes(n)),
      ''
    );

    const st = parse(await c.call('d_status'));
    record(
      'd_status 含 lock / pendingRecovery 字段',
      !!st && Array.isArray(st.upstreams) && st.upstreams.length === 3 && 'lock' in st && 'pendingRecovery' in st,
      'active=' + (st && st.active)
    );

    const doc = parse(await c.call('d_doctor'));
    const port8000Chk = doc && Array.isArray(doc.checks) && doc.checks.find((x) => x.name === 'port-8000');
    const pendingChk = doc && Array.isArray(doc.checks) && doc.checks.find((x) => x.name === 'pending-recovery');
    const validPortStatuses = new Set(['free', 'own_managed', 'own_orphan', 'foreign_mcp', 'foreign_non_mcp', 'excluded_by_os']);
    record(
      'd_doctor 默认零拉起模式含合法 port-8000 与 pending-recovery 检查',
      !!doc &&
        doc.mode === 'fast' &&
        !!port8000Chk &&
        validPortStatuses.has(port8000Chk.status) &&
        !!pendingChk &&
        pendingChk.ok === true,
      port8000Chk ? `port-8000=${port8000Chk.status}` : ''
    );

    const ver = parse(await c.call('d_versions'));
    record(
      'd_versions 零进程探测到 V20',
      !!ver && ver.source === 'local-zero-process' && (ver.installed || []).some((v) => /^(?:V)?20/.test(String(v))),
      ver && ver.installed && ver.installed.join(',')
    );

    const lt = parse(await c.call('d_list_tools', { server: 'b', filter: 'compile', limit: 5 }));
    record('d_list_tools(b) 同时查 lite 与全量', !!lt && lt.totalMatched > 0 && !!lt.fullRoster, lt && `lite 匹配 ${lt.totalMatched}`);

    const b1 = parse(await c.call('d_call', { server: 'b', tool: 'Bootstrap', arguments: {} }));
    record(
      'd_call(b,Bootstrap)',
      !!b1 && b1.ready === true,
      b1 && `tia=${b1.environment && b1.environment.tiaVersionDetected} group=${b1.environment && b1.environment.opennessGroupOk}`
    );

    const st2 = parse(await c.call('d_status'));
    const bUp = st2 && st2.upstreams.find((u) => u.server === 'b');
    record('切换后 active=b 且 b 已启动 (lite 65)', !!st2 && st2.active === 'b' && bUp.started && bUp.tools === 65, bUp && `tools=${bUp.tools}`);

    const l2 = await c.call('d_call', { server: 'b', tool: 'GetPlcExternalSources', arguments: { softwarePath: 'PLC' } }, 300000);
    const l2Text = text(l2);
    record('d_call 能触达 B 的非 lite 工具', !/没有工具|未找到工具/.test(l2Text), l2Text.replace(/\n/g, ' ').slice(0, 100));

    // 真 B 离线干跑与编码校验
    const dry = parse(
      await c.call('d_write_block', {
        block: 'FC_测试块',
        format: 'scl',
        content: 'FUNCTION "FC_测试块" : Void\n// 中文注释\nBEGIN\nEND_FUNCTION',
        plc: 'PLC',
      })
    );
    record('d_write_block 只出计划不写入', !!dry && Array.isArray(dry.plan) && dry.plan.length > 0 && !dry.executed, dry && `plan=${dry.plan.length}`);
    const prepared = dry && dry.prepared;
    record('含中文 .scl 自动加 BOM', !!prepared && prepared.bom === true, prepared && prepared.path);

    let bomOk = false;
    if (prepared && prepared.path) {
      const buf = fs.readFileSync(prepared.path);
      bomOk = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
    }
    record('落盘文件首字节是 BOM', bomOk, '');

    const ascii = parse(
      await c.call('d_write_block', {
        block: 'FC_AsciiOnly',
        format: 'scl',
        content: 'FUNCTION "FC_AsciiOnly" : Void\nBEGIN\nEND_FUNCTION',
      })
    );
    record('纯 ASCII .scl 不加 BOM', !!ascii && ascii.prepared && ascii.prepared.bom === false, ascii && ascii.prepared.path);

    const s7 = parse(
      await c.call('d_write_block', { block: 'FB_Lad', format: 's7dcl', content: 'FUNCTION_BLOCK "FB_Lad"\nBEGIN\nEND_FUNCTION_BLOCK', plc: 'PLC' })
    );
    record('s7dcl 未给 res_content 时提示 .s7res', !!s7 && typeof s7.note === 'string' && s7.note.includes('.s7res'), '');
    record(
      's7dcl 计划走 ImportFromDocuments(Override)',
      !!s7 && s7.plan[0].tool === 'ImportFromDocuments' && s7.plan[0].arguments.importOption === 'Override',
      ''
    );

    const grp = parse(
      await c.call('d_write_block', {
        block: 'FC_Grp',
        format: 'scl',
        content: 'FUNCTION "FC_Grp" : Void\nBEGIN\n\t;\nEND_FUNCTION',
        plc: 'PLC',
        group: '程序块/工位A/子功能',
      })
    );
    const imp = grp && grp.plan.find((s) => s.tool === 'ImportPlcExternalSource');
    const mov = grp && grp.plan.find((s) => s.tool === 'MoveBlockToGroup');
    record('B+SCL+group：外部源 groupPath 固定为空', !!imp && imp.arguments.groupPath === '', '');
    record(
      'B+SCL+group：末尾插入 MoveBlockToGroup 且目标组已剥前缀',
      !!mov && mov.arguments.targetGroupPath === '工位A/子功能' && mov.arguments.autoCreateGroup === true,
      mov ? mov.arguments.targetGroupPath : 'no move'
    );
    const cmpi = grp && grp.plan.findIndex((s) => s.tool === 'CompileAndDiagnosePlc');
    const movi = grp && grp.plan.findIndex((s) => s.tool === 'MoveBlockToGroup');
    record('B+SCL+group：CompileAndDiagnosePlc 在 MoveBlockToGroup 之前', cmpi > -1 && movi > -1 && cmpi < movi, `compile@${cmpi} move@${movi}`);

    const obRes = await c.call('d_write_block', {
      block: 'OB1',
      format: 'scl',
      content: 'ORGANIZATION_BLOCK "Main"\nBEGIN\nEND_ORGANIZATION_BLOCK',
      plc: 'PLC',
    });
    record(
      'B 上 .scl 写 OB1 被拒并给出替代',
      !!(obRes.result && obRes.result.isError) && /OB1|不能/.test(text(obRes)),
      ''
    );

    const s7NoOv = parse(
      await c.call('d_write_block', {
        block: 'FB_NoOv',
        format: 's7dcl',
        content: 'FUNCTION_BLOCK "FB_NoOv"\nBEGIN\nEND_FUNCTION_BLOCK',
        overwrite: false,
        plc: 'PLC',
      })
    );
    record('s7dcl overwrite:false → importOption=None', !!s7NoOv && s7NoOv.plan[0].arguments.importOption === 'None', '');

    const srcPairDir = fs.mkdtempSync(path.join(RUNTIME, 's7pair-'));
    const s7dclPath = path.join(srcPairDir, 'FB_Pair.s7dcl');
    const s7resPath = path.join(srcPairDir, 'FB_Pair.s7res');
    fs.writeFileSync(s7dclPath, '\uFEFFFUNCTION_BLOCK "FB_Pair"\nBEGIN\nEND_FUNCTION_BLOCK', 'utf8');
    fs.writeFileSync(s7resPath, '\uFEFFResources:\n  - id: title\n    en-US: Pair\n', 'utf8');
    const s7Auto = parse(await c.call('d_write_block', { block: 'FB_Pair', format: 's7dcl', source_path: s7dclPath, plc: 'PLC' }));
    record(
      's7dcl source_path 自动加载同目录 .s7res（且带单次 BOM）',
      !!s7Auto &&
        !!s7Auto.resAutoLoadedFrom &&
        !!s7Auto.resFile &&
        s7Auto.resFile.bom === true &&
        fs.readFileSync(s7Auto.resFile.path, 'utf8').charCodeAt(0) === 0xfeff &&
        fs.readFileSync(s7Auto.resFile.path, 'utf8').charCodeAt(1) !== 0xfeff,
      ''
    );

    const xmlFb = parse(
      await c.call('d_write_block', {
        block: 'FB_XmlTest',
        format: 'xml',
        group: '程序块/工艺',
        content: '<Document><SW.Blocks.FB ID="0"><AttributeList><Name>FB_XmlTest</Name></AttributeList></SW.Blocks.FB></Document>',
        plc: 'PLC',
      })
    );
    const xmlUdt = parse(
      await c.call('d_write_block', {
        block: 'UDT_XmlTest',
        format: 'xml',
        content: '<Document><SW.Types.PlcStruct ID="0"><AttributeList><Name>UDT_XmlTest</Name></AttributeList></SW.Types.PlcStruct></Document>',
        plc: 'PLC',
      })
    );
    record(
      'B 上 XML 计划：FB→ImportBlock，UDT→ImportType',
      !!xmlFb && xmlFb.plan[0].tool === 'ImportBlock' && xmlFb.plan[0].arguments.groupPath === '工艺' && !!xmlUdt && xmlUdt.plan[0].tool === 'ImportType',
      ''
    );

    const splitWrite = parse(
      await c.call('d_write_block', {
        block: '工位B/传送带/FC_Conveyor',
        format: 'scl',
        content: 'FUNCTION "FC_Conveyor" : Void\nBEGIN\n\t;\nEND_FUNCTION',
        plc: 'PLC',
      })
    );
    const splitMov = splitWrite && splitWrite.plan.find((s) => s.tool === 'MoveBlockToGroup');
    record(
      'block 带斜杠自动拆分 group（MoveBlockToGroup）',
      !!splitMov && splitMov.arguments.blockName === 'FC_Conveyor' && splitMov.arguments.targetGroupPath === '工位B/传送带',
      ''
    );

    const conflictRes = await c.call('d_connect', { version: '16', project_file_path: 'C:\\proj\\line.ap20' });
    record('d_connect 版本冲突显式拒绝', !!(conflictRes.result && conflictRes.result.isError) && /版本冲突/.test(text(conflictRes)), '');

    const statusNow = parse(await c.call('d_status', {}));
    record(
      'd_status 含 lock.stale 与 upstreams[].managed/external',
      !!statusNow &&
        !!statusNow.lock &&
        typeof statusNow.lock.stale === 'boolean' &&
        Array.isArray(statusNow.upstreams) &&
        statusNow.upstreams.every((u) => typeof u.managed === 'boolean' && typeof u.external === 'boolean'),
      ''
    );
    record('审计日志已写入隔离 runtime/d.log', fs.existsSync(path.join(RUNTIME, 'd.log')), '');
    await closeClient(c);

    /* ================================================================ */
    /* 3. Mock HTTP A (listen(0)) + Mock B：端口守卫 / 独占锁 / P0-2    */
    /* ================================================================ */
    const mockRuntime = fs.mkdtempSync(path.join(RUNTIME, 'mock-'));
    const mockBScript = path.join(mockRuntime, 'mock-b.js');
    fs.writeFileSync(mockBScript, buildMockBScriptSource(), 'utf8');

    const mockHttpA = await createMockStreamableHttpA();
    const mockNonMcp = await listenMockHttp((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('plain server');
    });

    const cfgAdoptAB = path.join(mockRuntime, 'cfg-adopt-ab.json');
    fs.writeFileSync(
      cfgAdoptAB,
      JSON.stringify({
        defaultVersion: '20',
        upstreams: {
          a: { label: 'Mock A Adopt', kind: 'http', url: mockHttpA.url, adoptExternal: true },
          b: { label: 'Mock B', kind: 'stdio', byVersion: { '20': { command: NODE, args: [mockBScript] } } },
        },
      }),
      'utf8'
    );
    const cfgStrictAB = path.join(mockRuntime, 'cfg-strict-ab.json');
    fs.writeFileSync(
      cfgStrictAB,
      JSON.stringify({
        defaultVersion: '20',
        upstreams: {
          a: { label: 'Mock A Strict', kind: 'http', url: mockHttpA.url },
          b: { label: 'Mock B', kind: 'stdio', byVersion: { '20': { command: NODE, args: [mockBScript] } } },
        },
      }),
      'utf8'
    );
    const cfgNonMcpA = path.join(mockRuntime, 'cfg-nonmcp-a.json');
    fs.writeFileSync(
      cfgNonMcpA,
      JSON.stringify({
        defaultVersion: '20',
        upstreams: {
          a: { label: 'NonMcp A', kind: 'http', url: mockNonMcp.url },
          b: { label: 'Mock B', kind: 'stdio', byVersion: { '20': { command: NODE, args: [mockBScript] } } },
        },
      }),
      'utf8'
    );
    const cfgMockBOnly = path.join(mockRuntime, 'cfg-b-only.json');
    fs.writeFileSync(
      cfgMockBOnly,
      JSON.stringify({
        defaultVersion: '20',
        upstreams: {
          b: { label: 'Mock B', kind: 'stdio', byVersion: { '20': { command: NODE, args: [mockBScript] } } },
        },
      }),
      'utf8'
    );

    // 3a. P1-1 fail-closed & 非 MCP <2s 快失败（用 listen(0) Mock 端口，绝不碰 8000）
    const rtGuard = fs.mkdtempSync(path.join(mockRuntime, 'rt-guard-'));
    const gStrict = makeClient('guard-strict', { D_RUNTIME_DIR: rtGuard, D_GATEWAY_CONFIG: cfgStrictAB });
    await gStrict.init();
    const resStrictA = await gStrict.call('d_call', { server: 'a', tool: 'get_tia_status', arguments: {} });
    const docStrict = parse(await gStrict.call('d_doctor', { with_server_info: true }));
    const pChkStrict = docStrict && docStrict.checks.find((x) => x.name === 'port-8000');
    record(
      'P1-1 foreign_mcp 默认 fail-closed 拒接且 d_doctor 配对 DELETE 清理 session',
      !!(resStrictA.result && resStrictA.result.isError) &&
        /fail-closed 拒绝静默接管/.test(text(resStrictA)) &&
        !!pChkStrict &&
        pChkStrict.status === 'foreign_mcp' &&
        mockHttpA.stats.deletedSessions.length >= 1,
      pChkStrict ? pChkStrict.status : ''
    );
    await closeClient(gStrict);

    const rtNon = fs.mkdtempSync(path.join(mockRuntime, 'rt-nonmcp-'));
    const gNon = makeClient('guard-nonmcp', { D_RUNTIME_DIR: rtNon, D_GATEWAY_CONFIG: cfgNonMcpA });
    await gNon.init();
    const tNon0 = Date.now();
    const resNon = await gNon.call('d_call', { server: 'a', tool: 'get_tia_status', arguments: {} });
    const dtNon = Date.now() - tNon0;
    record(
      'P1-1 foreign_non_mcp 在 <2s 内快失败并带出 PID',
      !!(resNon.result && resNon.result.isError) && /非 MCP 进程占用/.test(text(resNon)) && dtNon < 2500,
      `${dtNon}ms`
    );
    await closeClient(gNon);

    // 3b. adoptExternal Mock A d_call + 跨进程独占锁（替代原 8000 端口 c2/c3/c4）
    const rtLock = fs.mkdtempSync(path.join(mockRuntime, 'rt-lock-'));
    const c2 = makeClient('lock-holder', { D_RUNTIME_DIR: rtLock, D_GATEWAY_CONFIG: cfgAdoptAB });
    await c2.init();
    const aMockRes = parse(await c2.call('d_call', { server: 'a', tool: 'get_tia_status', arguments: {} }));
    const stAdopt = parse(await c2.call('d_status', {}));
    const aRow = stAdopt && stAdopt.upstreams.find((u) => u.server === 'a');
    record(
      'Mock HTTP A (adoptExternal:true) d_call 成功且标记 external=true',
      !!aMockRes && aMockRes.ok === true && !!aRow && aRow.external === true && aRow.managed === false,
      ''
    );

    const c3 = makeClient('intruder-other', { D_RUNTIME_DIR: rtLock, D_GATEWAY_CONFIG: cfgAdoptAB });
    await c3.init();
    const intrOther = text(await c3.call('d_call', { server: 'b', tool: 'Bootstrap', arguments: {} }));
    record('锁拦住「不同上游」的第二个宿主（Mock A/B 隔离）', /另一个网关实例|占用 TIA/.test(intrOther), intrOther.slice(0, 90));

    const c4 = makeClient('intruder-same', { D_RUNTIME_DIR: rtLock, D_GATEWAY_CONFIG: cfgAdoptAB });
    await c4.init();
    const intrSame = text(await c4.call('d_call', { server: 'a', tool: 'get_tia_status', arguments: {} }));
    record('锁拦住「同一上游」的第二个宿主（Mock A 隔离）', /另一个网关实例|占用 TIA/.test(intrSame), intrSame.slice(0, 90));

    // F11: 并发抢锁 d_connect 也绝不能误删 c2 的锁
    const cRace = makeClient('intruder-connect', { D_RUNTIME_DIR: rtLock, D_GATEWAY_CONFIG: cfgAdoptAB });
    await cRace.init();
    const raceRes = await cRace.call('d_connect', { version: '20' });
    const holderSt = parse(await c2.call('d_status', {}));
    record(
      'F11 并发 d_connect 抢锁失败不破坏持锁者 active.lock',
      !!(raceRes.result && raceRes.result.isError) && !!holderSt && holderSt.lock && holderSt.lock.mine === true,
      ''
    );

    await closeClient(c4);
    await closeClient(c3);
    await closeClient(cRace);

    // 验证 external Mock A 在宿主失锁后重置 ready/active 但绝不误杀外部进程
    const rtLockFile = path.join(rtLock, 'active.lock');
    fs.writeFileSync(
      rtLockFile,
      JSON.stringify({ pid: process.pid, host: 'smoke-test', server: 'b', acquiredAt: new Date().toISOString(), ts: Date.now() }),
      'utf8'
    );
    const saveAfterLoss = await c2.call('d_save', {});
    const stAfterLoss = parse(await c2.call('d_status', {}));
    const aRowAfterLoss = stAfterLoss && stAfterLoss.upstreams.find((u) => u.server === 'a');
    record(
      'external Mock A 失锁时通过 onLockLost 重置 ready/active 且存活不误杀',
      !!(saveAfterLoss.result && saveAfterLoss.result.isError) &&
        /当前独占锁已被.*接管|失去独占锁/.test(text(saveAfterLoss)) &&
        stAfterLoss.active === null &&
        !!aRowAfterLoss &&
        aRowAfterLoss.started === false,
      ''
    );

    await closeClient(c2);
    // 验证 external Mock A 服务未被 gateway 退出误杀
    const postKillProbe = await g.probePort8000(mockHttpA.url, null);
    record('external Mock A 在宿主关闭后仍存活（绝不误杀外部服务）', postKillProbe.open === true, '');

    // 3c. P0-2 B->A 回退保锁 vs OpenProject 后禁回退 vs fallback:false vs 双失败清理
    mockHttpA.stats.calls.length = 0;
    const rtFb = fs.mkdtempSync(path.join(mockRuntime, 'rt-fb-'));
    const mFb = makeClient('mock-fb', { D_RUNTIME_DIR: rtFb, D_GATEWAY_CONFIG: cfgAdoptAB, MOCK_MODE: 'connect-infra-fail' });
    await mFb.init();
    const fbRes = parse(await mFb.call('d_connect', { version: '20', project_file_path: 'C:\\proj\\line.ap20' }));
    const fbSt = parse(await mFb.call('d_status', {}));
    record(
      'P0-2 B Connect 基础设施故障保锁回退到 A（routedTo=a, fallbackFrom=b）',
      !!fbRes &&
        fbRes.routedTo === 'a' &&
        fbRes.fallbackFrom === 'b' &&
        typeof fbRes.capabilityNote === 'string' &&
        !!fbSt &&
        fbSt.active === 'a' &&
        !!fbSt.lock &&
        fbSt.lock.server === 'a' &&
        fbSt.upstreams.find((u) => u.server === 'b').managed === false,
      fbRes ? `routed=${fbRes.routedTo} from=${fbRes.fallbackFrom}` : ''
    );
    await closeClient(mFb);

    mockHttpA.stats.calls.length = 0;
    const rtNoFbOpen = fs.mkdtempSync(path.join(mockRuntime, 'rt-openfail-'));
    const mOpenFail = makeClient('mock-open-fail', { D_RUNTIME_DIR: rtNoFbOpen, D_GATEWAY_CONFIG: cfgAdoptAB, MOCK_MODE: 'open-fail' });
    await mOpenFail.init();
    const openFailRes = await mOpenFail.call('d_connect', { version: '20', project_file_path: 'C:\\proj\\missing.ap20' });
    const openFailSt = parse(await mOpenFail.call('d_status', {}));
    const aConnectCalls = mockHttpA.stats.calls.filter((x) => x.name === 'connect_tia').length;
    record(
      'P0-2 B 进入 OpenProject 后失败严禁回退 A 并清锁停子进程',
      !!(openFailRes.result && openFailRes.result.isError) &&
        aConnectCalls === 0 &&
        openFailSt.active === null &&
        openFailSt.lock === null &&
        openFailSt.upstreams.find((u) => u.server === 'b').managed === false,
      `aConnectCalls=${aConnectCalls}`
    );
    await closeClient(mOpenFail);

    mockHttpA.stats.calls.length = 0;
    const rtFbOff = fs.mkdtempSync(path.join(mockRuntime, 'rt-fboff-'));
    const mFbOff = makeClient('mock-fboff', { D_RUNTIME_DIR: rtFbOff, D_GATEWAY_CONFIG: cfgAdoptAB, MOCK_MODE: 'connect-infra-fail' });
    await mFbOff.init();
    const fbOffRes = await mFbOff.call('d_connect', { version: '20', fallback: false });
    const fbOffSt = parse(await mFbOff.call('d_status', {}));
    record(
      'P0-2 d_connect fallback:false 禁止回退并释放锁',
      !!(fbOffRes.result && fbOffRes.result.isError) &&
        mockHttpA.stats.calls.filter((x) => x.name === 'connect_tia').length === 0 &&
        fbOffSt.active === null &&
        fbOffSt.lock === null,
      ''
    );
    await closeClient(mFbOff);

    // 3d. 原 Mock B 黑盒基础测试（connect-fail / 并发排队 / d_download / offline-fail）
    const rtBasic = fs.mkdtempSync(path.join(mockRuntime, 'rt-basic-'));
    const mFail = makeClient('mock-conn-fail', { D_RUNTIME_DIR: rtBasic, D_GATEWAY_CONFIG: cfgMockBOnly, MOCK_MODE: 'connect-fail' });
    await mFail.init();
    const badConn = await mFail.call('d_connect', { version: '20' });
    const statusAfterBad = parse(await mFail.call('d_status', {}));
    record(
      'd_connect Connect 失败时返回 isError 且清空 active/lock',
      !!(badConn.result && badConn.result.isError) && statusAfterBad.active === null && statusAfterBad.lock === null,
      ''
    );
    await closeClient(mFail);

    const basicLog = path.join(mockRuntime, 'basic-calls.jsonl');
    const mOk = makeClient('mock-ok', { D_RUNTIME_DIR: rtBasic, D_GATEWAY_CONFIG: cfgMockBOnly, MOCK_LOG: basicLog, MOCK_MODE: 'normal' });
    await mOk.init();
    await mOk.call('d_connect', { version: '20' });

    const [r1, r2] = await Promise.all([
      mOk.call('d_call', { server: 'b', tool: 'PingSlow', arguments: { seq: 1 } }),
      mOk.call('d_call', { server: 'b', tool: 'PingSlow', arguments: { seq: 2 } }),
    ]);
    const slowEvents = fs
      .readFileSync(basicLog, 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l))
      .filter((e) => e.name === 'PingSlow')
      .map((e) => `${e.phase}:${e.args.seq}`);
    record(
      '同进程并发 tools/call 严格串行排队（FIFO 无交织）',
      parse(r1).seq === 1 && parse(r2).seq === 2 && slowEvents.join(',') === 'start:1,end:1,start:2,end:2',
      slowEvents.join(',')
    );

    const dlRes = parse(
      await mOk.call('d_download', {
        pc_interface_name: 'Realtek',
        target_interface: '192.168.0.1',
        allow_cpu_stop: false,
        start_cpu_after_download: false,
        confirm: true,
      })
    );
    const dlPayload = dlRes && JSON.parse(dlRes.download);
    record(
      'd_download 向 B 转发 stopBeforeDownload / startAfterDownload',
      !!dlPayload && dlPayload.args.stopBeforeDownload === false && dlPayload.args.startAfterDownload === false,
      ''
    );

    const rbS7 = parse(await mOk.call('d_read_block', { block: 'FB1', format: 's7dcl' }));
    const rbXml = parse(await mOk.call('d_read_block', { block: 'FB1', format: 'xml' }));
    record(
      'd_read_block 在 B 上支持 format=s7dcl（含 .s7res）与 format=xml',
      !!rbS7 && rbS7.files.some((f) => f.name === 'FB1.s7dcl') && rbS7.files.some((f) => f.name === 'FB1.s7res') && !!rbXml && rbXml.files.some((f) => f.name === 'FB1.xml'),
      ''
    );
    await closeClient(mOk);

    const rtOff = fs.mkdtempSync(path.join(mockRuntime, 'rt-off-'));
    const mockOffLog = path.join(mockRuntime, 'off-calls.jsonl');
    const mOff = makeClient('mock-off-fail', { D_RUNTIME_DIR: rtOff, D_GATEWAY_CONFIG: cfgMockBOnly, MOCK_LOG: mockOffLog, MOCK_MODE: 'offline-fail' });
    await mOff.init();
    await mOff.call('d_connect', { version: '20' });
    const finRes = parse(await mOff.call('d_finish', {}));
    const finCalls = fs
      .readFileSync(mockOffLog, 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l))
      .map((e) => e.name);
    record(
      'd_finish 在 offline 失败时中止（不触发编译与保存）',
      !!finRes && finRes.finished === false && !finCalls.includes('CompileAndDiagnosePlc') && !finCalls.includes('SaveProject'),
      finCalls.join(',')
    );
    await closeClient(mOff);

    /* ================================================================ */
    /* 4. 完整 F1–F14 Mock B 故障注入矩阵 + pending_recovery 闭环       */
    /* ================================================================ */
    const rtFault = fs.mkdtempSync(path.join(mockRuntime, 'rt-fault-'));
    const faultLog = path.join(mockRuntime, 'fault-calls.jsonl');
    const ctlFile = path.join(mockRuntime, 'fault-ctl.json');
    const setCtl = (obj) => fs.writeFileSync(ctlFile, JSON.stringify(obj), 'utf8');
    const readNewCalls = (fromLine) => {
      if (!fs.existsSync(faultLog)) return [];
      const lines = fs.readFileSync(faultLog, 'utf8').trim().split('\n').filter(Boolean);
      return lines.slice(fromLine).map((l) => JSON.parse(l));
    };
    const countCalls = () => (fs.existsSync(faultLog) ? fs.readFileSync(faultLog, 'utf8').trim().split('\n').filter(Boolean).length : 0);

    const defaultHierarchy = {
      root: {
        name: 'Program blocks',
        blocks: [{ name: 'Main', typeName: 'OB' }],
        groups: [
          {
            name: '工位A',
            blocks: [
              { name: 'FB_Target', isConsistent: true, attributes: { Number: 12, AutoNumber: false } },
              { name: 'FB_Inconsistent', isConsistent: false, attributes: { Number: 22, AutoNumber: true } },
            ],
            groups: [{ name: '子组1', blocks: [{ name: 'FB_Sub', isConsistent: true }] }],
          },
          { name: '工位B', blocks: [{ name: 'FB_Dup', isConsistent: true }] },
          { name: '工位C', blocks: [{ name: 'FB_Dup', isConsistent: true }] },
        ],
      },
    };
    setCtl({ hierarchy: defaultHierarchy });

    const mFault = makeClient('mock-fault', {
      D_RUNTIME_DIR: rtFault,
      D_GATEWAY_CONFIG: cfgMockBOnly,
      MOCK_LOG: faultLog,
      MOCK_CTL: ctlFile,
      MOCK_MODE: 'normal',
    });
    await mFault.init();
    await mFault.call('d_connect', { version: '20' });

    const SCL_TARGET = 'FUNCTION_BLOCK "FB_Target"\nBEGIN\n\t;\nEND_FUNCTION_BLOCK';

    // F1: GenerateBlocksFromExternalSource 失败 -> ExportBlock 备份 + Delete 残片 + ImportBlock 原组回滚
    setCtl({
      hierarchy: defaultHierarchy,
      blockInfo: { isConsistent: true, typeName: 'FB', attributes: { Number: 12, AutoNumber: false } },
      failTools: { GenerateBlocksFromExternalSource: 'SCL syntax error at line 3' },
    });
    const f1Mark = countCalls();
    const f1Res = await mFault.call('d_write_block', { block: 'FB_Target', format: 'scl', content: SCL_TARGET, confirm: true });
    const f1Body = parse(f1Res);
    const f1Calls = readNewCalls(f1Mark).filter((e) => e.phase === 'start').map((e) => e.name);
    record(
      'F1 GenerateBlocks 失败触发 XML 备份并回滚至原组工位A',
      !!(f1Res.result && f1Res.result.isError) &&
        f1Body.executed === false &&
        f1Body.failedStep === 'GenerateBlocksFromExternalSource' &&
        f1Body.backup.status === 'created' &&
        fs.existsSync(f1Body.backup.path) &&
        f1Body.rollback.ok === true &&
        f1Body.rollback.state === 'restored' &&
        f1Body.rollback.restoredGroup === '工位A' &&
        f1Calls.includes('ExportBlock') &&
        f1Calls.includes('ImportBlock'),
      `state=${f1Body && f1Body.rollback && f1Body.rollback.state}`
    );

    // F2 + F12: CompileAndDiagnosePlc 返回 State=Success + ErrorCount=2 + Errors=[] -> 拦截并回滚；另测 keep 与 foreignErrors 放行
    setCtl({
      hierarchy: defaultHierarchy,
      blockInfo: { isConsistent: true, typeName: 'FB', attributes: { Number: 12, AutoNumber: false } },
      compileResult: { State: 'Success', ErrorCount: 2, Errors: [] },
    });
    const f2Res = await mFault.call('d_write_block', { block: 'FB_Target', format: 'scl', content: SCL_TARGET, confirm: true });
    const f2Body = parse(f2Res);
    record(
      'F2+F12 CompileAndDiagnosePlc ErrorCount=2 空详情拦截并自动回滚',
      !!(f2Res.result && f2Res.result.isError) &&
        f2Body.failedStep === 'CompileAndDiagnosePlc' &&
        f2Body.rollback.ok === true &&
        f2Body.rollback.state === 'restored',
      ''
    );

    // F2 keep + foreignErrors 隔离
    const f2KeepRes = await mFault.call('d_write_block', {
      block: 'FB_Target',
      format: 'scl',
      content: SCL_TARGET,
      on_compile_error: 'keep',
      confirm: true,
    });
    const f2KeepBody = parse(f2KeepRes);
    record(
      'F2b on_compile_error=keep 保留失败新块于根目录且不回滚',
      !!(f2KeepRes.result && f2KeepRes.result.isError) &&
        f2KeepBody.residueAt === '<root>' &&
        f2KeepBody.rollback.state === 'skipped_on_compile_error_keep',
      ''
    );

    setCtl({
      hierarchy: defaultHierarchy,
      blockInfo: { isConsistent: true, typeName: 'FB', attributes: { Number: 12, AutoNumber: false } },
      compileResult: { State: 'Error', ErrorCount: 1, Errors: [{ Path: '工位B/OtherFB', Message: 'other err' }], Meta: { diagnosticsComplete: true } },
    });
    const fForeignOk = await mFault.call('d_write_block', { block: 'FB_Target', format: 'scl', content: SCL_TARGET, confirm: true });
    const fForeignBody = parse(fForeignOk);
    record(
      'F12b 仅存在其他块 foreignErrors 时隔离放行并成功写入',
      !(fForeignOk.result && fForeignOk.result.isError) &&
        fForeignBody.executed === true &&
        fForeignBody.compileDiagnostics.foreignErrors.length === 1,
      ''
    );

    // F3: MoveBlockToGroup 失败 -> 清残片并回滚
    setCtl({
      hierarchy: defaultHierarchy,
      blockInfo: { isConsistent: true, typeName: 'FB', attributes: { Number: 12, AutoNumber: false } },
      failTools: { MoveBlockToGroup: 'Group move error' },
    });
    const f3Res = await mFault.call('d_write_block', { block: 'FB_Target', format: 'scl', content: SCL_TARGET, confirm: true });
    const f3Body = parse(f3Res);
    record(
      'F3 MoveBlockToGroup 失败触发清残片并回滚至原组',
      !!(f3Res.result && f3Res.result.isError) && f3Body.failedStep === 'MoveBlockToGroup' && f3Body.rollback.ok === true,
      ''
    );

    // F4: 顶层块声明名与参数 block 不一致 -> preflight 阻断，零破坏调用
    const f4Mark = countCalls();
    const f4Res = await mFault.call('d_write_block', {
      block: 'FB_Target',
      format: 'scl',
      content: 'FUNCTION_BLOCK "FB_WrongName"\nBEGIN\n\t;\nEND_FUNCTION_BLOCK',
      confirm: true,
    });
    const f4Calls = readNewCalls(f4Mark);
    record('F4 SCL 声明块名不匹配在 preflight 零调用阻断', !!(f4Res.result && f4Res.result.isError) && f4Calls.length === 0, '');

    // F5a: 原组失败 -> CreatePlcBlockGroup 失败 -> 降级根目录 restored_to_root
    setCtl({
      hierarchy: defaultHierarchy,
      blockInfo: { isConsistent: true, typeName: 'FB', attributes: { Number: 12, AutoNumber: false } },
      failTools: { GenerateBlocksFromExternalSource: 'gen err', CreatePlcBlockGroup: 'cannot create group' },
      failImportByGroup: { '工位A': 'group not found' },
    });
    const f5aRes = await mFault.call('d_write_block', { block: 'FB_Target', format: 'scl', content: SCL_TARGET, confirm: true });
    const f5aBody = parse(f5aRes);
    record(
      'F5a 原组缺失且建组失败时降级 ImportBlock 到根目录 (restored_to_root)',
      !!(f5aRes.result && f5aRes.result.isError) &&
        f5aBody.rollback.ok === true &&
        f5aBody.rollback.state === 'restored_to_root' &&
        f5aBody.rollback.restoredGroup === '',
      ''
    );

    // F5b: 双回滚 ImportBlock 全失败 -> pending_recovery.json 落盘 -> 阻断 d_save/d_finish -> 重写成功自愈
    setCtl({
      hierarchy: defaultHierarchy,
      blockInfo: { isConsistent: true, typeName: 'FB', attributes: { Number: 12, AutoNumber: false } },
      failTools: { GenerateBlocksFromExternalSource: 'gen err', ImportBlock: 'import crashed' },
    });
    const f5bRes = await mFault.call('d_write_block', { block: 'FB_Target', format: 'scl', content: SCL_TARGET, confirm: true });
    const f5bBody = parse(f5bRes);
    const pendingPath = path.join(rtFault, 'pending_recovery.json');
    const stPending = parse(await mFault.call('d_status', {}));
    const saveBlocked = await mFault.call('d_save', {});
    const finBlocked = await mFault.call('d_finish', {});
    const saveForced = await mFault.call('d_save', { allow_dirty_save: true });
    record(
      'F5b 双重回滚失败落盘 pending_recovery.json 并阻断 d_save / d_finish（allow_dirty_save 可绕过）',
      !!(f5bRes.result && f5bRes.result.isError) &&
        f5bBody.rollback.ok === false &&
        !!f5bBody.rollback.manualRecovery &&
        fs.existsSync(pendingPath) &&
        !!stPending.pendingRecovery &&
        !!(saveBlocked.result && saveBlocked.result.isError) &&
        !!(finBlocked.result && finBlocked.result.isError) &&
        !(saveForced.result && saveForced.result.isError),
      ''
    );

    // 同块重写成功自动清除 pending_recovery.json
    setCtl({ hierarchy: defaultHierarchy, blockInfo: { isConsistent: true } });
    const healRes = await mFault.call('d_write_block', { block: 'FB_Target', format: 'scl', content: SCL_TARGET, confirm: true });
    const stHealed = parse(await mFault.call('d_status', {}));
    record(
      'F5c 同块 d_write_block 成功覆盖后自动清除 pending_recovery.json',
      !(healRes.result && healRes.result.isError) && !fs.existsSync(pendingPath) && stHealed.pendingRecovery === null,
      ''
    );

    // corrupt pending_recovery.json 绝不被无关或同块成功写入误清，仍阻断 d_save，直到显式清除
    fs.writeFileSync(pendingPath, '{"broken":', 'utf8');
    await mFault.call('d_write_block', { block: 'FB_Target', format: 'scl', content: SCL_TARGET, confirm: true });
    const pendingStaysAfterWrite = fs.existsSync(pendingPath);
    const stCorrupt = parse(await mFault.call('d_status', {}));
    const saveCorrupt = await mFault.call('d_save', {});
    const clrCorrupt = parse(await mFault.call('d_doctor', { clear_pending_recovery: true }));
    record(
      'F5d 损坏的 pending_recovery.json 不被写入误清且继续阻断 d_save（仅 d_doctor 可清标）',
      pendingStaysAfterWrite === true &&
        !!stCorrupt &&
        !!stCorrupt.pendingRecovery &&
        stCorrupt.pendingRecovery.corrupt === true &&
        !!(saveCorrupt.result && saveCorrupt.result.isError) &&
        !!clrCorrupt &&
        !!clrCorrupt.clearedPendingRecovery &&
        clrCorrupt.clearedPendingRecovery.cleared === true &&
        !fs.existsSync(pendingPath),
      ''
    );

    // F6: IsConsistent=false 默认阻断 + allow_unbacked_overwrite 放行
    setCtl({ hierarchy: defaultHierarchy, blockInfo: { isConsistent: false, typeName: 'FB' } });
    const f6Mark = countCalls();
    const f6Blocked = await mFault.call('d_write_block', { block: 'FB_Inconsistent', format: 'scl', content: 'FUNCTION_BLOCK "FB_Inconsistent"\nBEGIN\n\t;\nEND_FUNCTION_BLOCK', confirm: true });
    const f6BlockedBody = parse(f6Blocked);
    const f6DidDelete = readNewCalls(f6Mark).some((e) => e.name === 'DeletePlcBlock' && !e.args.dryRun);
    const f6Allow = await mFault.call('d_write_block', {
      block: 'FB_Inconsistent',
      format: 'scl',
      content: 'FUNCTION_BLOCK "FB_Inconsistent"\nBEGIN\n\t;\nEND_FUNCTION_BLOCK',
      allow_unbacked_overwrite: true,
      confirm: true,
    });
    const f6AllowBody = parse(f6Allow);
    record(
      'F6 !IsConsistent 默认 fail-closed 拒删，allow_unbacked_overwrite:true 可放行',
      !!(f6Blocked.result && f6Blocked.result.isError) &&
        f6BlockedBody.backup.status === 'blocked_inconsistent' &&
        f6DidDelete === false &&
        !(f6Allow.result && f6Allow.result.isError) &&
        f6AllowBody.backup.status === 'skipped_unbacked',
      ''
    );

    // F7: ExportBlock 导空文件 -> VerifyBackup 拦截在 DeletePlcBlock 之前
    setCtl({
      hierarchy: defaultHierarchy,
      blockInfo: { isConsistent: true },
      backupXmlOverride: '',
    });
    const f7Mark = countCalls();
    const f7Res = await mFault.call('d_write_block', { block: 'FB_Target', format: 'scl', content: SCL_TARGET, confirm: true });
    const f7Body = parse(f7Res);
    const f7DidDelete = readNewCalls(f7Mark).some((e) => e.name === 'DeletePlcBlock' && !e.args.dryRun);
    record(
      'F7 备份 XML 为空时 VerifyBackup 在 DeletePlcBlock 前中止',
      !!(f7Res.result && f7Res.result.isError) && f7Body.failedStep === 'VerifyBackup' && f7DidDelete === false,
      ''
    );

    // F8: DeletePlcBlock 失败且块仍在 -> 直接中止，不触发无效回滚
    setCtl({
      hierarchy: defaultHierarchy,
      blockInfo: { isConsistent: true },
      failTools: { DeletePlcBlock: 'block locked in online view' },
    });
    const f8Res = await mFault.call('d_write_block', { block: 'FB_Target', format: 'scl', content: SCL_TARGET, confirm: true });
    const f8Body = parse(f8Res);
    record(
      'F8 DeletePlcBlock 失败且旧块仍在时不误触发回滚',
      !!(f8Res.result && f8Res.result.isError) && f8Body.failedStep === 'DeletePlcBlock' && f8Body.rollback.attempted === false,
      ''
    );

    // F9: pinnedBlockNumber 干跑提示 + 回滚块号漂移检测
    setCtl({
      hierarchy: defaultHierarchy,
      blockInfo: { isConsistent: true, typeName: 'FB', attributes: { Number: 12, AutoNumber: false } },
      dryRunData: { pinnedBlockNumber: 12, crossReferenceAvailable: true, crossReferenceCount: 2 },
    });
    const f9Dry = parse(await mFault.call('d_write_block', { block: 'FB_Target', format: 'scl', content: SCL_TARGET }));
    // 第 1 次 GetBlockInfo (preflight) 返回 Number=12，第 2 次 GetBlockInfo (回滚后核查) 返回 Number=99
    setCtl({
      hierarchy: {
        root: {
          blocks: [],
          groups: [{ name: '工位A', blocks: [{ name: 'FB_Target', isConsistent: true, attributes: { Number: 12, AutoNumber: false } }] }],
        },
      },
      blockInfoSeqId: 'f9-number-drift',
      blockInfoSeq: [
        { isConsistent: true, typeName: 'FB', attributes: { Number: 12, AutoNumber: false } },
        { isConsistent: true, typeName: 'FB', attributes: { Number: 99, AutoNumber: false } },
      ],
      failTools: { GenerateBlocksFromExternalSource: 'gen err' },
    });
    const f9Rb = parse(await mFault.call('d_write_block', { block: 'FB_Target', format: 'scl', content: SCL_TARGET, confirm: true }));
    record(
      'F9 手动固定块号干跑提示与回滚块号漂移识别 (restored_number_mismatch)',
      !!f9Dry &&
        f9Dry.warnings.some((w) => w.includes('12')) &&
        !!f9Rb &&
        f9Rb.rollback.numberBefore === 12 &&
        f9Rb.rollback.numberAfter === 99 &&
        f9Rb.rollback.state === 'restored_number_mismatch',
      ''
    );

    // F13: d_read_block format=s7dcl 自动寻址子组 + 重名报错 + EngineeringNotSupportedException 默认/回退
    setCtl({ hierarchy: defaultHierarchy });
    const f13Sub = parse(await mFault.call('d_read_block', { block: 'FB_Sub', format: 's7dcl' }));
    const f13Dup = await mFault.call('d_read_block', { block: 'FB_Dup', format: 's7dcl' });
    setCtl({
      hierarchy: defaultHierarchy,
      failTools: { ExportAsDocuments: 'EngineeringNotSupportedException: SCL block cannot export to s7dcl' },
    });
    const f13NoFb = await mFault.call('d_read_block', { block: 'FB_Target', format: 's7dcl' });
    const f13WithFb = parse(await mFault.call('d_read_block', { block: 'FB_Target', format: 's7dcl', fallback_to_xml: true }));
    record(
      'F13 d_read_block(s7dcl) 自动子组定位 / 重名拦截 / EngineeringNotSupported 默认报错与 fallback_to_xml 回退',
      !!f13Sub &&
        f13Sub.blockPath === '工位A/子组1/FB_Sub' &&
        f13Sub.files.some((f) => f.name === 'FB_Sub.s7dcl') &&
        !!(f13Dup.result && f13Dup.result.isError) &&
        /重名/.test(text(f13Dup)) &&
        !!(f13NoFb.result && f13NoFb.result.isError) &&
        !!f13WithFb &&
        f13WithFb.format === 'xml' &&
        f13WithFb.requested_format === 's7dcl' &&
        f13WithFb.actual_format === 'xml' &&
        f13WithFb.fallback_used === true,
      ''
    );

    // F14: 单份多块 SCL 默认 confirm:true 阻断（零破坏性调用），allow_multi_block:true 放行
    setCtl({ hierarchy: defaultHierarchy, blockInfo: { isConsistent: true } });
    const SCL_MULTI =
      'FUNCTION_BLOCK "FB_Target"\nBEGIN\n\t;\nEND_FUNCTION_BLOCK\nFUNCTION "FC_Helper" : Void\nBEGIN\n\t;\nEND_FUNCTION';
    const f14Mark = countCalls();
    const f14Blk = await mFault.call('d_write_block', { block: 'FB_Target', format: 'scl', content: SCL_MULTI, confirm: true });
    const f14Calls = readNewCalls(f14Mark);
    const f14Mutating = f14Calls.some((e) =>
      ['ExportBlock', 'DeletePlcBlock', 'ImportPlcExternalSource', 'GenerateBlocksFromExternalSource', 'MoveBlockToGroup'].includes(e.name)
    );
    const f14Allow = await mFault.call('d_write_block', {
      block: 'FB_Target',
      format: 'scl',
      content: SCL_MULTI,
      allow_multi_block: true,
      confirm: true,
    });
    record(
      'F14 多块 SCL 文件 confirm:true 默认阻断（无破坏调用）且 allow_multi_block:true 放行',
      !!(f14Blk.result && f14Blk.result.isError) &&
        /多块顶层声明/.test(text(f14Blk)) &&
        !f14Mutating &&
        !(f14Allow.result && f14Allow.result.isError),
      ''
    );

    // F10: 事务中失锁 (DeletePlcBlock 阶段丢失 active.lock) -> aborted_lock_lost 并落盘 pending_recovery
    setCtl({
      hierarchy: defaultHierarchy,
      blockInfo: { isConsistent: true, typeName: 'FB', attributes: { Number: 12, AutoNumber: false } },
      deleteLockOnTool: 'DeletePlcBlock',
      lockPath: path.join(rtFault, 'active.lock'),
    });
    const f10Res = await mFault.call('d_write_block', { block: 'FB_Target', format: 'scl', content: SCL_TARGET, confirm: true });
    const f10Body = parse(f10Res);
    const f10Pending = fs.existsSync(pendingPath);
    const f10ClrDoc = parse(await mFault.call('d_doctor', { clear_pending_recovery: true }));
    record(
      'F10 事务中途失锁触发 aborted_lock_lost 停止操作 TIA 并落盘 pending_recovery（d_doctor 可清标）',
      !!(f10Res.result && f10Res.result.isError) &&
        f10Body.rollback.state === 'aborted_lock_lost' &&
        f10Pending &&
        !!f10ClrDoc &&
        !!f10ClrDoc.clearedPendingRecovery &&
        f10ClrDoc.clearedPendingRecovery.cleared === true &&
        !fs.existsSync(pendingPath),
      ''
    );

    await closeClient(mFault);
    await mockHttpA.close();
    await mockNonMcp.close();
  } finally {
    for (const srv of [...activeHttpServers]) {
      try {
        srv.close();
      } catch {}
    }
    await new Promise((r) => setTimeout(r, 120));
    try {
      fs.rmSync(RUNTIME, { recursive: true, force: true, maxRetries: 5, retryDelay: 80 });
    } catch {}
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n===== ${results.length - failed.length}/${results.length} 通过 =====`);
  if (failed.length) {
    console.log('失败项：' + failed.map((f) => f.name).join(' | '));
    process.exit(1);
  }
  process.exit(0);
})().catch((e) => {
  console.error('测试崩溃:', e.stack);
  process.exit(1);
});
