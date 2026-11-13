#!/usr/bin/env node
'use strict';
/*
 * test-gateway-offline.js — 网关 D 纯离线单元测试与全 Mock 协议验证。
 *
 * 硬性约束：
 *  - 100% Mock，绝不启动 TiaMcpServer.exe / tia-portal-mcp.exe / TIA Portal / PLCSIM。
 *  - 绝不触碰 8000 端口、D:\TIA_Projects、宿主机运行态目录或外部进程。
 */

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const NODE = process.execPath;
const GW_PATH = path.join(__dirname, 'gateway.js');

const results = [];
const cleanupHooks = [];

function record(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  const tail = detail ? ' — ' + String(detail).replace(/\n/g, ' ').slice(0, 160) : '';
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${tail}`);
}

async function runTest(name, fn) {
  try {
    const detail = await fn();
    record(name, true, detail);
  } catch (e) {
    record(name, false, (e && e.stack) || String(e));
  }
}

function textOfRes(res) {
  const r = (res && res.result) || res || {};
  if (Array.isArray(r.content)) return r.content.map((c) => c.text).join('\n');
  return JSON.stringify(r);
}

// 与 smoke-test.js:40-54 完全一致的 parse() 契约
function parseRes(res) {
  const raw = textOfRes(res);
  try {
    return JSON.parse(raw);
  } catch {
    const idx = raw.indexOf('\n\n{');
    if (idx >= 0) {
      try {
        return JSON.parse(raw.slice(idx + 2));
      } catch {}
    }
    return null;
  }
}

function listenMockHttp(handler) {
  return new Promise((resolve) => {
    const srv = http.createServer(handler);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const close = () => new Promise((r) => srv.close(() => r()));
      cleanupHooks.push(close);
      resolve({
        port: addr.port,
        url: `http://127.0.0.1:${addr.port}/mcp`,
        close,
      });
    });
  });
}

function createMockHttpA() {
  return listenMockHttp((req, res) => {
    if (req.method === 'DELETE') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      return;
    }
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      const accept = req.headers.accept || '';
      if (!accept.includes('text/event-stream')) {
        res.writeHead(406, { 'Content-Type': 'text/plain' });
        res.end('Not Acceptable: text/event-stream required');
        return;
      }
      const msg = JSON.parse(body || '{}');
      if (msg.method === 'initialize') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'mcp-session-id': 'mock-a-offline-1' });
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
                { name: 'detect_tia_installations', inputSchema: { type: 'object', properties: {} } },
                { name: 'connect_tia', inputSchema: { type: 'object', properties: {} } },
              ],
            },
          })
        );
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id: msg.id,
          result: { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] },
        })
      );
    });
  });
}

