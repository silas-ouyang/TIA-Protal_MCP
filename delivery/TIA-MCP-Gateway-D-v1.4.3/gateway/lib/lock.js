'use strict';
/*
 * gateway/lib/lock.js — 跨进程独占锁（原子创建 + 心跳续期）与运行期目录 / 审计日志 / 恢复标记管理。
 *
 * 职责：
 *  - createLockManager(opts)：按 D_RUNTIME_DIR 或 baseDir 隔离运行时目录，
 *    封装 active.lock 抢占/预检/所有权校验/心跳续期/释放，pending_recovery.json 读写删，
 *    以及 d.log 审计日志轮转；
 *  - 锁失去时通过 opts.onLockLost 回调通知调用方，不直接强绑外部全局变量。
 */

const fs = require('fs');
const path = require('path');
const { GATEWAY_DIR, log: defaultLog, ensureDir } = require('./utils');

const DEFAULT_LOCK_TTL_MS = 5 * 60 * 1000;
const DEFAULT_LOCK_HEARTBEAT_MS = 30 * 1000;
const DEFAULT_AUDIT_MAX_BYTES = 5 * 1024 * 1024;
const RENAME_RETRIES = 3;
const RENAME_RETRY_MS = 10;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SLEEP_SAB = new Int32Array(new SharedArrayBuffer(4));

/** 同步短睡（用于 Windows renameSync 瞬时文件锁重试，不阻塞为自旋死循环） */
function sleepSync(ms) {
  try {
    Atomics.wait(SLEEP_SAB, 0, 0, ms);
  } catch {
    const end = Date.now() + ms;
    while (Date.now() < end) {}
  }
}

