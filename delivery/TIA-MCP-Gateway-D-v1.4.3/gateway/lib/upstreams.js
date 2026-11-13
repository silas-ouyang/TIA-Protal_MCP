'use strict';
/*
 * gateway/lib/upstreams.js — 上游 MCP 客户端抽象（HTTP / stdio）、端口冲突诊断与进程树回收。
 *
 * 职责：
 *  - McpError：上游 JSON-RPC 错误封装
 *  - killTree：Windows 用 taskkill /T 清理整棵进程树，避免子进程残留
 *  - probePort8000：本地 HTTP 上游端口占用与无副作用 StreamableHTTP 指纹探测
 *  - Upstream / HttpUpstream（A）/ StdioUpstream（B / C）：生命周期管理与 JSON-RPC 通信
 *  - buildUpstream / resolveName：按配置构造上游实例与别名解析
 */

const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn, spawnSync, execFile } = require('child_process');
const { PROTOCOL, VERSION, config, IS_WINDOWS, log, resolvePath } = require('./utils');

class McpError extends Error {
  constructor(err) {
    super(err && err.message ? err.message : JSON.stringify(err));
    this.code = err && err.code;
    this.data = err && err.data;
  }
}

/* ------------------------------------------------------------------ */
/* 进程回收与端口 / 命令预检                                            */
/* ------------------------------------------------------------------ */

/** Windows 上 child.kill() 只杀直接进程，用 taskkill /T 杀整棵树 */
function killTree(child) {
  if (!child || !child.pid) return;
  try {
    if (IS_WINDOWS) {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } else {
      child.kill('SIGKILL');
    }
  } catch (e) {
    try {
      child.kill();
    } catch {}
  }
}

function commandExists(cmd) {
  if (!cmd) return false;
  if (path.isAbsolute(cmd) || /[\\/]/.test(cmd)) {
    return fs.existsSync(cmd);
  }
  try {
    const checker = IS_WINDOWS ? 'where' : 'which';
    const r = spawnSync(checker, [cmd], { windowsHide: true, stdio: 'ignore' });
    return r.status === 0;
  } catch {
    return false;
  }
}

function execFileAsync(cmd, args, timeoutMs = 2000) {
  return new Promise((resolve) => {
    try {
      execFile(
        cmd,
        args,
        { windowsHide: true, timeout: timeoutMs, maxBuffer: 1024 * 1024, encoding: 'utf8' },
        (error, stdout, stderr) => {
          resolve({
            ok: !error,
            stdout: stdout || '',
            stderr: stderr || '',
            code: error && typeof error.code === 'number' ? error.code : 0,
            error: error ? error.message : null,
          });
        }
      );
    } catch (e) {
      resolve({ ok: false, stdout: '', stderr: '', code: -1, error: e.message });
    }
  });
}

function encodePowerShell(script) {
  return Buffer.from(script, 'utf16le').toString('base64');
}

function parseTargetUrl(targetUrl) {
  const raw = targetUrl || 'http://127.0.0.1:8000/mcp';
  const u = new URL(raw);
  const host = u.hostname || '127.0.0.1';
  const port = u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80;
  const h = host.toLowerCase();
  const isLoopback = h === '127.0.0.1' || h === 'localhost' || h === '::1' || h === '[::1]' || h === '0.0.0.0';
  return { url: u.toString(), host, port, isLoopback };
}

function tcpProbe(host, port, timeoutMs = 600) {
  const targetHost = host === '0.0.0.0' ? '127.0.0.1' : host;
  return new Promise((resolve) => {
    let settled = false;
    const done = (open, err) => {
      if (settled) return;
      settled = true;
      resolve({ open, err });
    };
    let sock;
    try {
      sock = net.connect({ host: targetHost, port });
    } catch (e) {
      done(false, e.code || e.message);
      return;
    }
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => {
      sock.destroy();
      done(true, null);
    });
    sock.once('timeout', () => {
      sock.destroy();
      done(false, 'ETIMEDOUT');
    });
    sock.once('error', (e) => {
      sock.destroy();
      done(false, e.code || e.message);
    });
  });
}

