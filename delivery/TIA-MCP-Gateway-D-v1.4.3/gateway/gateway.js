#!/usr/bin/env node
'use strict';
/*
 * TIA Gateway D — 把 A / B / C 三套 TIA Portal MCP 收进一个 stdio MCP 服务器。
 *
 * 设计要点：
 *  - 对宿主只暴露一套小工具面（d_*），全量能力通过 d_call 透传。
 *  - 独占：同一时刻只允许一个网关进程连 TIA，切换前自动断开上一个。
 *  - 自管生命周期：A 的 HTTP 服务由网关拉起，B/C 用 stdio 子进程，退出时统一回收。
 *  - 版本路由：V15–V19 只能走 A；V20/V21 优先 B；V21 且装了 C 才放开 C。
 *
 * v1.3（三轮审查 + 真机验证）：见 CHANGELOG-v1.1/1.2/1.3.md
 */

const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn, spawnSync } = require('child_process');

const PROTOCOL = '2025-06-18';
const VERSION = '1.4.3';
const CONFIG_PATH = process.env.D_GATEWAY_CONFIG || path.join(__dirname, 'd.config.json');
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
  return path.resolve(__dirname, s);
}

class McpError extends Error {
  constructor(err) {
    super(err && err.message ? err.message : JSON.stringify(err));
    this.code = err && err.code;
    this.data = err && err.data;
  }
}

/* ------------------------------------------------------------------ */
/* 进程回收                                                            */
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

/* ------------------------------------------------------------------ */
/* 上游基类                                                            */
/* ------------------------------------------------------------------ */