function buildMockBScriptSource() {
  return `
const fs = require('fs');
const path = require('path');
let buf = '';
const logPath = process.env.MOCK_LOG || '';
const ctlPath = process.env.MOCK_CTL || '';
const mode = process.env.MOCK_MODE || 'normal';

const readCtl = () => {
  if (!ctlPath) return {};
  try { return JSON.parse(fs.readFileSync(ctlPath, 'utf8')); } catch { return {}; }
};
const rec = (entry) => {
  if (logPath) fs.appendFileSync(logPath, JSON.stringify({ ...entry, ts: Date.now() }) + '\\n', 'utf8');
};
const reply = (id, result) => {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\\n');
};
const textRes = (obj, isError = false) => ({
  ...(isError ? { isError: true } : {}),
  content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj) }],
});

const TOOLS = [
  { name: 'Connect', description: 'Connect TIA', annotations: { readOnlyHint: false }, inputSchema: { type: 'object', properties: {} } },
  { name: 'Disconnect', description: 'Disconnect TIA', inputSchema: { type: 'object', properties: {} } },
  { name: 'GetProject', description: 'Get open project', annotations: { readOnlyHint: true }, inputSchema: { type: 'object', properties: {} } },
  { name: 'AttachToOpenProject', description: 'Attach open project', inputSchema: { type: 'object', properties: {} } },
  { name: 'OpenProject', description: 'Open project', inputSchema: { type: 'object', properties: {} } },
  { name: 'GoOffline', description: 'Go offline', inputSchema: { type: 'object', properties: {} } },
  { name: 'CompileAndDiagnosePlc', description: 'Compile and diagnose PLC', inputSchema: { type: 'object', properties: {} } },
  { name: 'SaveProject', description: 'Save project', inputSchema: { type: 'object', properties: {} } },
  { name: 'GetBlocksWithHierarchy', description: 'Read block tree', annotations: { readOnlyHint: true }, inputSchema: { type: 'object', properties: {} } },
  { name: 'ExportBlock', description: 'Export block XML', annotations: { readOnlyHint: true }, inputSchema: { type: 'object', properties: {} } },
  { name: 'ExportAsDocuments', description: 'Export s7dcl', annotations: { readOnlyHint: true }, inputSchema: { type: 'object', properties: {} } },
  { name: 'FindTools', description: 'Find tools in full roster', annotations: { readOnlyHint: true }, inputSchema: { type: 'object', properties: {} } },
  { name: 'CallTool', description: 'Forward tool call', inputSchema: { type: 'object', properties: {} } },
];

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.method === 'initialize') {
      rec({ event: 'initialize' });
      reply(msg.id, { protocolVersion: '2025-06-18', serverInfo: { name: 'mock-b-offline', version: '2.7.8' }, capabilities: {} });
    } else if (msg.method === 'tools/list') {
      reply(msg.id, { tools: TOOLS });
    } else if (msg.method === 'tools/call') {
      const name = msg.params.name;
      const args = msg.params.arguments || {};
      const ctl = readCtl();
      rec({ event: 'tool', name, args });

      if (ctl.failTools && ctl.failTools[name]) {
        reply(msg.id, textRes(ctl.failTools[name], true));
        continue;
      }
      if (name === 'FindTools') {
        reply(msg.id, textRes({ matches: ['CompileAndDiagnosePlc', 'CompileSoftware'] }));
        continue;
      }
      if (name === 'GetProject') {
        reply(msg.id, textRes({ items: [{ name: 'MockProj' }] }));
        continue;
      }
      if (name === 'GoOffline' && (ctl.mode === 'offline-fail' || mode === 'offline-fail')) {
        reply(msg.id, textRes({ ok: false, message: 'offline failed' }));
        continue;
      }
      if (name === 'CompileAndDiagnosePlc') {
        reply(msg.id, textRes(ctl.compileResult || { State: 'Success', ErrorCount: 0, Errors: [], Meta: { success: true, diagnosticsComplete: true } }));
        continue;
      }
      if (name === 'GetBlocksWithHierarchy') {
        reply(msg.id, textRes(ctl.hierarchy || { root: { blocks: [], groups: [] } }));
        continue;
      }
      if (name === 'ExportBlock') {
        fs.mkdirSync(args.exportPath, { recursive: true });
        const leaf = String(args.blockPath || 'Block').split(/[\\\\/]/).pop();
        fs.writeFileSync(path.join(args.exportPath, leaf + '.xml'), '\\uFEFF<Document><SW.Blocks.FB><!-- 中文注释 --></SW.Blocks.FB></Document>', 'utf8');
        reply(msg.id, textRes({ ok: true, blockPath: args.blockPath }));
        continue;
      }
      reply(msg.id, textRes({ ok: true, tool: name, args }));
    }
  }
});
`;
}