function parseExcludedPortRanges(text) {
  const ranges = [];
  const re = /^\s*(\d+)\s+(\d+)(?:\s+\*)?\s*$/gm;
  let m;
  while ((m = re.exec(text || '')) !== null) {
    const start = Number(m[1]);
    const end = Number(m[2]);
    if (Number.isInteger(start) && Number.isInteger(end) && end >= start) {
      ranges.push({ start, end });
    }
  }
  return ranges;
}

function parseNetstatListeningPid(text, port) {
  const lines = String(text || '').split(/\r?\n/);
  let fallbackPid = null;
  for (const line of lines) {
    const m = line.match(/^\s*TCP\s+(\S+):(\d+)\s+\S+\s+(?:LISTENING|侦听)\s+(\d+)/i);
    if (!m) continue;
    if (Number(m[2]) !== Number(port)) continue;
    const addr = m[1];
    const pid = Number(m[3]);
    if (addr === '127.0.0.1' || addr === '[::1]') return pid;
    if (fallbackPid === null) fallbackPid = pid;
  }
  return fallbackPid;
}

async function inspectListeningProcess(port, runCmd) {
  if (!IS_WINDOWS) return { pid: null, parentPid: null, processName: null, executablePath: null, commandLine: null };

  const psScript = [
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    `$port = ${Number(port)}`,
    '$pidFound = $null',
    'try {',
    '  $conns = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop)',
    '  if ($conns.Count -gt 0) {',
    "    $pref = $conns | Where-Object { $_.LocalAddress -eq '127.0.0.1' -or $_.LocalAddress -eq '::1' } | Select-Object -First 1",
    '    if (-not $pref) { $pref = $conns | Select-Object -First 1 }',
    '    $pidFound = [int]$pref.OwningProcess',
    '  }',
    '} catch {}',
    'if (-not $pidFound) {',
    '  $ns = netstat -ano -p TCP 2>$null',
    '  foreach ($line in $ns) {',
    "    if ($line -match '^\\s*TCP\\s+\\S+:(\\d+)\\s+\\S+\\s+(?:LISTENING|侦听)\\s+(\\d+)\\s*$' -and ([int]$Matches[1] -eq $port)) {",
    '      $pidFound = [int]$Matches[2]; break',
    '    }',
    '  }',
    '}',
    'if ($pidFound) {',
    '  $p = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $pidFound) -ErrorAction SilentlyContinue',
    '  $gp = if (-not $p) { Get-Process -Id $pidFound -ErrorAction SilentlyContinue } else { $null }',
    '  [PSCustomObject]@{',
    '    pid = $pidFound',
    '    parentPid = if ($p) { [int]$p.ParentProcessId } else { $null }',
    '    processName = if ($p) { $p.Name } elseif ($gp) { $gp.ProcessName } else { $null }',
    '    executablePath = if ($p) { $p.ExecutablePath } else { $null }',
    '    commandLine = if ($p) { $p.CommandLine } else { $null }',
    '  } | ConvertTo-Json -Compress',
    '}',
  ].join('\n');

  const psRes = await runCmd(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodePowerShell(psScript)],
    1400
  );
  if (psRes.ok && psRes.stdout.trim()) {
    try {
      const parsed = JSON.parse(psRes.stdout.trim());
      if (parsed && parsed.pid) return parsed;
    } catch {}
  }

  // 降级：PS 超时或受限时退回 netstat -ano
  const nsRes = await runCmd('netstat', ['-ano', '-p', 'TCP'], 900);
  const pid = parseNetstatListeningPid(nsRes.stdout, port);
  return { pid, parentPid: null, processName: null, executablePath: null, commandLine: null };
}

