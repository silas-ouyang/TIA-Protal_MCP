'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_TIA_MCP_EXE = path.join(
  REPO_ROOT,
  'delivery',
  'TIA-MCP-Gateway-D-v1.4.3',
  'upstreams',
  'b',
  'runtime',
  'v20',
  'TiaMcpServer.exe'
);
const DEFAULT_PLCSIM_BRIDGE_EXE = path.join(
  REPO_ROOT,
  'plcsim-adv-bridge',
  'bin',
  'plcsim-adv-bridge.exe'
);
const GATEWAY_LOCK_PATH = path.join(
  REPO_ROOT,
  'delivery',
  'TIA-MCP-Gateway-D-v1.4.3',
  'gateway',
  'runtime',
  'active.lock'
);

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e && e.code === 'EPERM';
  }
}

function assertNoActiveGatewayLock() {
  if (!fs.existsSync(GATEWAY_LOCK_PATH)) return;
  try {
    const raw = fs.readFileSync(GATEWAY_LOCK_PATH, 'utf8');
    const lock = JSON.parse(raw);
    const pid = lock && Number(lock.pid);
    const expiresAt = lock && Number(lock.expiresAt || lock.expireAt || 0);
    const notExpired = !expiresAt || Date.now() < expiresAt;
    if (isPidAlive(pid) && notExpired && pid !== process.pid) {
      throw new Error(
        `Refusing to contend with active Gateway lock (${GATEWAY_LOCK_PATH}, pid=${pid}). Finish or release Gateway session first.`
      );
    }
  } catch (err) {
    if (/Refusing to contend/.test(err.message)) throw err;
  }
}

function extractToolPayload(res, toolName) {
  if (!res) {
    throw new Error(`${toolName}: empty MCP tool result`);
  }
  const textParts = Array.isArray(res.content)
    ? res.content.filter((c) => c && c.type === 'text' && typeof c.text === 'string').map((c) => c.text)
    : [];
  const rawText = textParts.join('\n').trim();
  let parsed = null;
  if (rawText.startsWith('{') || rawText.startsWith('[')) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = null;
    }
  }
  if (res.isError) {
    const detail = parsed && (parsed.error || parsed.message || parsed.Message)
      ? (parsed.error || parsed.message || parsed.Message)
      : rawText || JSON.stringify(res);
    const err = new Error(`${toolName} failed: ${detail}`);
    err.toolResult = parsed || res;
    throw err;
  }
  return parsed !== null ? parsed : { rawText, res };
}

class McpStdioClient {
  constructor({ command, args = [], env = {}, name = 'mcp-client', stderrLog = null }) {
    this.command = command;
    this.args = args;
    this.env = env;
    this.name = name;
    this.stderrLog = stderrLog;
    this.proc = null;
    this.seq = 1;
    this.buf = '';
    this.pending = new Map();
    this.closed = false;
  }

  async start(initTimeoutMs = 30000) {
    if (!fs.existsSync(this.command)) {
      throw new Error(`${this.name}: executable not found at ${this.command}`);
    }
    this.proc = spawn(this.command, this.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, ...this.env },
    });

    this.proc.stdout.on('data', (chunk) => {
      this.buf += chunk.toString('utf8');
      let nl;
      while ((nl = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, nl).trim();
        this.buf = this.buf.slice(nl + 1);
        if (!line || line[0] !== '{') continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.id === undefined || msg.id === null) continue;
        const h = this.pending.get(msg.id);
        if (!h) continue;
        clearTimeout(h.timer);
        this.pending.delete(msg.id);
        if (msg.error) {
          h.rej(new Error(`${this.name} RPC ${h.method} error: ${msg.error.message || JSON.stringify(msg.error)}`));
        } else {
          h.res(msg.result);
        }
      }
    });

    this.proc.stderr.on('data', (chunk) => {
      if (typeof this.stderrLog === 'function') {
        this.stderrLog(chunk.toString('utf8'));
      }
    });

    this.proc.on('exit', (code, signal) => {
      this.closed = true;
      for (const [id, h] of this.pending.entries()) {
        clearTimeout(h.timer);
        h.rej(new Error(`${this.name} exited unexpectedly (code=${code}, signal=${signal}) while waiting for ${h.method}`));
        this.pending.delete(id);
      }
    });

    this.proc.on('error', (err) => {
      this.closed = true;
      for (const [id, h] of this.pending.entries()) {
        clearTimeout(h.timer);
        h.rej(err);
        this.pending.delete(id);
      }
    });

    const init = await this.request(
      'initialize',
      {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'tia-plcsim-e2e', version: '1.0.0' },
      },
      initTimeoutMs
    );
    this.notify('notifications/initialized', {});
    return init;
  }

  request(method, params, timeoutMs = 60000) {
    if (!this.proc || this.closed) {
      return Promise.reject(new Error(`${this.name} is not running`));
    }
    const id = this.seq++;
    return new Promise((res, rej) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rej(new Error(`${this.name} timeout (${timeoutMs}ms) on ${method}`));
      }, timeoutMs);
      this.pending.set(id, { res, rej, timer, method });
      try {
        this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        rej(err);
      }
    });
  }

  notify(method, params) {
    if (!this.proc || this.closed) return;
    try {
      this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
    } catch {}
  }

  async callTool(name, args = {}, timeoutMs = 120000) {
    const raw = await this.request('tools/call', { name, arguments: args }, timeoutMs);
    return extractToolPayload(raw, name);
  }

  async close(graceMs = 3000) {
    if (!this.proc || this.closed) return;
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        try {
          this.proc.kill('SIGKILL');
        } catch {}
        resolve();
      }, graceMs);
      this.proc.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      try {
        this.proc.stdin.end();
      } catch {
        clearTimeout(timer);
        resolve();
      }
    });
  }
}

module.exports = {
  REPO_ROOT,
  DEFAULT_TIA_MCP_EXE,
  DEFAULT_PLCSIM_BRIDGE_EXE,
  assertNoActiveGatewayLock,
  McpStdioClient,
};