/** 写临时文件并带 3x10ms 重试地 rename；必要时回退原位覆写，避免先 unlink 开无锁空窗 */
function atomicWriteFileSync(targetPath, content, { fallbackInPlace = true } = {}) {
  const tmp = `${targetPath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, content, 'utf8');
    let lastErr = null;
    for (let i = 0; i <= RENAME_RETRIES; i++) {
      try {
        fs.renameSync(tmp, targetPath);
        return;
      } catch (e) {
        lastErr = e;
        if (i < RENAME_RETRIES) sleepSync(RENAME_RETRY_MS);
      }
    }
    if (fallbackInPlace) {
      fs.writeFileSync(targetPath, content, 'utf8');
      return;
    }
    throw lastErr;
  } finally {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {}
  }
}

function createLockManager(opts = {}) {
  const baseDir = opts.baseDir ? path.resolve(opts.baseDir) : GATEWAY_DIR;
  const RUNTIME_DIR = opts.runtimeDir
    ? path.resolve(opts.runtimeDir)
    : process.env.D_RUNTIME_DIR
      ? path.resolve(process.env.D_RUNTIME_DIR)
      : path.join(baseDir, 'runtime');
  const INBOX_DIR = path.join(RUNTIME_DIR, 'inbox');
  const OUTBOX_DIR = path.join(RUNTIME_DIR, 'outbox');
  const LOG_PATH = path.join(RUNTIME_DIR, 'd.log');
  const LOCK_PATH = path.join(RUNTIME_DIR, 'active.lock');
  const PENDING_RECOVERY_PATH = path.join(RUNTIME_DIR, 'pending_recovery.json');

  const LOCK_TTL_MS = opts.lockTtlMs || DEFAULT_LOCK_TTL_MS;
  const LOCK_HEARTBEAT_MS = opts.heartbeatMs || DEFAULT_LOCK_HEARTBEAT_MS;
  const AUDIT_MAX_BYTES = opts.auditMaxBytes || DEFAULT_AUDIT_MAX_BYTES;
  const onLockLost = typeof opts.onLockLost === 'function' ? opts.onLockLost : null;
  const log = typeof opts.log === 'function' ? opts.log : defaultLog;

  let heartbeatTimer = null;

  const LOCK_READ_RETRIES = 3;

  function readLockDetail({ retryEnoent = false } = {}) {
    let lastStatus = 'missing';
    let lastError = null;
    for (let i = 0; i <= LOCK_READ_RETRIES; i++) {
      let raw;
      let stat = null;
      try {
        stat = fs.statSync(LOCK_PATH);
        raw = fs.readFileSync(LOCK_PATH, 'utf8');
      } catch (e) {
        lastError = e;
        if (e && e.code === 'ENOENT') {
          lastStatus = 'missing';
          if (retryEnoent && i < LOCK_READ_RETRIES) {
            sleepSync(RENAME_RETRY_MS);
            continue;
          }
          return { status: 'missing', lock: null, stat: null, error: null };
        }
        lastStatus = 'unreadable';
        if (i < LOCK_READ_RETRIES) {
          sleepSync(RENAME_RETRY_MS);
          continue;
        }
        return { status: 'unreadable', lock: null, stat: null, error: e };
      }
      if (!raw || !raw.trim()) {
        lastStatus = 'empty';
        if (i < LOCK_READ_RETRIES) {
          sleepSync(RENAME_RETRY_MS);
          continue;
        }
        return { status: 'empty', lock: null, stat, error: null };
      }
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return { status: 'ok', lock: parsed, stat, error: null };
        }
        lastStatus = 'corrupt';
      } catch (e) {
        lastError = e;
        lastStatus = 'corrupt';
      }
      if (i < LOCK_READ_RETRIES) {
        sleepSync(RENAME_RETRY_MS);
      }
    }
    return { status: lastStatus, lock: null, stat: null, error: lastError };
  }

  function readLock(readOpts) {
    const detail = readLockDetail(readOpts);
    return detail.status === 'ok' ? detail.lock : null;
  }

  function pidAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return false;
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

  /** 原子替换：写临时文件并短重试 rename，再退回原位写，尽量减少 Windows O_TRUNC 窗口 */
  function writeLockAtomic(server) {
    const payload = JSON.stringify({ pid: process.pid, server, ts: Date.now() });
    try {
      atomicWriteFileSync(LOCK_PATH, payload, { fallbackInPlace: true });
    } catch {}
  }

  /** 只读预检：在拉起上游之前先看有没有别的活进程占着，避免白起一个子进程再报错 */
  function precheckLock() {
    const detail = readLockDetail();
    if (detail.status === 'ok') {
      const cur = detail.lock;
      if (cur.pid !== process.pid && !lockIsStale(cur)) {
        throw new Error(
          `另一个网关实例（pid ${cur.pid}，上游 ${cur.server}）正在占用 TIA。` +
            `同一时刻只能有一个宿主连 TIA，请先结束那边的会话。`
        );
      }
    } else if (detail.status !== 'missing' && !lockIsStale(null)) {
      throw new Error('另一个网关实例正在写入独占锁（active.lock 瞬时占位），请稍后重试。');
    }
  }

  function notifyLockLost(cur) {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (onLockLost) {
      try {
        onLockLost(cur);
      } catch {}
    }
  }

  /** 校验当前进程仍然持有独占锁，避免休眠/阻塞超 TTL 被接管后继续发指令到 TIA */
  function ensureLockOwnership() {
    const detail = readLockDetail({ retryEnoent: true });
    if (detail.status !== 'ok' || detail.lock.pid !== process.pid) {
      const cur = detail.status === 'ok' ? detail.lock : null;
      notifyLockLost(cur);
      throw new Error(
        cur
          ? `当前独占锁已被另一个网关实例（pid ${cur.pid}，上游 ${cur.server}）接管，会话已失效，请先结束对方会话后重新 d_connect。`
          : '当前独占锁已丢失（active.lock 不存在），请重新 d_connect 或 d_use。'
      );
    }
  }

  /**
   * 原子抢占：O_EXCL 创建 + 过期锁用 rename 接管 + 共享冲突重试。
   * 任何别的活进程（无论用哪个上游）都拒绝 —— 两个网关同时连 TIA 一定会抢会话。
   */
  async function acquireLock(server) {
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
    for (let attempt = 0; attempt < 8; attempt++) {
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
        const detail = readLockDetail({ retryEnoent: true });
        if (detail.status === 'missing') {
          await sleep(20);
          continue;
        }
        if (detail.status === 'ok') {
          const cur = detail.lock;
          if (cur.pid === process.pid) {
            writeLockAtomic(server);
            startHeartbeat();
            return;
          }
          if (!lockIsStale(cur)) {
            throw new Error(
              `另一个网关实例（pid ${cur.pid}，上游 ${cur.server}）正在占用 TIA。` +
                `同一时刻只能有一个宿主连 TIA，请先结束那边的会话（锁 ${Math.round(LOCK_TTL_MS / 60000)} 分钟无心跳过期）。`
            );
          }
        } else if (!lockIsStale(null)) {
          // 刚创建的空锁 / 瞬时可读冲突，等待写入方落盘后再判定
          await sleep(60);
          continue;
        }
        // 已确认是过期锁或陈旧损坏文件：用 rename 抢走，同一时刻只有一个人成功
        const stale = `${LOCK_PATH}.stale.${process.pid}`;
        try {
          fs.renameSync(LOCK_PATH, stale);
          fs.unlinkSync(stale);
        } catch {}
        await sleep(30);
      }
    }
    throw new Error('抢锁失败：多次重试仍未获得锁');
  }

  function startHeartbeat() {
    if (heartbeatTimer) return;
    heartbeatTimer = setInterval(() => {
      const detail = readLockDetail({ retryEnoent: true });
      if (detail.status === 'ok' && detail.lock.pid === process.pid) {
        writeLockAtomic(detail.lock.server); // 原子替换，不会出现 0 字节窗口
      } else if (
        detail.status === 'unreadable' ||
        ((detail.status === 'empty' || detail.status === 'corrupt') && !lockIsStale(null))
      ) {
        // 瞬时读锁/空文件竞争窗口：不立即误杀自身活跃会话，留待下轮或工具调用校验
        log(`心跳读取独占锁遇到瞬时状态（${detail.status}），暂缓注销`);
      } else {
        log('心跳检测到独占锁已丢失，自动注销当前会话状态');
        notifyLockLost(detail.status === 'ok' ? detail.lock : null);
      }
    }, LOCK_HEARTBEAT_MS);
    heartbeatTimer.unref && heartbeatTimer.unref();
  }

  function releaseLock() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    const detail = readLockDetail({ retryEnoent: true });
    if (detail.status === 'ok' && detail.lock && detail.lock.pid === process.pid) {
      try {
        // 删前再次核实文件仍归当前进程，避免 TTL 边缘误删新接管的外部有效锁
        const latest = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));
        if (latest && latest.pid === process.pid) {
          fs.unlinkSync(LOCK_PATH);
        }
      } catch {}
    }
  }

  function readPendingRecovery() {
    let raw;
    try {
      raw = fs.readFileSync(PENDING_RECOVERY_PATH, 'utf8');
    } catch (e) {
      if (e && e.code === 'ENOENT') return null;
      sleepSync(RENAME_RETRY_MS);
      try {
        raw = fs.readFileSync(PENDING_RECOVERY_PATH, 'utf8');
      } catch (e2) {
        if (e2 && e2.code === 'ENOENT') return null;
        return { corrupt: true, path: PENDING_RECOVERY_PATH, error: e2.message };
      }
    }
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object'
        ? parsed
        : { corrupt: true, path: PENDING_RECOVERY_PATH, error: 'non-object JSON' };
    } catch (e) {
      // 损坏时 fail-closed，避免误放行 d_save / d_finish
      return { corrupt: true, path: PENDING_RECOVERY_PATH, error: e.message };
    }
  }

  function writePendingRecovery(entry) {
    ensureDir(RUNTIME_DIR);
    const payload = {
      ts: new Date().toISOString(),
      pid: process.pid,
      ...(entry && typeof entry === 'object' ? entry : { detail: String(entry || '') }),
    };
    atomicWriteFileSync(PENDING_RECOVERY_PATH, JSON.stringify(payload, null, 2), { fallbackInPlace: true });
    audit({
      event: 'pending_recovery_set',
      block: payload.block || null,
      phase: payload.phase || null,
      reason: payload.reason || null,
    });
    return payload;
  }

  function clearPendingRecovery(reason) {
    const prev = readPendingRecovery();
    if (!prev) return { cleared: false, existed: false };
    const delTmp = `${PENDING_RECOVERY_PATH}.del.${process.pid}.${Date.now()}`;
    let removed = false;
    for (let i = 0; i <= RENAME_RETRIES; i++) {
      try {
        fs.renameSync(PENDING_RECOVERY_PATH, delTmp);
        try {
          fs.unlinkSync(delTmp);
        } catch {}
        removed = true;
        break;
      } catch (e) {
        if (e && e.code === 'ENOENT') {
          removed = true;
          break;
        }
        if (i < RENAME_RETRIES) sleepSync(RENAME_RETRY_MS);
      }
    }
    if (!removed) {
      try {
        fs.unlinkSync(PENDING_RECOVERY_PATH);
        removed = true;
      } catch (e) {
        if (e && e.code === 'ENOENT') removed = true;
        else throw e;
      }
    }
    audit({
      event: 'pending_recovery_cleared',
      reason: reason || 'resolved',
      block: prev && prev.block ? prev.block : null,
    });
    return { cleared: removed, existed: true, reason: reason || 'resolved', previous: prev };
  }

  function audit(entry) {
    try {
      ensureDir(RUNTIME_DIR);
      try {
        const st = fs.statSync(LOG_PATH);
        if (st.size > AUDIT_MAX_BYTES) fs.renameSync(LOG_PATH, LOG_PATH + '.1');
      } catch {}
      fs.appendFileSync(
        LOG_PATH,
        JSON.stringify({ ts: new Date().toISOString(), pid: process.pid, ...entry }) + '\n',
        'utf8'
      );
    } catch {}
  }

  return {
    RUNTIME_DIR,
    OUTBOX_DIR,
    INBOX_DIR,
    LOG_PATH,
    LOCK_PATH,
    PENDING_RECOVERY_PATH,
    audit,
    readLock,
    pidAlive,
    lockFileAgeMs,
    lockIsStale,
    writeLockAtomic,
    precheckLock,
    ensureLockOwnership,
    acquireLock,
    startHeartbeat,
    releaseLock,
    readPendingRecovery,
    writePendingRecovery,
    clearPendingRecovery,
  };
}

module.exports = { createLockManager };