/** 按 SSE 规范合并同一事件内的多行 data:，再按 id 取响应 */
function parseHttpMcpBody(text, contentType, id) {
  if ((contentType || '').includes('text/event-stream')) {
    const events = [];
    let cur = [];
    for (const line of String(text || '').split(/\r?\n/)) {
      if (line.startsWith('data:')) {
        cur.push(line.slice(5).replace(/^ /, ''));
      } else if (line.trim() === '') {
        if (cur.length) {
          events.push(cur.join('\n'));
          cur = [];
        }
      }
    }
    if (cur.length) events.push(cur.join('\n'));

    let hit = null;
    for (const payload of events) {
      let msg;
      try {
        msg = JSON.parse(payload);
      } catch {
        continue;
      }
      if (id !== undefined && msg.id === id) hit = msg;
      else if (
        hit === null &&
        msg.id === undefined &&
        msg.method === undefined && // 排除 notifications/progress 之类的进度通知
        (msg.result !== undefined || msg.error !== undefined)
      ) {
        hit = msg;
      }
    }
    return hit;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function probeMcpFingerprint(targetUrl, timeoutMs = 1200) {
  let res;
  try {
    // 故意省略 text/event-stream：StreamableHTTP MCP 会无副作用返回 406，不创建会话
    res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    return { isMcpHttp: false, httpStatus: null, reason: 'http_error', error: e.message };
  }

  const sid = res.headers.get('mcp-session-id');
  const contentType = res.headers.get('content-type') || '';
  let body = '';
  try {
    body = await res.text();
  } catch {}
  const snippet = body.slice(0, 300);

  if (sid) {
    // 若意外建了 session，立即配对 DELETE 清理
    try {
      const del = await fetch(targetUrl, {
        method: 'DELETE',
        headers: { 'mcp-session-id': sid },
        signal: AbortSignal.timeout(800),
      });
      await del.text().catch(() => {});
    } catch {}
    return { isMcpHttp: true, httpStatus: res.status, reason: 'mcp_session_header', snippet };
  }
  if (res.status === 406 && /text\/event-stream|not acceptable/i.test(body)) {
    return { isMcpHttp: true, httpStatus: res.status, reason: 'http_406_sse_required', snippet };
  }
  if (res.status === 400 && /missing session id|mcp-session-id/i.test(body)) {
    return { isMcpHttp: true, httpStatus: res.status, reason: 'http_400_session_required', snippet };
  }
  const parsed = parseHttpMcpBody(body, contentType);
  if (parsed && parsed.jsonrpc === '2.0') {
    return { isMcpHttp: true, httpStatus: res.status, reason: 'jsonrpc_envelope', snippet };
  }
  return { isMcpHttp: false, httpStatus: res.status, reason: 'non_mcp_http', snippet };
}

async function fetchServerInfoWithCleanup(targetUrl, timeoutMs = 2000) {
  let sid = null;
  let serverInfo = null;
  let protocolVersion = null;
  let sessionClosed = false;
  let error = null;
  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'tia-gateway-probe', version: VERSION } },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    sid = res.headers.get('mcp-session-id');
    const text = await res.text().catch(() => '');
    const msg = parseHttpMcpBody(text, res.headers.get('content-type') || '', 1);
    if (msg && msg.result) {
      serverInfo = msg.result.serverInfo || null;
      protocolVersion = msg.result.protocolVersion || null;
    }
  } catch (e) {
    error = e.message;
  } finally {
    if (sid) {
      try {
        const del = await fetch(targetUrl, {
          method: 'DELETE',
          headers: { 'mcp-session-id': sid },
          signal: AbortSignal.timeout(1000),
        });
        await del.text().catch(() => {});
        sessionClosed = del.ok;
      } catch {}
    }
  }
  return { serverInfo, protocolVersion, sessionIdSeen: !!sid, sessionClosed, error };
}

function sameExpectedExecutable(proc, expectedCommand) {
  if (!expectedCommand || !proc) return false;
  const exp = path.resolve(expectedCommand).toLowerCase();
  const exe = proc.executablePath ? path.resolve(proc.executablePath).toLowerCase() : '';
  if (exe && exe === exp) return true;
  const cmd = String(proc.commandLine || '').toLowerCase();
  return !!(cmd && cmd.includes(exp));
}