function makeGatewayClient(tag, extraEnv) {
  const env = {
    ...process.env,
    HTTP_PROXY: '',
    HTTPS_PROXY: '',
    http_proxy: '',
    https_proxy: '',
    ...(extraEnv || {}),
  };
  const p = spawn(NODE, [GW_PATH], { cwd: __dirname, stdio: ['pipe', 'pipe', 'pipe'], env });
  let buf = '';
  let seq = 1;
  const pending = new Map();
  const stderr = [];
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
        const h = pending.get(msg.id);
        pending.delete(msg.id);
        clearTimeout(h.timer);
        h.resolve(msg);
      }
    }
  });
  p.stderr.on('data', (d) => stderr.push(d.toString()));
  p.on('exit', () => {
    for (const [, h] of pending) {
      clearTimeout(h.timer);
      h.resolve({ error: { message: 'gateway exited' } });
    }
    pending.clear();
  });

  const rpc = (method, params, timeoutMs = 15000) =>
    new Promise((resolve, reject) => {
      const id = seq++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${tag}: timeout on ${method}`));
      }, timeoutMs);
      pending.set(id, { resolve, timer });
      p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params: params || {} }) + '\n');
    });

  return {
    p,
    stderr,
    async init() {
      const r = await rpc('initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: tag, version: '1.0' },
      });
      p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
      return r;
    },
    call: (name, args, timeoutMs) => rpc('tools/call', { name, arguments: args || {} }, timeoutMs),
    close: () =>
      new Promise((resolve) => {
        if (p.exitCode !== null) return resolve({ code: p.exitCode });
        let done = false;
        const finish = (code) => {
          if (done) return;
          done = true;
          resolve({ code });
        };
        p.once('exit', (code) => finish(code));
        try {
          p.stdin.end();
        } catch {}
        setTimeout(() => {
          try {
            if (p.exitCode === null) p.kill();
          } catch {}
          finish(null);
        }, 2500);
      }),
  };
}

(async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tia-gw-offline-'));
  const defaultRt = path.join(workDir, 'rt-default');
  process.env.D_RUNTIME_DIR = defaultRt;

  try {
    const g = require(GW_PATH);
    const { collectBlockFiles, writeBlockFile } = require('./lib/utils');
    const { createLockManager } = require('./lib/lock');
    const { StdioUpstream } = require('./lib/upstreams');
    const { createConnectHandlers } = require('./lib/connect');
    const { createBlockHandlers } = require('./lib/blocks');

    /* ------------------------------------------------------------ */
    /* 1. 纯导出函数 + UTF-8 字节计数                                 */
    /* ------------------------------------------------------------ */
    await runTest('gateway.js 导出纯函数 (parseLoose / ok / fail / TOOLS / 等)', () => {
      assert.strictEqual(typeof g.parseLoose, 'function');
      assert.strictEqual(typeof g.ok, 'function');
      assert.strictEqual(typeof g.fail, 'function');
      assert.strictEqual(typeof g.textOf, 'function');
      assert.strictEqual(typeof g.collectBlockFiles, 'function');
      assert(Array.isArray(g.TOOLS) && g.TOOLS.length === 15);
      assert.deepStrictEqual(g.parseLoose('prefix {"ok":true,"n":1} suffix'), { ok: true, n: 1 });
      assert.strictEqual(g.parseLoose('not json'), null);
      assert.strictEqual(g.parseLoose(undefined), null);
      assert.strictEqual(g.parseLoose(null), null);
      const errRes = g.fail('boom', { finished: false });
      assert.strictEqual(errRes.isError, true);
      assert.deepStrictEqual(parseRes({ result: errRes }), { finished: false });
      assert.strictEqual(g.stripRoot('程序块/工位A/FB_1'), '工位A/FB_1');
      assert.deepStrictEqual(g.normalizeBlockTarget('Program blocks/A/B/FC1', ''), { block: 'FC1', group: 'A/B' });
      return 'exports ok';
    });

    await runTest('collectBlockFiles 按 UTF-8 多字节长度计算 bytes（非 txt.length）', () => {
      const dir = path.join(workDir, 'utf8-files');
      fs.mkdirSync(dir, { recursive: true });
      const sclContent = 'FUNCTION "FC_中文" : Void\n// 中文注释ABC\nBEGIN\nEND_FUNCTION\n';
      const written = writeBlockFile(path.join(dir, 'FC_中文.scl'), sclContent, 'scl');
      const files = collectBlockFiles(dir);
      assert.strictEqual(files.length, 1);
      const rawUtf8 = fs.readFileSync(files[0].path, 'utf8');
      const expectedBytes = Buffer.byteLength(rawUtf8, 'utf8');
      assert.strictEqual(written.bom, true);
      assert.strictEqual(files[0].bytes, expectedBytes);
      assert(files[0].bytes > rawUtf8.length, `expected bytes (${files[0].bytes}) > char length (${rawUtf8.length})`);
      return `chars=${rawUtf8.length} bytes=${files[0].bytes}`;
    });

    /* ------------------------------------------------------------ */
    /* 2. lock.js 原子写/读/心跳/瞬时竞争保护/不误删外部锁            */
    /* ------------------------------------------------------------ */
    await runTest('lock.js 原子抢锁/心跳/瞬时空锁保护与不误删有效外部锁', async () => {
      const rt = path.join(workDir, 'lock-unit');
      let lostCount = 0;
      const lm = createLockManager({
        runtimeDir: rt,
        heartbeatMs: 40,
        onLockLost: () => {
          lostCount++;
        },
      });
      await lm.acquireLock('b');
      const cur = lm.readLock();
      assert(cur && cur.pid === process.pid && cur.server === 'b');

      // 模拟瞬时空文件竞争窗口（<2s）：readLock 返回 null，lockIsStale(null)=false，心跳不误杀，precheckLock 阻止并发
      fs.writeFileSync(lm.LOCK_PATH, '', 'utf8');
      assert.strictEqual(lm.readLock(), null);
      assert.strictEqual(lm.lockIsStale(null), false);
      assert.throws(() => lm.precheckLock(), /正在写入独占锁/);
      await new Promise((r) => setTimeout(r, 90));
      assert.strictEqual(lostCount, 0, 'transient empty file must not trigger spurious onLockLost');

      // 恢复自锁再测：若文件被替换为另一个存活进程（父进程 PID）的锁，releaseLock 绝不能误删！
      lm.writeLockAtomic('b');
      assert.strictEqual(lm.readLock().pid, process.pid);
      const foreignPid = process.ppid > 0 && process.ppid !== process.pid ? process.ppid : process.pid + 1;
      fs.writeFileSync(lm.LOCK_PATH, JSON.stringify({ pid: foreignPid, server: 'a', ts: Date.now() }), 'utf8');
      lm.releaseLock();
      assert.strictEqual(fs.existsSync(lm.LOCK_PATH), true, 'releaseLock must NOT delete foreign lock');
      assert.strictEqual(JSON.parse(fs.readFileSync(lm.LOCK_PATH, 'utf8')).pid, foreignPid);

      // 还原自锁后可正常释放
      fs.writeFileSync(lm.LOCK_PATH, JSON.stringify({ pid: process.pid, server: 'b', ts: Date.now() }), 'utf8');
      lm.releaseLock();
      assert.strictEqual(fs.existsSync(lm.LOCK_PATH), false, 'releaseLock must remove own lock');

      // 过期(>2s)空/损坏文件允许 acquireLock 原子接管，不抛 TypeError
      fs.writeFileSync(lm.LOCK_PATH, '{broken', 'utf8');
      const past = new Date(Date.now() - 5000);
      fs.utimesSync(lm.LOCK_PATH, past, past);
      await lm.acquireLock('a');
      assert.strictEqual(lm.readLock().pid, process.pid);
      assert.strictEqual(lm.readLock().server, 'a');
      lm.releaseLock();
      return 'lock protections verified';
    });

    /* ------------------------------------------------------------ */
    /* 3. upstreams.js async spawn/exit error 与 stop() 清空状态     */
    /* ------------------------------------------------------------ */
    await runTest('upstreams.js 异步/同步 spawn error 暴露且 stop() 重置 activeVariant=null', async () => {
      const notExe = path.join(workDir, 'not-an-exe.txt');
      fs.writeFileSync(notExe, 'plain text', 'utf8');
      const badUp = new StdioUpstream('b', {
        kind: 'stdio',
        byVersion: { '20': { command: notExe, args: [], version: '20' } },
      });
      let errMsg = '';
      try {
        await badUp.ensure('20');
      } catch (e) {
        errMsg = e.message;
      }
      assert(/启动失败|EFTYPE|ENOEXEC|EINVAL|UNKNOWN/i.test(errMsg), `unexpected error: ${errMsg}`);
      assert(badUp.lastError && badUp.lastError.length > 0, 'lastError should be populated');
      assert.strictEqual(badUp.ready, false);
      assert.strictEqual(badUp.proc, null);
      assert.strictEqual(badUp.activeVariant, null);

      // 异步启动后在 initialize 应答前立即退出：应通过 asyncErrPromise 快速失败，不卡 90s 超时
      const crashUp = new StdioUpstream('b', {
        kind: 'stdio',
        byVersion: {
          '20': {
            command: NODE,
            args: ['-e', 'process.stderr.write("mock stderr crash"); process.exit(3);'],
            version: '20',
          },
        },
      });
      const t0 = Date.now();
      let crashMsg = '';
      try {
        await crashUp.ensure('20');
      } catch (e) {
        crashMsg = e.message;
      }
      const elapsed = Date.now() - t0;
      assert(/进程退出 \(3\)|mock stderr crash/.test(crashMsg), `unexpected crash msg: ${crashMsg}`);
      assert(elapsed < 5000, `async exit should fail fast, took ${elapsed}ms`);
      assert.strictEqual(crashUp.ready, false);
      assert.strictEqual(crashUp.proc, null);
      assert.strictEqual(crashUp.activeVariant, null);

      const mockBFile = path.join(workDir, 'mock-b-unit.js');
      fs.writeFileSync(mockBFile, buildMockBScriptSource(), 'utf8');
      const okUp = new StdioUpstream('b', {
        kind: 'stdio',
        byVersion: { '20': { command: NODE, args: [mockBFile], version: '20' } },
      });
      await okUp.ensure('20');
      assert.strictEqual(okUp.ready, true);
      assert.strictEqual(okUp.activeVariant, '20');
      okUp.stop();
      assert.strictEqual(okUp.ready, false);
      assert.strictEqual(okUp.proc, null);
      assert.strictEqual(okUp.activeVariant, null);
      assert.strictEqual(okUp.serverInfo, null);
      return `${errMsg.slice(0, 35)} | fast-exit=${elapsed}ms`;
    });

    /* ------------------------------------------------------------ */
    /* 4. lib/connect.js: d_doctor 畸形 A 输出 + lock precheck + B plc_name */
    /* ------------------------------------------------------------ */
    await runTest('connect.js d_doctor 容忍畸形 A 输出、带 precheckLock、connectB 记录 plc_name 警告', async () => {
      const rt = path.join(workDir, 'connect-unit');
      const lm = createLockManager({ runtimeDir: rt });
      const mockA = await listenMockHttp((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok');
      });
      const fakeUpA = {
        name: 'a',
        url: mockA.url,
        cfg: { kind: 'http', url: mockA.url, spawn: { command: NODE } },
        ready: true,
        child: null,
        tools: [{ name: 'detect_tia_installations' }],
        isManagedRunning: () => false,
        stop: () => {},
        callTool: async (tool) => {
          if (tool === 'detect_tia_installations') {
            return { content: [{ type: 'text', text: '<<<MALFORMED_NOT_JSON>>>' }] };
          }
          return { content: [{ type: 'text', text: '{}' }] };
        },
      };
      const fakeUpB = {
        name: 'b',
        cfg: { kind: 'stdio', byVersion: { '20': { command: NODE } } },
        ready: true,
        isManagedRunning: () => true,
        stop: () => {},
        resolveLaunchFor: () => ({ command: NODE }),
        callTool: async (tool, a) => {
          if (tool === 'Connect') {
            assert.deepStrictEqual(a, {});
            return { content: [{ type: 'text', text: '{"ok":true}' }] };
          }
          if (tool === 'GetProject') {
            return { content: [{ type: 'text', text: '{"items":[{"name":"Proj1"}]}' }] };
          }
          return { content: [{ type: 'text', text: '{"ok":true}' }] };
        },
      };
      const upMap = new Map([
        ['a', fakeUpA],
        ['b', fakeUpB],
      ]);
      let activeName = null;
      const ch = createConnectHandlers({
        upstreams: upMap,
        ensureUpstream: async (n) => upMap.get(n),
        setActive: async (n) => {
          activeName = n;
          return { up: upMap.get(n), notes: [] };
        },
        deactivate: async () => null,
        clearActive: () => {
          activeName = null;
        },
        readLock: lm.readLock,
        lockIsStale: lm.lockIsStale,
        precheckLock: lm.precheckLock,
        releaseLock: lm.releaseLock,
        probeLocalTia: async () => ({
          ok: true,
          source: 'mock',
          cached: false,
          installed: [{ major: 20, version: 'V20', publicApi: [] }],
          installedMajors: [20],
          excludedEntries: [],
          portals: [],
          opennessGroup: { ok: true, detail: 'ok' },
          bVariants: { '20': { path: NODE, exists: true } },
          cStatus: { enabled: false, installed: false },
        }),
      });

      // 4a. deep A 返回非 JSON 时 d_doctor 不崩溃，且 deep-tia-installed 标记 ok:false
      const docRes = parseRes(await ch.handleDoctor({ deep: true }));
      const deepTia = docRes.checks.find((x) => x.name === 'deep-tia-installed');
      assert(deepTia && deepTia.ok === false, 'malformed detect_tia_installations should yield ok:false check');

      // 4b. 锁文件处于瞬时空窗时 precheckLock 拦截并在 d_doctor 报告 conflict
      fs.mkdirSync(rt, { recursive: true });
      fs.writeFileSync(lm.LOCK_PATH, '', 'utf8');
      const docLockRes = parseRes(await ch.handleDoctor({}));
      const lockChk = docLockRes.checks.find((x) => x.name === 'exclusive-lock');
      assert(lockChk && lockChk.ok === false && typeof lockChk.conflict === 'string');
      fs.unlinkSync(lm.LOCK_PATH);

      // 4c. connectB + handleConnect 带 plc_name 时不静默吞掉
      const bOut = await ch.connectB(fakeUpB, '', { plcName: 'PLC_2' });
      assert(Array.isArray(bOut.warnings) && bOut.warnings.some((w) => w.includes('PLC_2')));
      const connRes = parseRes(await ch.handleConnect({ version: '20', plc_name: 'PLC_2' }));
      assert.strictEqual(activeName, 'b');
      assert(Array.isArray(connRes.notes) && connRes.notes.some((w) => w.includes('PLC_2')));
      return 'doctor & connectB warnings ok';
    });

    /* ------------------------------------------------------------ */
    /* 5. lib/blocks.js: xml 子组定位 + 相对 source_path 拦截          */
    /* ------------------------------------------------------------ */
    await runTest('blocks.js d_read_block(xml) 解析子组 & d_write_block 拒绝相对 source_path', async () => {
      const rt = path.join(workDir, 'blocks-unit');
      const outbox = path.join(rt, 'outbox');
      const inbox = path.join(rt, 'inbox');
      const calls = [];
      const mockB = {
        name: 'b',
        ready: true,
        hasTool: () => true,
        callTool: async (tool, a) => {
          calls.push({ tool, a });
          if (tool === 'GetBlocksWithHierarchy') {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    root: {
                      blocks: [],
                      groups: [
                        {
                          name: '工位A',
                          blocks: [],
                          groups: [{ name: '子组1', blocks: [{ name: 'FB_Sub' }] }],
                        },
                        { name: '工位B', blocks: [{ name: 'FB_Dup' }] },
                        { name: '工位C', blocks: [{ name: 'FB_Dup' }] },
                      ],
                    },
                  }),
                },
              ],
            };
          }
          if (tool === 'ExportBlock') {
            fs.mkdirSync(a.exportPath, { recursive: true });
            fs.writeFileSync(path.join(a.exportPath, 'FB_Sub.xml'), '\uFEFF<Document><!-- 测试 --></Document>', 'utf8');
            return { content: [{ type: 'text', text: '{"ok":true}' }] };
          }
          return { content: [{ type: 'text', text: '{"ok":true}' }] };
        },
      };
      const bh = createBlockHandlers({
        getActive: () => 'b',
        upstreams: new Map([['b', mockB]]),
        ensureUpstream: async () => mockB,
        callAnyTool: (u, t, a) => u.callTool(t, a),
        ensureLockOwnership: () => {},
        audit: () => {},
        INBOX_DIR: inbox,
        OUTBOX_DIR: outbox,
        RUNTIME_DIR: rt,
      });

      const rbXml = await bh.handleReadBlock({ block: 'FB_Sub', format: 'xml' });
      assert(!rbXml.isError);
      const rbJson = parseRes({ result: rbXml });
      assert.strictEqual(rbJson.blockPath, '工位A/子组1/FB_Sub');
      const expCall = calls.find((c) => c.tool === 'ExportBlock');
      assert(expCall && expCall.a.blockPath === '工位A/子组1/FB_Sub');
      assert(rbJson.files.some((f) => f.name === 'FB_Sub.xml' && f.bytes > 0));

      const rbDup = await bh.handleReadBlock({ block: 'FB_Dup', format: 'xml' });
      assert.strictEqual(rbDup.isError, true);
      assert(/重名/.test(textOfRes(rbDup)));

      const relWrite = await bh.handleWriteBlock({
        block: 'FB_Rel',
        format: 'scl',
        source_path: 'relative/FB_Rel.scl',
      });
      assert.strictEqual(relWrite.isError, true);
      assert(/绝对路径/.test(textOfRes(relWrite)));
      return rbJson.blockPath;
    });

    /* ------------------------------------------------------------ */
    /* 6. Gateway 子进程端到端 Mock 协议验证（零 TiaMcpServer.exe）     */
    /* ------------------------------------------------------------ */
    const mockHttpA = await createMockHttpA();
    const mockBPath = path.join(workDir, 'mock-b-e2e.js');
    fs.writeFileSync(mockBPath, buildMockBScriptSource(), 'utf8');

    const cfgPath = path.join(workDir, 'mock-d.config.json');
    fs.writeFileSync(
      cfgPath,
      JSON.stringify({
        defaultVersion: '20',
        upstreams: {
          a: { label: 'Mock A', kind: 'http', url: mockHttpA.url, adoptExternal: true },
          b: {
            label: 'Mock B',
            kind: 'stdio',
            byVersion: { '20': { command: NODE, args: [mockBPath], version: '20' } },
          },
          c: { label: 'Mock C', kind: 'stdio', installed: false, command: 'NUL', args: [] },
        },
      }),
      'utf8'
    );

    const cfgMissingB = path.join(workDir, 'mock-d-missing-b.config.json');
    fs.writeFileSync(
      cfgMissingB,
      JSON.stringify({
        defaultVersion: '20',
        upstreams: {
          b: {
            label: 'Missing B',
            kind: 'stdio',
            byVersion: { '20': { command: path.join(workDir, 'does-not-exist.exe'), args: [], version: '20' } },
          },
        },
      }),
      'utf8'
    );

    await runTest('Gateway RPC: d_list_tools 锁预检快失败、确保失败不崩溃、且保留 smoke-test 契约与元数据', async () => {
      const rt = path.join(workDir, 'e2e-listtools');
      const logHolder = path.join(workDir, 'b-holder.jsonl');
      const logIntruder = path.join(workDir, 'b-intruder.jsonl');

      const c1 = makeGatewayClient('holder', { D_RUNTIME_DIR: rt, D_GATEWAY_CONFIG: cfgPath, MOCK_LOG: logHolder });
      await c1.init();

      // 6a. 未加锁时 d_list_tools(b) 正常返回 smoke-test.js:801 所需字段 + 只读元数据
      const ltOk = await c1.call('d_list_tools', { server: 'b', filter: 'Compile', limit: 5 });
      assert(!(ltOk.result && ltOk.result.isError));
      const ltJson = parseRes(ltOk);
      assert(ltJson && ltJson.totalMatched > 0 && !!ltJson.fullRoster);
      assert.strictEqual(ltJson.active, false);
      assert.strictEqual(ltJson.started, true);
      assert.strictEqual(ltJson.external, false);

      // 6b. holder 抢锁后，第二个网关实例调用 d_list_tools 必须预检快失败，且不得拉起 mock-b
      const conn1 = await c1.call('d_connect', { version: '20' });
      assert(!(conn1.result && conn1.result.isError));

      const c2 = makeGatewayClient('intruder', { D_RUNTIME_DIR: rt, D_GATEWAY_CONFIG: cfgPath, MOCK_LOG: logIntruder });
      await c2.init();
      const ltBlocked = await c2.call('d_list_tools', { server: 'b' });
      assert.strictEqual(ltBlocked.result && ltBlocked.result.isError, true);
      assert(/另一个网关实例|占用 TIA/.test(textOfRes(ltBlocked)));
      assert.strictEqual(fs.existsSync(logIntruder), false, 'd_list_tools must not spawn upstream when lock conflicts');

      await c2.close();
      await c1.close();

      // 6c. ensureUpstream 失败时 d_list_tools 返回干净的 isError
      const rtMiss = path.join(workDir, 'e2e-miss');
      const cMiss = makeGatewayClient('miss', { D_RUNTIME_DIR: rtMiss, D_GATEWAY_CONFIG: cfgMissingB });
      await cMiss.init();
      const ltMiss = await cMiss.call('d_list_tools', { server: 'b' });
      assert.strictEqual(ltMiss.result && ltMiss.result.isError, true);
      assert(/列出 b 工具失败/.test(textOfRes(ltMiss)));
      await cMiss.close();
      return 'list_tools precheck & metadata verified';
    });

    await runTest('Gateway RPC: d_finish 在 offline/compile/save 失败时均返回 isError:true 且 parse().finished===false', async () => {
      const rt = path.join(workDir, 'e2e-finish');
      const ctlPath = path.join(workDir, 'finish-ctl.json');
      const logPath = path.join(workDir, 'finish-calls.jsonl');
      const setCtl = (obj) => fs.writeFileSync(ctlPath, JSON.stringify(obj), 'utf8');

      setCtl({});
      const gw = makeGatewayClient('finish', {
        D_RUNTIME_DIR: rt,
        D_GATEWAY_CONFIG: cfgPath,
        MOCK_CTL: ctlPath,
        MOCK_LOG: logPath,
      });
      await gw.init();
      await gw.call('d_connect', { version: '20' });

      // 1) offline fail
      setCtl({ mode: 'offline-fail' });
      const offFail = await gw.call('d_finish', {});
      const offParsed = parseRes(offFail);
      assert.strictEqual(offFail.result && offFail.result.isError, true);
      assert(offParsed && offParsed.finished === false && offParsed.steps[0].step === 'offline' && offParsed.steps[0].ok === false);

      // 2) compile fail
      setCtl({ compileResult: { State: 'Error', ErrorCount: 1, Errors: [{ Path: 'FB1', Message: 'bad syntax' }] } });
      const cmpFail = await gw.call('d_finish', {});
      const cmpParsed = parseRes(cmpFail);
      assert.strictEqual(cmpFail.result && cmpFail.result.isError, true);
      assert(cmpParsed && cmpParsed.finished === false);
      assert(cmpParsed.steps.some((s) => s.step === 'compile' && s.ok === false));
      assert(cmpParsed.steps.some((s) => s.step === 'save' && s.ok === false));

      // 3) save fail
      setCtl({ failTools: { SaveProject: 'disk full' } });
      const saveFail = await gw.call('d_finish', {});
      const saveParsed = parseRes(saveFail);
      assert.strictEqual(saveFail.result && saveFail.result.isError, true);
      assert(saveParsed && saveParsed.finished === false);
      assert(saveParsed.steps.some((s) => s.step === 'save' && s.ok === false));

      // 4) success
      setCtl({});
      const okFin = await gw.call('d_finish', {});
      const okParsed = parseRes(okFin);
      assert(!(okFin.result && okFin.result.isError));
      assert.strictEqual(okParsed.finished, true);

      // 验证 shutdown() 优雅断开 Disconnect 并清锁
      const closeRes = await gw.close();
      assert.strictEqual(closeRes.code, 0);
      assert.strictEqual(fs.existsSync(path.join(rt, 'active.lock')), false, 'active.lock must be removed on shutdown');
      const recorded = fs
        .readFileSync(logPath, 'utf8')
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l));
      assert(recorded.some((e) => e.event === 'tool' && e.name === 'Disconnect'), 'shutdown must call deactivate(Disconnect)');
      return 'offline/compile/save fail + clean shutdown verified';
    });

    await runTest('Gateway RPC: d_read_block(xml) 子组解析 + d_write_block 相对路径拦截 + d_connect plc_name 警告', async () => {
      const rt = path.join(workDir, 'e2e-xml');
      const ctlPath = path.join(workDir, 'xml-ctl.json');
      fs.writeFileSync(
        ctlPath,
        JSON.stringify({
          hierarchy: {
            root: {
              blocks: [],
              groups: [{ name: '工位A', groups: [{ name: '子组1', blocks: [{ name: 'FB_Sub' }] }] }],
            },
          },
        }),
        'utf8'
      );
      const gw = makeGatewayClient('xml-e2e', { D_RUNTIME_DIR: rt, D_GATEWAY_CONFIG: cfgPath, MOCK_CTL: ctlPath });
      await gw.init();

      const conn = await gw.call('d_connect', { version: '20', plc_name: 'PLC_Line1' });
      assert(!(conn.result && conn.result.isError));
      const connJson = parseRes(conn);
      assert(connJson.notes.some((w) => w.includes('PLC_Line1')));
      assert(connJson.result.warnings.some((w) => w.includes('PLC_Line1')));

      const rb = await gw.call('d_read_block', { block: 'FB_Sub', format: 'xml' });
      assert(!(rb.result && rb.result.isError));
      const rbJson = parseRes(rb);
      assert.strictEqual(rbJson.blockPath, '工位A/子组1/FB_Sub');
      assert(rbJson.files.some((f) => f.name === 'FB_Sub.xml'));

      const relW = await gw.call('d_write_block', { block: 'FB_Rel', format: 'scl', source_path: 'FB_Rel.scl' });
      assert.strictEqual(relW.result && relW.result.isError, true);
      assert(/绝对路径/.test(textOfRes(relW)));

      await gw.close();
      return rbJson.blockPath;
    });
  } finally {
    for (const fn of cleanupHooks) {
      try {
        await fn();
      } catch {}
    }
    try {
      fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    } catch {}
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n===== 离线单测结果: ${results.length - failed.length}/${results.length} 通过 =====`);
  if (failed.length) {
    console.log('失败项: ' + failed.map((f) => f.name).join(' | '));
    process.exit(1);
  }
  process.exit(0);
})();