class Upstream {
  constructor(name, cfg) {
    this.name = name;
    this.cfg = cfg || {};
    this.ready = false;
    this.serverInfo = null;
    this.tools = [];
    this.toolMap = new Map();
    this.nextId = 1;
    this.sessionId = null;
    this.lastError = null;
    this.spawning = null;
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

  /** 按 SSE 规范合并同一事件内的多行 data:，再按 id 取响应 */
  parseBody(text, contentType, id) {
    if ((contentType || '').includes('text/event-stream')) {
      const events = [];
      let cur = [];
      for (const line of text.split(/\r?\n/)) {
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
        if (msg.id === id) hit = msg;
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
      let body = '';
      try {
        body = await res.text();
      } catch {}
      throw new Error(`${this.name}: HTTP ${res.status} ${body.slice(0, 200)}`);
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
    return new Promise((resolve) => {
      const s = net.connect({ host: '127.0.0.1', port }, () => {
        s.destroy();
        resolve(true);
      });
      s.on('error', () => resolve(false));
      s.setTimeout(1500, () => {
        s.destroy();
        resolve(false);
      });
    });
  }

  async ensure() {
    if (this.ready) return;
    if (this.spawning) return this.spawning;

    this.spawning = (async () => {
      const spawnCfg = this.cfg.spawn;
      if (spawnCfg && !(await this.portOpen(spawnCfg.readyPort))) {
        // 旧子进程可能还活着但端口无响应：先杀掉再拉新的，避免孤儿进程抢占
        if (this.child) {
          log(`${this.name} 旧进程仍在，先回收`);
          killTree(this.child);
          this.child = null;
        }
        const aCmd = resolvePath(spawnCfg.command);
        const aCwd = resolvePath(spawnCfg.cwd) || path.dirname(aCmd);
        log(`启动 ${this.name} 服务: ${aCmd}`);
        this.child = spawn(aCmd, spawnCfg.args || [], {
          cwd: aCwd,
          env: { ...process.env, ...(spawnCfg.env || {}) },
          windowsHide: true,
          detached: false,
        });
        this.child.on('exit', (code) => {
          log(`${this.name} 服务退出 code=${code}`);
          this.child = null;
          this.ready = false;
          this.sessionId = null;
        });
        this.child.stderr.on('data', (d) => {
          const s = d.toString();
          if (s.trim()) log(`[${this.name}] ${s.trim().slice(0, 400)}`);
        });
        const deadline = Date.now() + (spawnCfg.readyTimeoutMs || 90000);
        while (Date.now() < deadline) {
          if (await this.portOpen(spawnCfg.readyPort)) break;
          await new Promise((r) => setTimeout(r, 800));
        }
        if (!(await this.portOpen(spawnCfg.readyPort))) {
          throw new Error(`${this.name} 服务 90 秒内未监听 ${spawnCfg.readyPort}`);
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
      // 握手失败：把可能已经拉起的子进程收掉，别留僵尸
      if (this.child) {
        killTree(this.child);
        this.child = null;
      }
      throw e;
    } finally {
      this.spawning = null;
    }
  }

  stop() {
    if (this.child) {
      killTree(this.child);
      this.child = null;
    }
    this.ready = false;
    this.sessionId = null;
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
      if (version) return byVersion[String(version)] || byVersion[Object.keys(byVersion)[0]];
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
    try {
      this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params: params || {} }) + '\n');
    } catch {}
    return Promise.resolve();
  }

  async ensure(version) {
    if (this.ready) {
      if (version && this.activeVariant && String(this.activeVariant) !== String(version)) {
        log(`${this.name} 版本 ${this.activeVariant} → ${version}，重启进程`);
        this.stop();
      } else {
        return;
      }
    }
    if (this.spawning) return this.spawning;

    this.spawning = (async () => {
      const launch = this.resolveLaunchFor(version);
      if (!launch || !launch.command) throw new Error(`${this.name} 未配置启动命令`);
      this.activeVariant = launch.version || null;
      const sCmd = resolvePath(launch.command);
      const sCwd = resolvePath(launch.cwd) || path.dirname(sCmd);
      log(`启动 ${this.name}: ${sCmd} ${(launch.args || []).join(' ')}`);
      this.proc = spawn(sCmd, launch.args || [], {
        cwd: sCwd,
        env: { ...process.env, ...(launch.env || {}) },
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let buf = '';
      this.proc.stdout.setEncoding('utf8');
      this.proc.stdout.on('data', (d) => {
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
      this.proc.stderr.on('data', (d) => {
        this.stderrBuf += d.toString();
        if (this.stderrBuf.length > 12000) this.stderrBuf = this.stderrBuf.slice(-12000);
      });
      this.proc.on('exit', (code) => {
        log(`${this.name} 退出 code=${code}`);
        this.proc = null;
        this.ready = false;
        for (const [, p] of this.pending) p.reject(new Error(`${this.name} 进程退出 (${code})`));
        this.pending.clear();
      });
      this.proc.on('error', (e) => {
        this.lastError = e.message;
        log(`${this.name} 启动失败: ${e.message}`);
      });
      const init = await this.request(
        'initialize',
        { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'tia-gateway-d', version: VERSION } },
        90000
      );
      await this.notify('notifications/initialized', {});
      this.serverInfo = init.serverInfo || null;
      await this.listTools();
      this.ready = true;
      log(`${this.name} 就绪，${this.tools.length} 个工具`);
    })();

    try {
      await this.spawning;
    } catch (e) {
      // 握手失败：回收半死的子进程
      this.stop();
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
    for (const [, p] of this.pending) p.reject(new Error(`${this.name} 已停止`));
    this.pending.clear();
  }
}

/* ------------------------------------------------------------------ */
/* 上游注册表                                                          */
/* ------------------------------------------------------------------ */

const upstreams = new Map();

function buildUpstream(name, cfg) {
  if (!cfg || cfg.enabled === false) return null;
  if (cfg.kind === 'http') return new HttpUpstream(name, cfg);
  return new StdioUpstream(name, cfg);
}

for (const [name, cfg] of Object.entries(config.upstreams || {})) {
  const up = buildUpstream(name, cfg);
  if (up) upstreams.set(name, up);
}

const ALIAS = { a: 'a', b: 'b', c: 'c', 'v1.4.1': 'a', 'v2.7.8': 'b', czarnak: 'c' };

function resolveName(input) {
  if (!input) return null;
  const key = String(input).toLowerCase();
  return ALIAS[key] || (upstreams.has(key) ? key : null);
}

let active = null;

/* ------------------------------------------------------------------ */
/* 跨进程独占锁（原子创建 + 心跳续期）                                  */
/* ------------------------------------------------------------------ */

const RUNTIME_DIR = path.join(__dirname, 'runtime');
const LOCK_PATH = path.join(RUNTIME_DIR, 'active.lock');
const LOCK_TTL_MS = 5 * 60 * 1000;
const LOCK_HEARTBEAT_MS = 30 * 1000;

let heartbeatTimer = null;

function readLock() {
  try {
    return JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

function lockFileAgeMs() {
  try {
    return Date.now() - fs.statSync(LOCK_PATH).mtimeMs;
  } catch {
    return null;
  }
}

function lockIsStale(cur) {
  if (!cur) {
    // 读不出内容 ≠ 无锁：可能是刚 openSync('wx') 还没 writeSync 的 0 字节窗口
    const age = lockFileAgeMs();
    if (age === null) return true; // 文件真的不存在
    return age > 2000; // 2 秒内的空文件视为"创建者正在写入"
  }
  if (cur.pid === process.pid) return false;
  if (!pidAlive(cur.pid)) return true;
  return Date.now() - (cur.ts || 0) > LOCK_TTL_MS;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 原子替换：写临时文件再 rename，保证 LOCK_PATH 永远不会处于 0 字节状态 */
function writeLockAtomic(server) {
  const tmp = `${LOCK_PATH}.${process.pid}.tmp`;
  const payload = JSON.stringify({ pid: process.pid, server, ts: Date.now() });
  try {
    fs.writeFileSync(tmp, payload);
    fs.renameSync(tmp, LOCK_PATH);
  } catch {
    // rename 撞上别人 readLock 的瞬时共享冲突：原位写即可。
    // 绝不能 unlink 再 rename —— 那会开出一个"无锁空窗"，别人 openSync('wx') 会趁虚而入
    try {
      fs.writeFileSync(LOCK_PATH, payload);
    } catch {}
  } finally {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {}
  }
}

/** 只读预检：在拉起上游之前先看有没有别的活进程占着，避免白起一个子进程再报错 */
function precheckLock() {
  const cur = readLock();
  if (cur && cur.pid !== process.pid && !lockIsStale(cur)) {
    throw new Error(
      `另一个网关实例（pid ${cur.pid}，上游 ${cur.server}）正在占用 TIA。` +
        `同一时刻只能有一个宿主连 TIA，请先结束那边的会话。`
    );
  }
}

/**
 * 原子抢占：O_EXCL 创建 + 过期锁用 rename 接管 + 共享冲突重试。
 * 任何别的活进程（无论用哪个上游）都拒绝 —— 两个网关同时连 TIA 一定会抢会话。
 */
async function acquireLock(server) {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const fd = fs.openSync(LOCK_PATH, 'wx');
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, server, ts: Date.now() }));
      try {
        fs.fsyncSync(fd);
      } catch {}
      fs.closeSync(fd);
      startHeartbeat();
      return;
    } catch (e) {
      if (e.code === 'EPERM' || e.code === 'EACCES' || e.code === 'EBUSY') {
        // Windows 文件共享冲突：绝不能当成功放行，重试
        await sleep(60);
        continue;
      }
      if (e.code !== 'EEXIST') {
        log(`写锁异常（${e.code || e.message}），重试`);
        await sleep(60);
        continue;
      }
      const cur = readLock();
      if (cur && cur.pid === process.pid) {
        writeLockAtomic(server);
        startHeartbeat();
        return;
      }
      if (lockIsStale(cur)) {
        // 用 rename 抢走：同一时刻只有一个人 rename 成功，避免误删别人刚建的新锁
        const stale = `${LOCK_PATH}.stale.${process.pid}`;
        try {
          fs.renameSync(LOCK_PATH, stale);
          fs.unlinkSync(stale);
        } catch {}
        await sleep(30);
        continue;
      }
      throw new Error(
        `另一个网关实例（pid ${cur.pid}，上游 ${cur.server}）正在占用 TIA。` +
          `同一时刻只能有一个宿主连 TIA，请先结束那边的会话（锁 ${Math.round(LOCK_TTL_MS / 60000)} 分钟无心跳过期）。`
      );
    }
  }
  throw new Error('抢锁失败：多次重试仍未获得锁');
}

function startHeartbeat() {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    const cur = readLock();
    if (cur && cur.pid === process.pid) {
      try {
        writeLockAtomic(cur.server); // 原子替换，不会出现 0 字节窗口
      } catch {}
    }
  }, LOCK_HEARTBEAT_MS);
  heartbeatTimer.unref && heartbeatTimer.unref();
}

function releaseLock() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  const cur = readLock();
  if (cur && cur.pid === process.pid) {
    try {
      fs.unlinkSync(LOCK_PATH);
    } catch {}
  }
}

/* ------------------------------------------------------------------ */
/* 工作目录 / 编码 / 审计日志                                          */
/* ------------------------------------------------------------------ */

const INBOX_DIR = path.join(RUNTIME_DIR, 'inbox');
const OUTBOX_DIR = path.join(RUNTIME_DIR, 'outbox');
const AUDIT_PATH = path.join(RUNTIME_DIR, 'd.log');
const AUDIT_MAX_BYTES = 5 * 1024 * 1024;
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

function audit(entry) {
  try {
    ensureDir(RUNTIME_DIR);
    try {
      const st = fs.statSync(AUDIT_PATH);
      if (st.size > AUDIT_MAX_BYTES) fs.renameSync(AUDIT_PATH, AUDIT_PATH + '.1');
    } catch {}
    fs.appendFileSync(
      AUDIT_PATH,
      JSON.stringify({ ts: new Date().toISOString(), pid: process.pid, ...entry }) + '\n',
      'utf8'
    );
  } catch {}
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
/* 上游编排                                                            */
/* ------------------------------------------------------------------ */

async function ensureUpstream(name, version) {
  const up = upstreams.get(name);
  if (!up) throw new Error(`未知上游 "${name}"，可用：${[...upstreams.keys()].join(', ')}`);
  if (up.cfg.installed === false) {
    throw new Error(
      `上游 ${name} 未安装：${up.cfg.label || name}。` +
        `C 需要本机安装 TIA Portal V21，并用 dotnet tool install -g TiaMcpServer 安装服务端。`
    );
  }
  try {
    await up.ensure(version);
  } catch (e) {
    up.lastError = e.message;
    throw new Error(`上游 ${name} 启动失败：${e.message}`);
  }
  return up;
}

async function deactivate(name) {
  const up = upstreams.get(name);
  if (!up || !up.ready) return null;
  const disconnectTool = { a: 'disconnect_tia', b: 'Disconnect', c: 'close_project' }[name];
  if (!disconnectTool || !up.hasTool(disconnectTool)) return null;
  try {
    const args = name === 'a' ? { close_portal: false } : {};
    await up.callTool(disconnectTool, args, 120000);
    return `${name}.${disconnectTool} 已断开`;
  } catch (e) {
    return `${name}.${disconnectTool} 断开失败：${e.message}`;
  }
}

/** 先只读预检锁、再启动、最后抢锁；启动失败不会留下锁，也不会白起子进程 */
async function setActive(name, version) {
  precheckLock();
  const up = await ensureUpstream(name, version);
  const notes = [];
  if (active && active !== name) {
    const n = await deactivate(active);
    if (n) notes.push(n);
  }
  await acquireLock(name);
  active = name;
  return { up, notes };
}

/**
 * 调任意工具：目标不在当前可见档位（B 的 lite 只列 65 个）时，
 * 自动用 B 的 CallTool 转发，避免"列表里没有 = 做不到"。
 */
async function callAnyTool(up, tool, args, timeoutMs) {
  if (up.hasTool(tool)) return up.callTool(tool, args, timeoutMs);
  if (up.name === 'b' && up.hasTool('CallTool')) {
    log(`B 的 ${tool} 不在 lite 档，改用 CallTool 转发`);
    return up.callTool('CallTool', { name: tool, argumentsJson: JSON.stringify(args) }, timeoutMs);
  }
  throw new Error(`上游 ${up.name} 没有工具 ${tool}`);
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
  const st = obj.State ?? obj.state;
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
/* 工具定义                                                            */
/* ------------------------------------------------------------------ */

const TOOLS = [
  {
    name: 'd_status',
    description:
      '查看网关状态：哪些上游已启动、当前独占连接的是谁、各自工具数与版本。任何 TIA 任务的第一步建议先调这个。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'd_doctor',
    description:
      '一次性体检：独占锁状态、A 是否可起、已装 TIA 版本、Openness 组权限、B 运行时是否存在、C 是否启用，并给出修复建议。只读诊断，不会改系统。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'd_versions',
    description: '探测本机安装了哪些 TIA Portal 版本，并给出各版本可用的上游（A/B/C）。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'd_use',
    description: '强制切换当前独占的上游（a/b/c）。会自动断开上一个，避免两个进程同时占用 TIA Openness 会话。',
    inputSchema: {
      type: 'object',
      properties: { server: { type: 'string', enum: ['a', 'b', 'c'] } },
      required: ['server'],
      additionalProperties: false,
    },
  },
  {
    name: 'd_list_tools',
    description:
      '列出某个上游的工具。B 上带 filter 时会同时查 lite 档和全量 238 个（走 FindTools），不会漏掉 L2 工具。',
    inputSchema: {
      type: 'object',
      properties: {
        server: { type: 'string', enum: ['a', 'b', 'c'] },
        filter: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 300 },
      },
      required: ['server'],
      additionalProperties: false,
    },
  },
  {
    name: 'd_call',
    description:
      '透传调用任意上游的任意工具，保证 ABC 有的能力 D 全有。B 上不在 lite 档的工具会自动走 CallTool 转发。不确定工具名时先 d_list_tools。',
    inputSchema: {
      type: 'object',
      properties: {
        server: { type: 'string', enum: ['a', 'b', 'c'] },
        tool: { type: 'string' },
        arguments: { type: 'object' },
        timeoutMs: { type: 'integer', minimum: 1000, maximum: 3600000 },
        retries: { type: 'integer', minimum: 0, maximum: 5, description: '传输层失败时的重试次数（指数退避）' },
      },
      required: ['server', 'tool'],
      additionalProperties: false,
    },
  },
  {
    name: 'd_connect',
    description:
      '按版本自动选上游并连接 TIA。V15–V19 走 A；V20/V21 优先 B，B 不可用时回落 A。传了 project_file_path 时会自动从 .ap16/.ap20/.ap21 后缀推断版本，并打开/附着对应工程。',
    inputSchema: {
      type: 'object',
      properties: {
        version: { type: 'string', description: 'auto | 16 | 20 | 21 | V20 …' },
        project_file_path: { type: 'string' },
        plc_name: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'd_tree',
    description: '读取当前工程结构（A: get_plc_inventory / B: GetProjectTree / C: browse_project_tree）。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'd_read_block',
    description:
      '读一个块的逻辑。B 用 DescribeBlockLogic 直接给可读梯形图骨架；A 走导出到独立目录再整目录读回（不依赖上游返回的路径文本）。',
    inputSchema: {
      type: 'object',
      properties: {
        block: { type: 'string', description: '块名或 Group/Sub/Name' },
        plc: { type: 'string', description: 'PLC 软件路径，默认 PLC' },
        format: { type: 'string', description: 'A 的导出格式，默认 xml' },
      },
      required: ['block'],
      additionalProperties: false,
    },
  },
  {
    name: 'd_write_block',
    description:
      '写一个块。网关按博途编码规则落盘（.scl 含中文加 BOM、.s7dcl/.s7res/.xml 一律 BOM），再按当前上游生成执行计划。默认只返回计划，confirm:true 才真正写入。',
    inputSchema: {
      type: 'object',
      properties: {
        block: { type: 'string', description: '块名' },
        format: { type: 'string', enum: ['scl', 's7dcl', 'xml', 'lad-spec'] },
        content: { type: 'string', description: '块源码文本' },
        source_path: { type: 'string', description: '或者给一个已有文件路径' },
        res_content: { type: 'string', description: 's7dcl 的多语言资源文件内容（含标题/中文注释时必须给）' },
        plc: { type: 'string' },
        group: { type: 'string', description: '目标块组路径' },
        overwrite: { type: 'boolean', description: '覆盖已存在的块，默认 true' },
        allow_ob_source: {
          type: 'boolean',
          description: 'A 上允许用外部源写 OB（默认 false，A 会拒绝，因为会静默丢优化块访问属性）',
        },
        confirm: { type: 'boolean', description: '必须显式 true 才真正写入' },
      },
      required: ['block', 'format'],
      additionalProperties: false,
    },
  },
  {
    name: 'd_compile',
    description: '编译并返回诊断（A: compile_plc / B: CompileAndDiagnosePlc / C: compile_check）。',
    inputSchema: {
      type: 'object',
      properties: { plc: { type: 'string' } },
      additionalProperties: false,
    },
  },
  {
    name: 'd_save',
    description: '保存工程（A: save_project / B: SaveProject / C: save_project）。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'd_offline',
    description: '转离线（A: go_offline / B: GoOffline）。写块、改硬件前必须离线。',
    inputSchema: {
      type: 'object',
      properties: { plc: { type: 'string' } },
      additionalProperties: false,
    },
  },
  {
    name: 'd_download',
    description:
      '下载到 PLC。只支持 A/B。网卡、目标接口、PLC IP 必须由用户明确提供，网关不会猜。注意：A 上 target_interface 填 PLC IP（V15–V20）或接口名（V21）；B 上 target_interface 必须是 PLC IP。',
    inputSchema: {
      type: 'object',
      properties: {
        pc_interface_type: { type: 'string', description: '仅 A 需要' },
        pc_interface_name: { type: 'string' },
        target_interface: { type: 'string', description: 'A(V15-V20)/B: PLC IP；A(V21): 接口名' },
        plc: { type: 'string' },
        allow_physical_plc: {
          type: 'boolean',
          description: 'A 必填：默认 false 会拒绝下载到真机，确认要写实体 PLC 时传 true',
        },
        allow_cpu_stop: { type: 'boolean', description: 'A：允许下载时停机' },
        start_cpu_after_download: { type: 'boolean', description: 'A：下载后启动 CPU' },
        confirm: { type: 'boolean', description: '必须显式 true 才会真正下载' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'd_finish',
    description:
      '收尾三连：转离线 → 编译（要求 0 错）→ 保存。无人值守流程的固定收尾动作，编译判据按结构化字段解析，任一步失败会停在原地并报告。',
    inputSchema: {
      type: 'object',
      properties: {
        plc: { type: 'string' },
        requireZeroErrors: { type: 'boolean', description: '默认 true，编译有错则不保存' },
      },
      additionalProperties: false,
    },
  },
];

/* ------------------------------------------------------------------ */
/* 工具实现                                                            */
/* ------------------------------------------------------------------ */

function statusSnapshot() {
  const rows = [];
  for (const [name, up] of upstreams) {
    rows.push({
      server: name,
      label: up.cfg.label || name,
      kind: up.cfg.kind,
      started: up.ready,
      tools: up.ready ? up.tools.length : 0,
      serverInfo: up.serverInfo ? up.serverInfo.name + ' ' + up.serverInfo.version : null,
      variant: up.activeVariant || null,
      lastError: up.lastError,
      active: active === name,
    });
  }
  const lock = readLock();
  return {
    active,
    lock: lock ? { pid: lock.pid, server: lock.server, mine: lock.pid === process.pid } : null,
    upstreams: rows,
    config: CONFIG_PATH,
  };
}

async function handleStatus() {
  return ok(statusSnapshot());
}

async function handleDoctor() {
  const report = { ok: true, checks: [], fixes: [] };

  const lock = readLock();
  report.checks.push({
    name: 'exclusive-lock',
    ok: !lock || lock.pid === process.pid || lockIsStale(lock),
    detail: lock
      ? `锁被 pid ${lock.pid} 持有（上游 ${lock.server}）${lockIsStale(lock) ? ' — 已失效' : ''}`
      : '无锁',
  });

  let versions = [];
  try {
    const up = await ensureUpstream('a');
    report.checks.push({ name: 'upstream-a', ok: true, detail: `${up.tools.length} 个工具` });
    const v = await up.callTool('detect_tia_installations', {}, 180000);
    const parsed = JSON.parse(textOf(v));
    versions = (parsed.installed || []).map((x) => x.version || x.label);
    report.checks.push({ name: 'tia-installed', ok: versions.length > 0, detail: versions.join(', ') || '未检测到' });
    const pre = await up.callTool('check_openness_prerequisites', {}, 120000);
    const preText = textOf(pre);
    let preOk = false;
    try {
      preOk = JSON.parse(preText).needs_user_action === false;
    } catch {}
    report.checks.push({
      name: 'openness-group',
      ok: preOk,
      detail: preOk ? '当前用户已在 Siemens TIA Openness 组' : preText.slice(0, 400),
    });
    if (!preOk) report.fixes.push('把当前用户加入「Siemens TIA Openness」组并注销重登。');
  } catch (e) {
    report.ok = false;
    report.checks.push({ name: 'upstream-a', ok: false, detail: e.message });
    report.fixes.push('检查 A 的 exe 路径是否还在 d.config.json 里。');
  }

  const bCfg = upstreams.get('b');
  if (bCfg) {
    // 逐版本检查运行时，而不是只看 defaultVersion —— 否则 V21 机器上 v21 运行时坏了也查不出来
    const variants = bCfg.cfg.byVersion ? Object.keys(bCfg.cfg.byVersion) : [];
    if (variants.length) {
      for (const v of variants) {
        const launch = bCfg.resolveLaunchFor(v);
        const p = launch && resolvePath(launch.command);
        const exists = p && fs.existsSync(p);
        report.checks.push({
          name: `upstream-b-v${v}`,
          ok: !!exists,
          detail: exists ? p : `找不到 ${p}`,
        });
        if (!exists) report.fixes.push(`上游 B 的 V${v} 运行时缺失：${p}`);
      }
    } else {
      const launch = bCfg.resolveLaunchFor(config.defaultVersion);
      const p = launch && resolvePath(launch.command);
      const exists = p && fs.existsSync(p);
      report.checks.push({ name: 'upstream-b', ok: !!exists, detail: exists ? p : `找不到 ${p}` });
      if (!exists) report.fixes.push(`上游 B 运行时缺失：${p}`);
    }
  }

  const cCfg = upstreams.get('c');
  report.checks.push({
    name: 'upstream-c',
    ok: !!cCfg && cCfg.cfg.installed === true,
    detail: cCfg && cCfg.cfg.installed ? '已启用' : '未安装（需 TIA V21 + dotnet tool install -g TiaMcpServer）',
  });

  const major = versions.map((v) => parseInt(v, 10)).filter((n) => !Number.isNaN(n));
  const best = major.length ? Math.max(...major) : null;
  report.routing = best ? { maxVersion: `V${best}`, preferred: best >= 20 ? 'b' : 'a' } : null;
  report.ok = report.ok && report.checks.filter((c) => c.name !== 'upstream-c').every((c) => c.ok);
  return ok(report);
}

async function handleVersions() {
  const up = await ensureUpstream('a');
  const res = await up.callTool('detect_tia_installations', {}, 180000);
  const text = textOf(res);
  let installed = [];
  try {
    const parsed = JSON.parse(text);
    installed = (parsed.installed || []).map((x) => x.version || x.label);
  } catch {}
  const routing = installed.map((v) => {
    const major = parseInt(String(v), 10);
    const servers = major >= 20 ? ['b', 'a'] : ['a'];
    if (major >= 21 && upstreams.has('c')) servers.unshift('c');
    return { version: v, servers };
  });
  return ok({ installed, routing, raw: text.slice(0, 4000) });
}

async function handleUse(args) {
  const name = resolveName(args.server);
  if (!name) return fail(`未知 server：${args.server}`);
  const { notes } = await setActive(name);
  return ok({ active: name, notes, status: statusSnapshot() });
}

async function handleListTools(args) {
  const name = resolveName(args.server);
  if (!name) return fail(`未知 server：${args.server}`);
  const up = await ensureUpstream(name);
  const filter = (args.filter || '').toLowerCase();
  const limit = args.limit || 80;

  let items = up.tools;
  if (filter) {
    items = items.filter(
      (t) => t.name.toLowerCase().includes(filter) || (t.description || '').toLowerCase().includes(filter)
    );
  }
  const result = {
    server: name,
    liteTotal: up.tools.length,
    totalMatched: items.length,
    shown: 0,
    tools: items.slice(0, limit).map((t) => ({
      name: t.name,
      description: (t.description || '').split('\n')[0].slice(0, 160),
    })),
  };

  // B 上额外查全量 238 个，避免"列表里没有 = 做不到"
  if (name === 'b' && filter && up.hasTool('FindTools')) {
    try {
      const found = await up.callTool('FindTools', { query: args.filter, limit }, 120000);
      result.fullRoster = textOf(found).slice(0, 6000);
    } catch (e) {
      result.fullRosterError = e.message;
    }
  }
  result.shown = result.tools.length;
  return ok(result);
}

async function handleCall(args) {
  const name = resolveName(args.server);
  if (!name) return fail(`未知 server：${args.server}`);
  precheckLock();
  const up = await ensureUpstream(name);
  if (active && active !== name) {
    const note = await deactivate(active);
    log(`切到 ${name}：${note || '上一个未在连接状态'}`);
  }
  await acquireLock(name);
  active = name;

  const retries = Number.isInteger(args.retries) ? args.retries : 0;
  const timeoutMs = args.timeoutMs || 900000;
  const started = Date.now();
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await callAnyTool(up, args.tool, args.arguments || {}, timeoutMs);
      audit({ event: 'call', server: name, tool: args.tool, ok: !(res && res.isError), ms: Date.now() - started, attempt });
      return res;
    } catch (e) {
      lastErr = e;
      audit({ event: 'call', server: name, tool: args.tool, ok: false, ms: Date.now() - started, attempt, error: e.message });
      if (attempt < retries) {
        const backoff = 1000 * Math.pow(2, attempt);
        log(`${name}.${args.tool} 第 ${attempt + 1} 次失败：${e.message}，${backoff}ms 后重试`);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }
  const near = up.tools
    .map((t) => t.name)
    .filter((n) => n.toLowerCase().includes(String(args.tool).toLowerCase().slice(0, 5)))
    .slice(0, 8);
  return fail(`调用 ${name}.${args.tool} 失败（已重试 ${retries} 次）：${lastErr.message}`, {
    相近的可见工具: near,
    提示: name === 'b' ? 'B 的全量 238 个工具可用 d_list_tools(filter) 查' : undefined,
  });
}

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

function pickServerForVersion(major) {
  if (!major) return 'b';
  if (major <= 19) return 'a';
  if (major >= 21 && upstreams.has('c') && upstreams.get('c').cfg.installed) return 'c';
  if (upstreams.has('b')) return 'b';
  return 'a';
}

/** B：Connect 是严格无参工具，传任何参数都会被 ArgDiagnosticTool 拦截 */
async function connectB(up, projectPath) {
  const connectRes = await up.callTool('Connect', {}, 600000);
  const out = { connect: textOf(connectRes).slice(0, 2000), opened: null };
  if (isToolFailure(connectRes)) {
    out.opened = { via: 'none', detail: 'Connect 失败，后续无法打开工程' };
    return out;
  }

  if (projectPath) {
    // B 的 OpenProject 参数名是 path，不是 projectPath
    const r = await up.callTool('OpenProject', { path: projectPath }, 900000);
    if (!isToolFailure(r)) {
      out.opened = { via: 'OpenProject', detail: textOf(r).slice(0, 2000) };
      return out;
    }
    const projName = path.basename(projectPath).replace(/\.(?:ap|als)\d+$/i, '');
    log(`OpenProject 失败（${textOf(r).slice(0, 120)}），回退 AttachToOpenProject("${projName}")`);
    const r2 = await up.callTool('AttachToOpenProject', { projectName: projName }, 300000);
    out.opened = {
      via: 'AttachToOpenProject',
      projectName: projName,
      ok: !isToolFailure(r2),
      detail: textOf(r2).slice(0, 2000),
    };
    return out;
  }

  // 没给路径：看看 TIA 里是否已经开着工程，唯一就自动附着
  try {
    const g = await up.callTool('GetProject', {}, 300000);
    const name = extractProjectName(textOf(g));
    if (name && name !== '-' && name.trim()) {
      const r = await up.callTool('AttachToOpenProject', { projectName: name }, 300000);
      out.opened = {
        via: 'AttachToOpenProject(自动)',
        projectName: name,
        ok: !isToolFailure(r),
        detail: textOf(r).slice(0, 2000),
      };
    } else {
      out.opened = {
        via: 'none',
        detail: 'TIA 里没有唯一可附着的工程；请传 project_file_path，或用 B 的 CreateProject/ScaffoldProject',
        raw: textOf(g).slice(0, 800),
      };
    }
  } catch (e) {
    out.opened = { via: 'none', detail: `GetProject 失败：${e.message}` };
  }
  return out;
}

async function handleConnect(args) {
  let major = normalizeVersion(args.version) || versionFromPath(args.project_file_path);
  let autoNote = null;

  if (!major) {
    try {
      const up = await ensureUpstream('a');
      const res = await up.callTool('detect_tia_installations', {}, 180000);
      const parsed = JSON.parse(textOf(res));
      const versions = (parsed.installed || [])
        .map((x) => parseInt(String(x.version || x.label), 10))
        .filter((n) => !Number.isNaN(n));
      major = versions.length ? Math.max(...versions) : 20;
      autoNote = `自动探测：${versions.join(', ')} → 取最高 V${major}`;
      log(autoNote);
    } catch (e) {
      major = 20;
      autoNote = `版本探测失败（${e.message}），默认 V${major}`;
    }
  } else if (versionFromPath(args.project_file_path)) {
    autoNote = `从工程后缀推断版本 V${major}`;
  }

  const target = await pickServerForVersion(major);
  const { notes } = await setActive(target, major);
  const up = upstreams.get(target);

  let detail;
  if (target === 'a') {
    const a = { version: `V${major}` };
    if (args.project_file_path) a.project_file_path = args.project_file_path;
    if (args.plc_name) a.plc_name = args.plc_name;
    detail = { via: 'connect_tia', detail: textOf(await up.callTool('connect_tia', a, 600000)).slice(0, 4000) };
  } else if (target === 'b') {
    detail = await connectB(up, args.project_file_path);
  } else {
    // C：没有 Connect，用 open_project / bind_project
    if (args.project_file_path) {
      const r = await up.callTool('open_project', { projectPath: args.project_file_path }, 900000);
      if (!isToolFailure(r)) {
        detail = { via: 'open_project', detail: textOf(r).slice(0, 3000) };
      } else {
        const r2 = await up.callTool('bind_project', { projectPath: args.project_file_path }, 300000);
        detail = { via: 'bind_project', ok: !isToolFailure(r2), detail: textOf(r2).slice(0, 3000) };
      }
    } else {
      const r = await up.callTool('bind_project', {}, 300000);
      detail = { via: 'bind_project', ok: !isToolFailure(r), detail: textOf(r).slice(0, 3000) };
    }
  }

  return ok({ routedTo: target, version: `V${major}`, autoNote, notes, result: detail });
}

async function handleTree() {
  if (!active) return fail('还没有活动上游，先 d_connect');
  const up = await ensureUpstream(active);
  const tool = { a: 'get_plc_inventory', b: 'GetProjectTree', c: 'browse_project_tree' }[active];
  if (!tool || !up.hasTool(tool)) return fail(`上游 ${active} 没有工程树工具`);
  return up.callTool(tool, {}, 300000);
}

async function handleCompile(args) {
  if (!active) return fail('还没有活动上游，先 d_connect');
  const up = await ensureUpstream(active);
  if (active === 'a') {
    const a = {};
    if (args.plc) a.plc_name = args.plc;
    return up.callTool('compile_plc', a, 900000);
  }
  if (active === 'b') {
    return up.callTool('CompileAndDiagnosePlc', { softwarePath: args.plc || 'PLC' }, 900000);
  }
  // C 的参数名是 plcName，不是 plc（StrictArgumentsTool 会拒绝未知参数）
  return up.callTool('compile_check', args.plc ? { plcName: args.plc } : {}, 900000);
}

async function handleSave() {
  if (!active) return fail('还没有活动上游，先 d_connect');
  const up = await ensureUpstream(active);
  if (active === 'a') return up.callTool('save_project', { confirm_save: true }, 600000);
  if (active === 'b') return up.callTool('SaveProject', {}, 600000);
  return up.callTool('save_project', {}, 600000);
}

async function handleOffline(args) {
  if (!active) return fail('还没有活动上游，先 d_connect');
  const up = await ensureUpstream(active);
  if (active === 'a') return up.callTool('go_offline', args.plc ? { plc_name: args.plc } : {}, 300000);
  if (active === 'b') return up.callTool('GoOffline', { softwarePath: args.plc || 'PLC' }, 300000);
  return fail('C 没有离线概念（它不提供在线/下载）');
}

async function handleDownload(args) {
  if (!active) return fail('还没有活动上游，先 d_connect');
  if (active === 'c') return fail('C 不提供下载能力，请切到 a 或 b');
  const missing = ['pc_interface_name', 'target_interface'].filter((k) => !args[k]);
  if (missing.length) {
    return fail(
      `缺少下载参数：${missing.join(', ')}。网卡和目标接口必须由用户明确给出，网关不会猜。` +
        `A 可用 list_windows_network_adapters 列网卡。`
    );
  }
  if (args.confirm !== true) return fail('下载是破坏性操作，必须显式传 confirm: true。');
  const up = await ensureUpstream(active);

  if (active === 'a') {
    const a = {
      pc_interface_type: args.pc_interface_type || 'PN/IE',
      pc_interface_name: args.pc_interface_name,
      target_interface: args.target_interface,
      confirm_download: true,
      // A 的 download_to_plc 默认拒绝真机下载（allow_physical_plc=false），必须显式打开
      allow_physical_plc: args.allow_physical_plc === true,
    };
    if (args.allow_cpu_stop === true) a.allow_cpu_stop = true;
    if (args.start_cpu_after_download === true) a.start_cpu_after_download = true;
    if (args.plc) a.plc_name = args.plc;
    const res = await up.callTool('download_to_plc', a, 1800000);
    if (isToolFailure(res)) {
      return fail(
        'A 的下载被拒绝。常见原因：未传 allow_physical_plc:true（A 默认不允许写真机），' +
          '或网卡/接口参数不匹配。',
        { upstream: textOf(res).slice(0, 3000) }
      );
    }
    return res;
  }

  // B：targetIpAddress 必须是 IP；pc_interface_type 不需要
  const b = {
    softwarePath: args.plc || 'PLC',
    pgPcInterface: args.pc_interface_name,
    targetIpAddress: args.target_interface,
  };
  const readiness = await callAnyTool(up, 'CheckDownloadReadiness', { softwarePath: b.softwarePath }, 300000);
  if (isToolFailure(readiness)) {
    return fail('下载前置检查未通过，已中止，不会调用 DownloadToPlc。', {
      readiness: textOf(readiness).slice(0, 3000),
    });
  }
  const dl = await callAnyTool(up, 'DownloadToPlc', b, 1800000);
  if (isToolFailure(dl)) {
    return fail('下载失败。', { readiness: textOf(readiness).slice(0, 1500), download: textOf(dl).slice(0, 4000) });
  }
  return ok({ readiness: textOf(readiness).slice(0, 3000), download: textOf(dl).slice(0, 6000) });
}

/* ------------------------------------------------------------------ */
/* 编译错误判定：结构化优先，正则兜底                                  */
/* ------------------------------------------------------------------ */

const ERROR_KEYS = new Set(['errorcount', 'error_count', 'totalerrorcount', 'total_error_count']);
const STATE_KEYS = new Set(['state', 'overallstate', 'status', 'result']);
const OK_KEYS = new Set(['ok', 'success', 'succeeded']);

/** 先整体 parse；失败再尝试截取最外层大括号段落 */
function parseLoose(text) {
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

async function handleFinish(args) {
  if (!active) return fail('还没有活动上游，先 d_connect');
  const requireZero = args.requireZeroErrors !== false;
  const steps = [];

  const offline = await handleOffline(args);
  steps.push({ step: 'offline', ok: !isToolFailure(offline), detail: textOf(offline).slice(0, 1500) });

  const compile = await handleCompile(args);
  const compileText = textOf(compile);
  const hasErr = compileHasErrors(compileText);
  // 编译结果里 success:false 是"编译有错"的正常语义，不能用 isToolFailure 判，否则会误判
  const compileFailed = !!(compile && compile.isError) || hasErr;
  steps.push({ step: 'compile', ok: !compileFailed, detail: compileText.slice(0, 4000) });

  if (requireZero && compileFailed) {
    steps.push({ step: 'save', ok: false, detail: '编译未通过，按规则不保存' });
    audit({ event: 'finish', ok: false, reason: 'compile-failed' });
    return ok({ finished: false, steps });
  }

  const save = await handleSave();
  steps.push({ step: 'save', ok: !isToolFailure(save), detail: textOf(save).slice(0, 1500) });
  const finished = steps.every((s) => s.ok);
  audit({ event: 'finish', ok: finished });
  return ok({ finished, steps });
}

/* ------------------------------------------------------------------ */
/* 块读写                                                              */
/* ------------------------------------------------------------------ */

const EXT_BY_FORMAT = { scl: '.scl', s7dcl: '.s7dcl', xml: '.xml', 'lad-spec': '.json' };

async function handleReadBlock(args) {
  if (!active) return fail('还没有活动上游，先 d_connect');
  const up = await ensureUpstream(active);
  const block = stripRoot(args.block);
  if (!block) return fail('缺少 block 参数（块名，如 Main 或 Group/Sub/Name）');
  const plc = args.plc || 'PLC';

  if (active === 'b') {
    return up.callTool('DescribeBlockLogic', { softwarePath: plc, blockPath: block }, 600000);
  }

  if (active === 'a') {
    const dir = ensureDir(path.join(OUTBOX_DIR, `${stamp()}_${slug(block)}`));
    const params = { target_directory: dir, block_names: [block] };
    if (args.format) params.export_format = args.format; // A 的默认是 simaticml，不要硬塞 xml
    if (args.plc) params.plc_name = args.plc;
    const res = await up.callTool('export_program_blocks', params, 600000);
    // 目录是本次调用专属的，直接递归读目录，不依赖上游返回文本的路径格式
    const files = [];
    try {
      for (const ent of fs.readdirSync(dir, { recursive: true, withFileTypes: true })) {
        if (!ent.isFile()) continue;
        // .s7res 必须一起带回：它和 .s7dcl 是配对的，缺了改不回去
        if (!/\.(xml|scl|s7dcl|s7res)$/i.test(ent.name)) continue;
        const full = path.join(ent.parentPath ?? ent.path ?? dir, ent.name);
        const txt = fs.readFileSync(full, 'utf8');
        files.push({ name: ent.name, path: full, bytes: txt.length, content: txt.slice(0, 120000) });
      }
    } catch (e) {
      log(`读导出目录失败：${e.message}`);
    }
    if (isToolFailure(res) && files.length === 0) {
      return fail('导出块失败（上游报错且目录里没有任何文件）', { upstream: textOf(res).slice(0, 2000) });
    }
    return ok({
      server: 'a',
      exportedTo: dir,
      upstreamResult: textOf(res).slice(0, 2000),
      files,
      note: files.length ? '已把导出目录里的块文件（含 .s7res）内容带回' : '目录里没有块文件，看 upstreamResult',
    });
  }

  return fail('C 的读块要用 plc_read(operations=[...])，形状较特殊，请用 d_call 指定参数');
}

async function handleWriteBlock(args) {
  if (!active) return fail('还没有活动上游，先 d_connect');
  const up = await ensureUpstream(active);
  // 剥掉 AI 可能照抄的"程序块/Program blocks"根容器前缀
  const block = stripRoot(args.block);
  const group = stripRoot(args.group);
  const format = args.format || 'scl';
  if (!block) return fail('缺少 block 参数');
  if (!EXT_BY_FORMAT[format]) return fail(`不支持的 format：${format}（可选 scl / s7dcl / xml / lad-spec）`);

  let content = args.content;
  if (!content && args.source_path) {
    try {
      content = fs.readFileSync(args.source_path, 'utf8').replace(/^\uFEFF/, '');
    } catch (e) {
      return fail(`读不到 source_path：${e.message}`);
    }
  }
  if (!content) return fail('缺少 content 或 source_path');
  const overwrite = args.overwrite !== false;

  /* ---- lad-spec：只有 A 支持 ---- */
  if (format === 'lad-spec') {
    if (active !== 'a') return fail('lad-spec 只有 A 支持（write_lad_block）。B/C 请改用 s7dcl。');
    let spec;
    try {
      spec = typeof content === 'string' ? JSON.parse(content) : content;
    } catch (e) {
      return fail(`lad-spec 不是合法 JSON：${e.message}`);
    }
    const plan = [
      {
        server: 'a',
        tool: 'write_lad_block',
        arguments: {
          spec,
          ...(args.plc ? { plc_name: args.plc } : {}),
          ...(group ? { target_folder_path: group } : {}),
          allow_overwrite: overwrite,
          confirm_write: true,
          compile_after: false,
        },
      },
    ];
    if (args.confirm !== true) return ok({ prepared: null, plan, note: '写入计划，确认后带 confirm:true 重放' });
    return runPlan(plan);
  }

  const safeBlock = slug(block);
  const dir = ensureDir(path.join(INBOX_DIR, `${stamp()}_${safeBlock}`));
  const fileName = `${safeBlock}${EXT_BY_FORMAT[format]}`;
  const filePath = path.join(dir, fileName);
  const written = writeBlockFile(filePath, content, format);

  let resFile = null;
  if (format === 's7dcl' && args.res_content) {
    const resPath = path.join(dir, `${safeBlock}.s7res`);
    resFile = writeBlockFile(resPath, args.res_content, 's7dcl');
  }

  const plan = [];

  if (active === 'a') {
    if (format === 'xml') {
      plan.push({
        server: 'a',
        tool: 'import_program_blocks',
        arguments: {
          source_path: filePath,
          ...(args.plc ? { plc_name: args.plc } : {}),
          ...(group ? { target_folder_path: group } : {}),
          confirm_import: true,
        },
      });
    } else {
      // SCL / S7DCL 源码文本走 write_program_blocks，它自带 overwrite 与外部源清理
      const isOb = /^(OB\d+|Main)$/i.test(String(block).trim());
      if (isOb && args.allow_ob_source !== true) {
        return fail(
          `A 的 write_program_blocks 默认拒绝用外部源写 OB（${block}）——会静默丢掉优化块访问属性。` +
            `确认要这么做就带 allow_ob_source: true；否则改用 format=lad-spec 或 xml。`
        );
      }
      plan.push({
        server: 'a',
        tool: 'write_program_blocks',
        arguments: {
          source_text: content,
          source_file_name: fileName,
          ...(args.plc ? { plc_name: args.plc } : {}),
          ...(group ? { target_folder_path: group } : {}),
          allow_overwrite: overwrite,
          cleanup_external_source: true,
          allow_ob_source: args.allow_ob_source === true,
          confirm_write: true,
        },
      });
    }
  } else if (active === 'b') {
    if (format === 's7dcl') {
      plan.push({
        server: 'b',
        tool: 'ImportFromDocuments',
        arguments: {
          softwarePath: args.plc || 'PLC',
          groupPath: group,
          importPath: dir,
          fileNameWithoutExtension: safeBlock,
          importOption: 'Override',
        },
      });
    } else if (format === 'scl') {
      // B 明确禁止把 OB1 放进 .scl 外部源：会和 CPU 自动生成的 OB1 冲突，整批原子回滚
      if (/^(OB1|Main)$/i.test(String(block).trim())) {
        return fail(
          'B 上不能用 .scl 外部源写 OB1/Main（会和 CPU 自动生成的 OB1 冲突，整批回滚）。' +
            '请改用 format=s7dcl，或把逻辑放进 FC/FB 再由 OB1 调用。'
        );
      }
      // 外部源流程：删同名外部源 → 导入 → 删已有同名块（否则不覆盖）→ 生成 → 移入分组 → 清理
      // 关键：ImportPlcExternalSource 的 groupPath 指的是**外部源文件夹**，不是程序块组。
      //       传程序块组进去会因为"外部源根下没有这个组"而失败，所以固定传 ''。
      //       块永远生成在 Program blocks 根下，要进分组必须另外调 MoveBlockToGroup。
      const softwarePath = args.plc || 'PLC';
      const blockPath = group ? `${group}/${block}` : String(block);
      plan.push(
        {
          server: 'b',
          tool: 'DeletePlcExternalSource',
          arguments: { softwarePath, externalSourceName: safeBlock },
          allowNotFound: true,
        },
        {
          server: 'b',
          tool: 'ImportPlcExternalSource',
          arguments: { softwarePath, groupPath: '', filePath },
        }
      );
      if (overwrite) {
        // GenerateBlocksFromExternalSource 不覆盖已有块（只更新时间戳，代码还是旧的），必须先删块。
        // 目标组里的删一次；若上次失败把块留在了根目录，再按裸名删一次（两次都容忍 NotFound）
        plan.push({
          server: 'b',
          tool: 'DeletePlcBlock',
          arguments: { softwarePath, blockPath, dryRun: false },
          allowNotFound: true,
        });
        if (group) {
          plan.push({
            server: 'b',
            tool: 'DeletePlcBlock',
            arguments: { softwarePath, blockPath: String(block), dryRun: false },
            allowNotFound: true,
          });
        }
      }
      plan.push({
        server: 'b',
        tool: 'GenerateBlocksFromExternalSource',
        arguments: { softwarePath, externalSourceName: safeBlock },
      });
      if (group) {
        // MoveBlockToGroup 内部走"导出→重导入"，而刚生成还没编译的块是 inconsistent，
        // Openness 会拒绝导出（真机实测：Inconsistent blocks ... cannot be exported）。
        // 所以必须先编译一次，再移动。
        plan.push({
          server: 'b',
          tool: 'CompileSoftware',
          arguments: { softwarePath },
        });
        // 生成出来的块在 Program blocks 根目录，必须显式移动；autoCreateGroup 让目标组不存在时自动建
        plan.push({
          server: 'b',
          tool: 'MoveBlockToGroup',
          arguments: {
            softwarePath,
            blockName: String(block),
            targetGroupPath: group,
            autoCreateGroup: true,
          },
        });
      }
      plan.push({
        server: 'b',
        tool: 'DeletePlcExternalSource',
        arguments: { softwarePath, externalSourceName: safeBlock },
        allowNotFound: true,
      });
    } else {
      return fail('B 上写 LAD 请用 format=s7dcl（S7DCL 文本），不要用 xml —— B 明确禁止手写 FlgNet XML。');
    }
  } else {
    return fail('C 写块需要先 plc_read 拿 contentHash，再 plc_write 带 expectedContentHash，请用 d_call 分两步做。');
  }

  if (args.confirm !== true) {
    return ok({
      prepared: written,
      resFile,
      plan,
      note:
        '这是写入计划，文件已按编码规则落盘。确认后带 confirm:true 重放。' +
        (format === 's7dcl' && !args.res_content
          ? ' 注意：s7dcl 若含标题/中文注释，需要同时提供 res_content 生成配对的 .s7res，否则导入会失败。'
          : ''),
    });
  }

  return runPlan(plan);
}

const NOT_FOUND_RE = /\bnot found\b|does not exist|未找到|不存在/i;
const NOT_NOT_FOUND_RE = /PLC software not found|No project is open|online mode|Ambiguous/i;

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

async function runPlan(plan) {
  const steps = [];
  for (const step of plan) {
    const up = upstreams.get(step.server);
    if (!up || !up.ready) {
      const tolerated = !!step.optional;
      steps.push({
        server: step.server,
        tool: step.tool,
        ok: false,
        optional: !!step.optional,
        ignored: tolerated,
        error: `上游 ${step.server} 未就绪`,
      });
      if (!tolerated) break;
      continue;
    }
    try {
      const res = await callAnyTool(up, step.tool, step.arguments, 900000);
      const text = textOf(res);
      const bad = isToolFailure(res);
      const ignored = bad && isTolerableFailure(step, text);
      steps.push({
        server: step.server,
        tool: step.tool,
        ok: !bad,
        optional: !!step.optional,
        ignored,
        output: text.slice(0, 4000),
      });
      audit({ event: 'write', server: step.server, tool: step.tool, ok: !bad, ignored });
      if (bad && !ignored) break;
    } catch (e) {
      const ignored = !!step.optional;
      steps.push({
        server: step.server,
        tool: step.tool,
        ok: false,
        optional: !!step.optional,
        ignored,
        error: e.message,
      });
      audit({ event: 'write', server: step.server, tool: step.tool, ok: false, ignored, error: e.message });
      if (!ignored) break;
    }
  }
  const effective = steps.filter((s) => !s.ignored);
  const done = steps.length === plan.length && effective.every((s) => s.ok);
  return ok({ executed: done, steps });
}

/* ------------------------------------------------------------------ */
/* MCP 服务端                                                          */
/* ------------------------------------------------------------------ */

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

const handlers = {
  d_status: handleStatus,
  d_versions: handleVersions,
  d_use: handleUse,
  d_list_tools: handleListTools,
  d_call: handleCall,
  d_connect: handleConnect,
  d_tree: handleTree,
  d_compile: handleCompile,
  d_save: handleSave,
  d_offline: handleOffline,
  d_download: handleDownload,
  d_finish: handleFinish,
  d_read_block: handleReadBlock,
  d_write_block: handleWriteBlock,
  d_doctor: handleDoctor,
};

async function handleMessage(msg) {
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;

  try {
    if (method === 'initialize') {
      send({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: PROTOCOL,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'tia-gateway-d', version: VERSION },
          instructions:
            '这是 TIA Portal 统一网关 D，背后是 A(v1.4.1) / B(v2.7.8) / C(Czarnak) 三套 MCP。' +
            '规则：先 d_status 看状态，再 d_connect 按版本自动路由（传工程路径会按 .ap20/.ap21 后缀推断版本）；' +
            '全量能力用 d_list_tools + d_call 透传，B 上不在 lite 档的工具会自动走 CallTool 转发。' +
            '同一时刻只允许一个网关进程连 TIA，锁被占用时会明确报错。' +
            '收尾固定用 d_finish（离线→编译 0 错→保存），编译判据是结构化的。' +
            '下载、删除、写在线值必须由用户明确给出参数，网关不会猜网卡/IP。',
        },
      });
      return;
    }
    if (method === 'notifications/initialized' || isNotification) return;
    if (method === 'tools/list') {
      send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
      return;
    }
    if (method === 'tools/call') {
      const name = params && params.name;
      const fn = handlers[name];
      if (!fn) {
        send({
          jsonrpc: '2.0',
          id,
          result: { content: [{ type: 'text', text: `未知工具：${name}` }], isError: true },
        });
        return;
      }
      const result = await fn(params.arguments || {});
      send({ jsonrpc: '2.0', id, result });
      return;
    }
    if (method === 'ping') {
      send({ jsonrpc: '2.0', id, result: {} });
      return;
    }
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `未实现：${method}` } });
  } catch (e) {
    log(`处理 ${method} 出错：${e.message}`);
    send({
      jsonrpc: '2.0',
      id,
      result: { content: [{ type: 'text', text: `网关错误：${e.message}` }], isError: true },
    });
  }
}

let buf = '';

function startServer() {
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        log('收到非 JSON 行，忽略');
        continue;
      }
      handleMessage(msg);
    }
  });

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  // Windows 上宿主关闭 stdin 不会发信号，只会让管道 EOF。
  // 不处理的话：子进程句柄还活着 → 事件循环不退出 → 心跳一直续锁 → 整个机器再也连不上 TIA
  process.stdin.on('end', shutdown);
  process.stdin.on('close', shutdown);
  process.stdin.on('error', shutdown);
  process.on('exit', () => {
    releaseLock();
    for (const [, up] of upstreams) up.stop();
  });
}

function shutdown() {
  log('关闭，回收上游进程');
  releaseLock();
  for (const [, up] of upstreams) up.stop();
  process.exit(0);
}

if (require.main === module) {
  startServer();
} else {
  // 被 require 时只导出纯函数，供单元测试用，不挂 stdin
  module.exports = { compileHasErrors, slug, versionFromPath, pickServerForVersion, writeBlockFile, isToolFailure, extractProjectName, stripRoot, isTolerableFailure };
}