/**
 * 探测 HTTP 上游目标端口（支持任意端口，便于 Mock HTTP 用 listen(0) 单测）：
 * 区分 free / excluded_by_os / own_managed / own_orphan / foreign_mcp / foreign_non_mcp。
 */
async function probePort8000(targetUrl = 'http://127.0.0.1:8000/mcp', managedPid = null, opts = {}) {
  const { url, host, port, isLoopback } = parseTargetUrl(targetUrl);
  const runCmd = typeof opts._runCmd === 'function' ? opts._runCmd : execFileAsync;
  const tcp = await tcpProbe(host, port, opts.tcpTimeoutMs || 600);

  if (!tcp.open) {
    let excludedRange = null;
    if (IS_WINDOWS && isLoopback) {
      const ex = await runCmd('netsh', ['int', 'ipv4', 'show', 'excludedportrange', 'protocol=tcp'], 1200);
      const ranges = parseExcludedPortRanges(ex.stdout);
      excludedRange = ranges.find((r) => port >= r.start && port <= r.end) || null;
    }
    return {
      status: excludedRange ? 'excluded_by_os' : 'free',
      url,
      host,
      port,
      open: false,
      tcpError: tcp.err,
      excludedRange,
      managedPid: managedPid || null,
      pid: null,
      parentPid: null,
      processName: null,
      executablePath: null,
      commandLine: null,
      http: null,
      serverInfo: null,
      sessionClosed: null,
    };
  }

  const [proc, http] = await Promise.all([
    isLoopback
      ? inspectListeningProcess(port, runCmd)
      : Promise.resolve({ pid: null, parentPid: null, processName: null, executablePath: null, commandLine: null }),
    probeMcpFingerprint(url, opts.httpTimeoutMs || 1200),
  ]);

  let status;
  if (managedPid && proc.pid && (proc.pid === managedPid || proc.parentPid === managedPid)) {
    status = 'own_managed';
  } else if (!http.isMcpHttp) {
    status = 'foreign_non_mcp';
  } else if (sameExpectedExecutable(proc, opts.expectedCommand)) {
    status = 'own_orphan';
  } else {
    status = 'foreign_mcp';
  }

  let info = null;
  if (opts.withServerInfo === true && http.isMcpHttp) {
    info = await fetchServerInfoWithCleanup(url, opts.serverInfoTimeoutMs || 2000);
  }

  return {
    status,
    url,
    host,
    port,
    open: true,
    tcpError: null,
    excludedRange: null,
    managedPid: managedPid || null,
    pid: proc.pid || null,
    parentPid: proc.parentPid || null,
    processName: proc.processName || null,
    executablePath: proc.executablePath || null,
    commandLine: proc.commandLine || null,
    http,
    serverInfo: info ? info.serverInfo : null,
    protocolVersion: info ? info.protocolVersion : null,
    sessionClosed: info ? info.sessionClosed : null,
  };
}

/* ------------------------------------------------------------------ */
/* 上游基类                                                            */
/* ------------------------------------------------------------------ */

class Upstream {
  constructor(name, cfg) {
    this.name = name;
    this.cfg = cfg || {};
    this.ready = false;
    this.external = false;
    this.serverInfo = null;
    this.tools = [];
    this.toolMap = new Map();
    this.nextId = 1;
    this.sessionId = null;
    this.lastError = null;
    this.spawning = null;
  }

  isManagedRunning() {
    return !this.external && !!(this.child || this.proc);
  }

  async listTools() {
    const res = await this.request('tools/list', {});
    this.tools = res.tools || [];
    this.toolMap = new Map(this.tools.map((t) => [t.name, t]));
    return this.tools;
  }

  hasTool(name) {
    return this.toolMap.has(name);
  }

  async callTool(name, args, timeoutMs) {
    return this.request('tools/call', { name, arguments: args || {} }, timeoutMs);
  }

  stop() {}
}

/* ------------------------------------------------------------------ */
/* HTTP 上游（A）                                                      */
/* ------------------------------------------------------------------ */

class HttpUpstream extends Upstream {
  constructor(name, cfg) {
    super(name, cfg);
    this.url = cfg.url;
    this.child = null;
  }

  headers() {
    const h = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };
    if (this.sessionId) h['mcp-session-id'] = this.sessionId;
    return h;
  }

  parseBody(text, contentType, id) {
    return parseHttpMcpBody(text, contentType, id);
  }

  async rawRequest(method, params, timeoutMs) {
    const id = this.nextId++;
    const body = JSON.stringify({ jsonrpc: '2.0', id, method, params: params || {} });
    let res;
    try {
      res = await fetch(this.url, {
        method: 'POST',
        headers: this.headers(),
        body,
        signal: AbortSignal.timeout(timeoutMs || 600000),
      });
    } catch (e) {
      this.ready = false;
      this.sessionId = null;
      log(`${this.name} 连接失败（${e.message}），标记未就绪，下次调用会重建`);
      throw e;
    }
    const sid = res.headers.get('mcp-session-id');
    if (sid) this.sessionId = sid;
    if (!res.ok) {
      // 会话失效（A 重启后旧 sessionId 会返回 400/404）：必须重置，否则后续调用一直失败
      this.ready = false;
      this.sessionId = null;
      let errBody = '';
      try {
        errBody = await res.text();
      } catch {}
      throw new Error(`${this.name}: HTTP ${res.status} ${errBody.slice(0, 200)}`);
    }
    const text = await res.text();
    const msg = this.parseBody(text, res.headers.get('content-type'), id);
    if (!msg) throw new Error(`${this.name}: 空响应 (HTTP ${res.status})`);
    if (msg.error) throw new McpError(msg.error);
    return msg.result;
  }

  async rawNotify(method, params) {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ jsonrpc: '2.0', method, params: params || {} }),
      signal: AbortSignal.timeout(30000),
    });
    // 必须消费响应体，否则连接池被占住
    try {
      await res.text();
    } catch {}
  }

  request(method, params, timeoutMs) {
    return this.rawRequest(method, params, timeoutMs);
  }

  notify(method, params) {
    return this.rawNotify(method, params);
  }

  async portOpen(port) {
    const res = await tcpProbe('127.0.0.1', port, 1500);
    return res.open;
  }

  async ensure() {
    if (this.ready) return;
    if (this.spawning) return this.spawning;

    this.spawning = (async () => {
      const spawnCfg = this.cfg.spawn;
      const expectedCmd = spawnCfg && spawnCfg.command ? resolvePath(spawnCfg.command) : null;
      const probe = await probePort8000(this.url, this.child ? this.child.pid : null, {
        expectedCommand: expectedCmd,
      });

      if (probe.status === 'excluded_by_os') {
        const r = probe.excludedRange;
        throw new Error(
          `端口 ${probe.port} 被 Windows 系统排除/保留（${r.start}-${r.end}，WinError 10013），${this.name} 无法绑定。`
        );
      }
      if (probe.status === 'foreign_non_mcp') {
        const owner = probe.executablePath || probe.processName || '未知进程';
        throw new Error(
          `端口 ${probe.port} 已被非 MCP 进程占用（PID=${probe.pid ?? '未知'}，进程=${owner}），${this.name} 拒绝启动/连接。请先结束该进程后重试。`
        );
      }
      if (probe.status === 'foreign_mcp') {
        if (this.cfg.adoptExternal === true) {
          this.external = true;
          log(`${this.name} 显式接管端口 ${probe.port} 外部 MCP（PID=${probe.pid ?? '未知'}），标记 external=true`);
        } else {
          const owner = probe.executablePath || probe.processName || '未知进程';
          throw new Error(
            `端口 ${probe.port} 已运行外部 MCP 服务（PID=${probe.pid ?? '未知'}，进程=${owner}），` +
              `默认 fail-closed 拒绝静默接管。请关闭该服务，或在配置中显式设置 "${this.name}.adoptExternal": true。`
          );
        }
      } else if (probe.status === 'own_orphan') {
        if (this.cfg.adoptExternal === true || this.cfg.reclaimOrphan === true) {
          this.external = true;
          log(`${this.name} 按配置接管端口 ${probe.port} 孤儿进程（PID=${probe.pid ?? '未知'}），标记 external=true`);
        } else {
          const owner = probe.executablePath || probe.processName || '未知进程';
          throw new Error(
            `端口 ${probe.port} 存在残留孤儿进程（PID=${probe.pid ?? '未知'}，进程=${owner}），` +
              `默认 fail-closed 拒绝静默接管。请结束 PID ${probe.pid ?? '未知'}，或显式配置 adoptExternal / reclaimOrphan。`
          );
        }
      } else if (probe.status === 'own_managed') {
        this.external = false;
      } else if (probe.status === 'free') {
        this.external = false;
        if (!spawnCfg || !spawnCfg.command) {
          throw new Error(`端口 ${probe.port} 未监听且 ${this.name} 未配置 spawn 启动命令`);
        }
        const aCmd = resolvePath(spawnCfg.command);
        if (!commandExists(aCmd)) {
          throw new Error(`${this.name} 可执行文件不存在：${aCmd}`);
        }
        // 旧子进程可能还活着但端口无响应：先杀掉再拉新的，避免孤儿进程抢占
        if (this.child) {
          log(`${this.name} 旧进程仍在，先回收`);
          killTree(this.child);
          this.child = null;
        }
        const aCwd = resolvePath(spawnCfg.cwd) || path.dirname(aCmd);
        log(`启动 ${this.name} 服务: ${aCmd}`);
        let exitDetail = null;
        let spawnStderr = '';
        this.child = spawn(aCmd, spawnCfg.args || [], {
          cwd: aCwd,
          env: { ...process.env, ...(spawnCfg.env || {}) },
          windowsHide: true,
          detached: false,
        });
        this.child.on('exit', (code, signal) => {
          exitDetail = `code=${code}${signal ? ` signal=${signal}` : ''}`;
          log(`${this.name} 服务退出 ${exitDetail}`);
          this.child = null;
          this.ready = false;
          this.sessionId = null;
        });
        this.child.on('error', (e) => {
          exitDetail = e.message;
          this.lastError = e.message;
          this.child = null;
          this.ready = false;
          this.sessionId = null;
          log(`${this.name} 启动错误: ${e.message}`);
        });
        this.child.stderr.on('data', (d) => {
          const s = d.toString();
          spawnStderr = (spawnStderr + s).slice(-1200);
          if (s.trim()) log(`[${this.name}] ${s.trim().slice(0, 400)}`);
        });
        const readyPort = spawnCfg.readyPort || probe.port;
        const readyTimeoutMs = spawnCfg.readyTimeoutMs || 90000;
        const deadline = Date.now() + readyTimeoutMs;
        while (Date.now() < deadline) {
          if (await this.portOpen(readyPort)) break;
          if (!this.child && exitDetail !== null) {
            let clashNote = '';
            if (/10048|address already in use|通常每个套接字地址|only one usage of each socket address/i.test(spawnStderr)) {
              const after = await probePort8000(this.url, null, { expectedCommand: expectedCmd }).catch(() => null);
              if (after && after.open) {
                clashNote = ` [端口 ${after.port} 已被抢占：status=${after.status}, PID=${after.pid ?? '未知'}, 进程=${after.executablePath || after.processName || '未知'}]`;
              }
            }
            throw new Error(
              `${this.name} 服务启动后提前退出 (${exitDetail})${clashNote}${spawnStderr.trim() ? `: ${spawnStderr.trim().slice(-400)}` : ''}`
            );
          }
          await new Promise((r) => setTimeout(r, 800));
        }
        if (!(await this.portOpen(readyPort))) {
          throw new Error(
            `${this.name} 服务 ${Math.round(readyTimeoutMs / 1000)} 秒内未监听 ${readyPort}` +
              (spawnStderr.trim() ? `（stderr: ${spawnStderr.trim().slice(-300)}）` : '')
          );
        }
      }

      const init = await this.rawRequest(
        'initialize',
        { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'tia-gateway-d', version: VERSION } },
        60000
      );
      await this.rawNotify('notifications/initialized', {});
      this.serverInfo = init.serverInfo || null;
      await this.listTools();
      this.ready = true;
      log(`${this.name} 就绪，${this.tools.length} 个工具`);
    })();

    try {
      await this.spawning;
    } catch (e) {
      // 握手失败：只杀本轮自建子进程；external=true 绝不 killTree
      if (!this.external && this.child) {
        killTree(this.child);
        this.child = null;
      }
      this.external = false;
      throw e;
    } finally {
      this.spawning = null;
    }
  }

  stop() {
    if (!this.external && this.child) {
      killTree(this.child);
      this.child = null;
    }
    this.ready = false;
    this.sessionId = null;
    this.external = false;
  }
}

/* ------------------------------------------------------------------ */
/* stdio 上游（B / C）                                                 */
/* ------------------------------------------------------------------ */

class StdioUpstream extends Upstream {
  constructor(name, cfg) {
    super(name, cfg);
    this.proc = null;
    this.pending = new Map();
    this.stderrBuf = '';
    this.activeVariant = null;
  }

  resolveLaunchFor(version) {
    const byVersion = this.cfg.byVersion;
    if (byVersion) {
      if (version) {
        const key = String(version);
        if (byVersion[key]) return byVersion[key];
        throw new Error(`${this.name} 不支持 TIA 版本 V${key}（可用版本：${Object.keys(byVersion).join(', ')}）`);
      }
      const want = String(config.defaultVersion || '20');
      return byVersion[want] || byVersion[Object.keys(byVersion)[0]];
    }
    return this.cfg;
  }

  onLine(line) {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg.id !== undefined && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new McpError(msg.error));
      else p.resolve(msg.result);
    }
  }

  request(method, params, timeoutMs) {
    if (!this.proc || !this.proc.stdin || this.proc.stdin.destroyed) {
      return Promise.reject(new Error(`${this.name} 进程未运行`));
    }
    const id = this.nextId++;
    const limit = timeoutMs || 600000;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${this.name}.${method} 超时 ${limit}ms`));
      }, limit);
      this.pending.set(id, {
        resolve: (r) => {
          clearTimeout(timer);
          resolve(r);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      try {
        this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params: params || {} }) + '\n');
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e);
      }
    });
  }

  notify(method, params) {
    if (!this.proc || !this.proc.stdin || this.proc.stdin.destroyed) {
      return Promise.resolve();
    }
    try {
      this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params: params || {} }) + '\n');
    } catch {}
    return Promise.resolve();
  }

  async ensure(version) {
    while (true) {
      if (this.ready) {
        if (version && this.activeVariant && String(this.activeVariant) !== String(version)) {
          log(`${this.name} 版本 ${this.activeVariant} → ${version}，重启进程`);
          this.stop();
        } else {
          return;
        }
      }
      if (this.spawning) {
        await this.spawning;
        continue;
      }
      break;
    }

    this.stderrBuf = '';
    this.spawning = (async () => {
      const launch = this.resolveLaunchFor(version);
      if (!launch || !launch.command) throw new Error(`${this.name} 未配置启动命令`);
      this.activeVariant = launch.version || (version ? String(version) : String(config.defaultVersion || '20'));
      const sCmd = resolvePath(launch.command);
      if (!commandExists(sCmd)) {
        throw new Error(`${this.name} 可执行文件不存在：${sCmd}`);
      }
      const sCwd = resolvePath(launch.cwd) || path.dirname(sCmd);
      log(`启动 ${this.name}: ${sCmd} ${(launch.args || []).join(' ')}`);
      let proc;
      try {
        proc = spawn(sCmd, launch.args || [], {
          cwd: sCwd,
          env: { ...process.env, ...(launch.env || {}) },
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (e) {
        this.lastError = e.message;
        throw new Error(`${this.name} 启动失败: ${e.message}`);
      }
      this.proc = proc;
      let initError = null;
      let onAsyncError = null;
      const asyncErrPromise = new Promise((_, reject) => {
        onAsyncError = reject;
      });
      // 防止写入已关闭/启动失败的子进程 stdin 时触发未捕获的 EPIPE error 事件
      proc.stdin.on('error', () => {});
      let buf = '';
      proc.stdout.setEncoding('utf8');
      proc.stdout.on('data', (d) => {
        buf += d;
        if (buf.length > 16 * 1024 * 1024) {
          log(`${this.name} stdout 缓冲超 16MB，丢弃`);
          buf = buf.slice(-1024 * 1024);
        }
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (line) this.onLine(line);
        }
      });
      proc.stderr.on('data', (d) => {
        this.stderrBuf += d.toString();
        if (this.stderrBuf.length > 12000) this.stderrBuf = this.stderrBuf.slice(-12000);
      });
      proc.on('exit', (code) => {
        log(`${this.name} 退出 code=${code}`);
        if (this.proc === proc) this.proc = null;
        this.ready = false;
        const tail = this.stderrBuf.trim().slice(-400);
        const reason = `${this.name} 进程退出 (${code})${tail ? `：${tail}` : ''}`;
        const err = new Error(reason);
        if (!initError) initError = err;
        if (onAsyncError) onAsyncError(err);
        for (const [, p] of this.pending) p.reject(err);
        this.pending.clear();
      });
      proc.on('error', (e) => {
        const err = new Error(`${this.name} 启动失败: ${e.message}`);
        this.lastError = e.message;
        if (this.proc === proc) this.proc = null;
        this.ready = false;
        log(err.message);
        initError = err;
        if (onAsyncError) onAsyncError(err);
        for (const [, p] of this.pending) p.reject(err);
        this.pending.clear();
      });
      if (initError) throw initError;
      try {
        const init = await Promise.race([
          this.request(
            'initialize',
            { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'tia-gateway-d', version: VERSION } },
            90000
          ),
          asyncErrPromise,
        ]);
        await Promise.race([
          (async () => {
            await this.notify('notifications/initialized', {});
            this.serverInfo = init.serverInfo || null;
            await this.listTools();
          })(),
          asyncErrPromise,
        ]);
      } finally {
        onAsyncError = null;
      }
      this.ready = true;
      log(`${this.name} 就绪，${this.tools.length} 个工具`);
    })();

    try {
      await this.spawning;
    } catch (e) {
      // 握手失败：回收半死的子进程，并附带 stderr 尾日志便于排错
      const tail = this.stderrBuf.trim().slice(-400);
      this.stop();
      if (tail && !e.message.includes(tail.slice(0, 40))) {
        throw new Error(`${e.message}（stderr: ${tail}）`);
      }
      throw e;
    } finally {
      this.spawning = null;
    }
  }

  stop() {
    if (this.proc) {
      killTree(this.proc);
      this.proc = null;
    }
    this.ready = false;
    this.activeVariant = null;
    this.serverInfo = null;
    for (const [, p] of this.pending) p.reject(new Error(`${this.name} 已停止`));
    this.pending.clear();
  }
}

/* ------------------------------------------------------------------ */
/* 上游构造与别名解析                                                  */
/* ------------------------------------------------------------------ */

function buildUpstream(name, cfg) {
  if (!cfg || cfg.enabled === false) return null;
  if (cfg.kind === 'http') return new HttpUpstream(name, cfg);
  return new StdioUpstream(name, cfg);
}

const ALIAS = { a: 'a', b: 'b', c: 'c', 'v1.4.1': 'a', 'v2.7.8': 'b', czarnak: 'c' };

function resolveName(input, upstreams) {
  if (!input) return null;
  const key = String(input).toLowerCase();
  if (ALIAS[key]) return ALIAS[key];
  if (upstreams && typeof upstreams.has === 'function') {
    return upstreams.has(key) ? key : null;
  }
  const cfgUps = config.upstreams || {};
  return cfgUps[key] && cfgUps[key].enabled !== false ? key : null;
}

module.exports = {
  McpError,
  killTree,
  Upstream,
  HttpUpstream,
  StdioUpstream,
  buildUpstream,
  ALIAS,
  resolveName,
  probePort8000,
  parseExcludedPortRanges,
  parseNetstatListeningPid,
};
