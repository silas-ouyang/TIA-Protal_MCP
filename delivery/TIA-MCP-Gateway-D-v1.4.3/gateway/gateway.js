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
 * 模块结构（1+5 零第三方依赖）：
 *  - gateway.js       薄入口：状态持有（active/upstreams/callQueue）、TOOLS、轻量处理器与 MCP 调度
 *  - lib/utils.js     无状态常量与纯函数
 *  - lib/upstreams.js HTTP / stdio 上游客户端与进程树回收
 *  - lib/lock.js      跨进程独占锁（active.lock）与运行期目录 / 审计日志
 *  - lib/connect.js   环境体检、版本探测与连接路由
 *  - lib/blocks.js    块读写与多步计划执行器
 */

const {
  PROTOCOL,
  VERSION,
  CONFIG_PATH,
  config,
  log,
  textOf,
  ok,
  fail,
  isToolFailure,
  parseLoose,
  compileHasErrors,
  slug,
  versionFromPath,
  pickServerForVersion,
  writeBlockFile,
  collectBlockFiles,
  extractProjectName,
  stripRoot,
  normalizeBlockTarget,
  resolveConnectVersion,
  isTolerableFailure,
} = require('./lib/utils');
const { buildUpstream, resolveName, probePort8000 } = require('./lib/upstreams');
const { createLockManager } = require('./lib/lock');
const {
  createConnectHandlers,
  probeLocalTia,
  resolveAutoVersion,
  routeCandidates,
  isBInfraFallbackError,
  setProbeLocalTiaMock,
  resetProbeLocalTiaCache,
} = require('./lib/connect');
const {
  createBlockHandlers,
  parseSclDeclarations,
  findBlockInHierarchy,
  decideBackupPolicy,
  checkSclCompileDiagnostics,
  isEngineeringNotSupportedError,
} = require('./lib/blocks');

/* ------------------------------------------------------------------ */
/* 网关状态与锁管理器                                                  */
/* ------------------------------------------------------------------ */

const upstreams = new Map();
for (const [name, cfg] of Object.entries(config.upstreams || {})) {
  const up = buildUpstream(name, cfg);
  if (up) upstreams.set(name, up);
}

let active = null;
let callQueue = Promise.resolve();

const lockManager = createLockManager({
  baseDir: __dirname,
  onLockLost: () => {
    active = null;
    for (const [, up] of upstreams) {
      if (up && (up.ready || (up.isManagedRunning && up.isManagedRunning()))) up.stop();
    }
  },
});

const {
  RUNTIME_DIR,
  OUTBOX_DIR,
  INBOX_DIR,
  audit,
  readLock,
  lockIsStale,
  precheckLock,
  ensureLockOwnership,
  acquireLock,
  releaseLock,
  readPendingRecovery,
  writePendingRecovery,
  clearPendingRecovery,
} = lockManager;

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

async function deactivate(name, timeoutMs = 120000) {
  const up = upstreams.get(name);
  if (!up || !up.ready) return null;
  if (up.external) return `${name} 为外部接管会话，跳过断开/停进程`;
  const disconnectTool = { a: 'disconnect_tia', b: 'Disconnect', c: 'close_project' }[name];
  if (!disconnectTool || !up.hasTool(disconnectTool)) return null;
  try {
    const args = name === 'a' ? { close_portal: false } : {};
    await up.callTool(disconnectTool, args, timeoutMs);
    return `${name}.${disconnectTool} 已断开`;
  } catch (e) {
    return `${name}.${disconnectTool} 断开失败：${e.message}`;
  }
}

/** 先只读预检锁、再启动、最后抢锁；启动或抢锁失败不会留下锁，也不会留孤儿进程 */
async function setActive(name, version) {
  precheckLock();
  const existing = upstreams.get(name);
  const wasReady = !!(existing && existing.ready);
  const up = await ensureUpstream(name, version);
  const notes = [];
  try {
    if (active && active !== name) {
      const prev = active;
      active = null;
      const n = await deactivate(prev);
      if (n) notes.push(n);
    }
    await acquireLock(name);
  } catch (e) {
    if (!wasReady && (up.ready || (up.isManagedRunning && up.isManagedRunning()))) up.stop();
    throw e;
  }
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
      '一次性体检：独占锁状态、pending_recovery 状态、端口 8000 守卫、零进程注册表探测已装 TIA 版本、Openness 组权限、B/C 运行时。默认快速零拉起，传 deep:true 才实起 A。',
    inputSchema: {
      type: 'object',
      properties: {
        deep: { type: 'boolean', description: '是否真正启动 A 进行深探（默认 false）' },
        refresh: { type: 'boolean', description: '是否跳过 60s 本地探测缓存强刷' },
        with_server_info: { type: 'boolean', description: '端口 8000 若被 MCP 占用，是否探测其 serverInfo（配对 DELETE 清理会话）' },
        clear_pending_recovery: { type: 'boolean', description: '人工确认已从备份 XML 恢复后，清除 pending_recovery.json 锁定' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'd_versions',
    description: '零进程探测本机安装了哪些 TIA Portal 版本（优先注册表/PublicAPI/运行进程），并给出各版本可用的上游（A/B/C）。',
    inputSchema: {
      type: 'object',
      properties: {
        refresh: { type: 'boolean', description: '是否跳过 60s 本地探测缓存强刷' },
      },
      additionalProperties: false,
    },
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
      '按版本自动选上游并连接 TIA。V15–V19 走 A；V20/V21 优先 B，B 启动/Openness 基础设施不可用且未进入 OpenProject 时自动保锁回落 A。传 project_file_path 自动推断版本并打开/附着工程。',
    inputSchema: {
      type: 'object',
      properties: {
        version: { type: 'string', description: 'auto | 16 | 20 | 21 | V20 …' },
        project_file_path: { type: 'string' },
        plc_name: { type: 'string' },
        fallback: { type: 'boolean', description: 'B 基础设施不可用时是否自动回落 A（默认 true）' },
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
      '读一个块的逻辑。B 默认用 DescribeBlockLogic；传 format=s7dcl 时自动定位子组并导出读取，若为 SCL/混合块且 V20 不支持则默认报错引导改用 xml（或传 fallback_to_xml:true 回退 XML）；A 走导出到独立目录再整目录读回。',
    inputSchema: {
      type: 'object',
      properties: {
        block: { type: 'string', description: '块名或 Group/Sub/Name' },
        group: { type: 'string', description: '可选：块所在分组路径（未传且 B 走 s7dcl 时会自动检索层次树）' },
        plc: { type: 'string', description: 'PLC 软件路径，默认 PLC' },
        format: { type: 'string', description: '导出格式：A 默认 simaticml（可传 xml）；B 默认逻辑骨架，传 s7dcl 或 xml 则导出文件读回' },
        fallback_to_xml: { type: 'boolean', description: 'B 传 format=s7dcl 命中 EngineeringNotSupportedException 时是否回退 ExportBlock(xml)，默认 false' },
      },
      required: ['block'],
      additionalProperties: false,
    },
  },
  {
    name: 'd_write_block',
    description:
      '写一个块。网关按博途编码规则落盘（.scl 含中文加 BOM、.s7dcl/.s7res/.xml 一律 BOM）。B 侧 .scl confirm:true 走事务保护（声明名校验+XML 备份+CompileAndDiagnosePlc 编译门+失败自动 XML 回滚）。默认只返回计划，confirm:true 才真正写入。',
    inputSchema: {
      type: 'object',
      properties: {
        block: { type: 'string', description: '块名或 Group/Sub/Name' },
        format: { type: 'string', enum: ['scl', 's7dcl', 'xml', 'lad-spec'] },
        content: { type: 'string', description: '块源码文本' },
        source_path: { type: 'string', description: '或者给一个已有文件的绝对路径' },
        res_content: { type: 'string', description: 's7dcl 的多语言资源文件内容（含标题/中文注释时必须给）' },
        plc: { type: 'string' },
        group: { type: 'string', description: '目标块组路径' },
        overwrite: { type: 'boolean', description: '覆盖已存在的块，默认 true' },
        allow_ob_source: {
          type: 'boolean',
          description: 'A 上允许用外部源写 OB（默认 false，A 会拒绝，因为会静默丢优化块访问属性）',
        },
        allow_unbacked_overwrite: {
          type: 'boolean',
          description: 'B 上旧块 IsConsistent=false 无法导出备份时，是否显式允许无备份强制覆盖（默认 false，fail-closed）',
        },
        allow_multi_block: {
          type: 'boolean',
          description: '单份 .scl 含多个顶层块/TYPE 声明时是否允许写入（默认 false）',
        },
        on_compile_error: {
          type: 'string',
          enum: ['rollback', 'keep'],
          description: 'B 侧 .scl 编译门发现目标块报错时的处置：rollback（默认自动回滚原块）或 keep（保留新块）',
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
    description: '保存工程（A: save_project / B: SaveProject / C: save_project）。若存在 pending_recovery.json 默认阻断以免覆盖磁盘旧块。',
    inputSchema: {
      type: 'object',
      properties: {
        allow_dirty_save: { type: 'boolean', description: '存在未恢复块事务时是否强制保存（默认 false）' },
        clear_pending_recovery: { type: 'boolean', description: '保存前先清除 pending_recovery.json（仅在已手工恢复后使用）' },
      },
      additionalProperties: false,
    },
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
        allow_cpu_stop: { type: 'boolean', description: 'A/B：允许下载时停机（B 对应 stopBeforeDownload）' },
        start_cpu_after_download: { type: 'boolean', description: 'A/B：下载后启动 CPU（B 对应 startAfterDownload）' },
        confirm: { type: 'boolean', description: '必须显式 true 才会真正下载' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'd_finish',
    description:
      '收尾三连：转离线 → 编译（要求 0 错）→ 保存。无人值守流程的固定收尾动作，编译判据按结构化字段解析，任一步失败（或存在 pending_recovery.json 未清理）会停在原地并报告。',
    inputSchema: {
      type: 'object',
      properties: {
        plc: { type: 'string' },
        requireZeroErrors: { type: 'boolean', description: '默认 true，编译有错则不保存' },
        allow_dirty_save: { type: 'boolean', description: '存在未恢复块事务时是否强制允许继续保存（默认 false）' },
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
      managed: up.isManagedRunning ? up.isManagedRunning() : up.cfg.kind === 'http' ? !!up.child && !up.external : !!up.proc,
      external: !!up.external,
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
    lock: lock ? { pid: lock.pid, server: lock.server, mine: lock.pid === process.pid, stale: lockIsStale(lock) } : null,
    pendingRecovery: readPendingRecovery(),
    upstreams: rows,
    config: CONFIG_PATH,
  };
}

async function handleStatus() {
  return ok(statusSnapshot());
}

async function handleUse(args) {
  const name = resolveName(args.server, upstreams);
  if (!name) return fail(`未知 server：${args.server}`);
  const { notes } = await setActive(name);
  return ok({ active: name, notes, status: statusSnapshot() });
}

async function handleListTools(args = {}) {
  const name = resolveName(args.server, upstreams);
  if (!name) return fail(`未知 server：${args.server}`);
  let up;
  try {
    precheckLock();
    up = await ensureUpstream(name);
  } catch (e) {
    return fail(`列出 ${name} 工具失败：${e.message}`, { server: name });
  }
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
    active: active === name,
    started: !!up.ready,
    external: !!up.external,
    liteTotal: up.tools.length,
    totalMatched: items.length,
    shown: 0,
    tools: items.slice(0, limit).map((t) => ({
      name: t.name,
      description: (t.description || '').split('\n')[0].slice(0, 160),
      ...(t.annotations ? { annotations: t.annotations } : {}),
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
  const name = resolveName(args.server, upstreams);
  if (!name) return fail(`未知 server：${args.server}`);
  let { up } = await setActive(name);

  const retries = Number.isInteger(args.retries) ? args.retries : 0;
  const timeoutMs = args.timeoutMs || 900000;
  const started = Date.now();
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    ensureLockOwnership();
    try {
      if (!up.ready) up = await ensureUpstream(name, up.activeVariant);
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

async function handleTree() {
  if (!active) return fail('还没有活动上游，先 d_connect');
  ensureLockOwnership();
  const up = await ensureUpstream(active);
  const tool = { a: 'get_plc_inventory', b: 'GetProjectTree', c: 'browse_project_tree' }[active];
  if (!tool || !up.hasTool(tool)) return fail(`上游 ${active} 没有工程树工具`);
  return up.callTool(tool, {}, 300000);
}

async function handleCompile(args) {
  if (!active) return fail('还没有活动上游，先 d_connect');
  ensureLockOwnership();
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

async function handleSave(args = {}) {
  if (!active) return fail('还没有活动上游，先 d_connect');
  ensureLockOwnership();
  if (args && args.clear_pending_recovery === true) {
    clearPendingRecovery('d_save_clear_flag');
  }
  const pending = readPendingRecovery();
  if (pending && (!args || args.allow_dirty_save !== true)) {
    audit({ event: 'save', ok: false, reason: 'pending-recovery-blocked', block: pending.block || null });
    return fail(
      '存在未完成恢复的块事务（pending_recovery.json），为保护磁盘工程中原有旧块已阻断保存。' +
        '请先重新 d_write_block 修复该块、或按 manualRecovery 从备份 XML 恢复并传 clear_pending_recovery:true；如确认强行覆盖磁盘原块，请显式传 allow_dirty_save:true。',
      { blockedByPendingRecovery: true, pendingRecovery: pending }
    );
  }
  const up = await ensureUpstream(active);
  if (active === 'a') return up.callTool('save_project', { confirm_save: true }, 600000);
  if (active === 'b') return up.callTool('SaveProject', {}, 600000);
  return up.callTool('save_project', {}, 600000);
}

async function handleOffline(args) {
  if (!active) return fail('还没有活动上游，先 d_connect');
  ensureLockOwnership();
  const up = await ensureUpstream(active);
  if (active === 'a') return up.callTool('go_offline', args.plc ? { plc_name: args.plc } : {}, 300000);
  if (active === 'b') return up.callTool('GoOffline', { softwarePath: args.plc || 'PLC' }, 300000);
  return fail('C 没有离线概念（它不提供在线/下载）');
}

async function handleDownload(args) {
  if (!active) return fail('还没有活动上游，先 d_connect');
  ensureLockOwnership();
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
    if (typeof args.allow_cpu_stop === 'boolean') a.allow_cpu_stop = args.allow_cpu_stop;
    if (typeof args.start_cpu_after_download === 'boolean') a.start_cpu_after_download = args.start_cpu_after_download;
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
  if (typeof args.allow_cpu_stop === 'boolean') b.stopBeforeDownload = args.allow_cpu_stop;
  if (typeof args.start_cpu_after_download === 'boolean') b.startAfterDownload = args.start_cpu_after_download;
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

async function handleFinish(args = {}) {
  if (!active) return fail('还没有活动上游，先 d_connect');
  ensureLockOwnership();
  const pending = readPendingRecovery();
  if (pending && args.allow_dirty_save !== true) {
    audit({ event: 'finish', ok: false, reason: 'pending-recovery-blocked', block: pending.block || null });
    return fail(
      '存在未完成恢复的块事务（pending_recovery.json），d_finish 已阻断保存以免覆盖磁盘原工程。' +
        '请先恢复故障块或明确处理后再执行，或传 allow_dirty_save:true。',
      {
        finished: false,
        blockedByPendingRecovery: true,
        pendingRecovery: pending,
        steps: [
          { step: 'preflight', ok: false, detail: '存在 pending_recovery.json，按规则阻断 d_finish' },
          { step: 'save', ok: false, detail: '未保存（存在未恢复块事务）' },
        ],
      }
    );
  }

  const requireZero = args.requireZeroErrors !== false;
  const steps = [];

  const offline = await handleOffline(args);
  const offlineOk = !isToolFailure(offline);
  steps.push({ step: 'offline', ok: offlineOk, detail: textOf(offline).slice(0, 1500) });
  if (!offlineOk) {
    steps.push({ step: 'compile', ok: false, detail: '离线未成功，已中止编译与保存' });
    steps.push({ step: 'save', ok: false, detail: '离线未成功，按规则不保存' });
    audit({ event: 'finish', ok: false, reason: 'offline-failed' });
    return fail('d_finish 转离线失败，已中止编译与保存。', { finished: false, steps });
  }

  const compile = await handleCompile(args);
  const compileText = textOf(compile);
  const hasErr = compileHasErrors(compileText);
  // 编译结果里 success:false 是"编译有错"的正常语义，不能用 isToolFailure 判，否则会误判
  const compileFailed = !!(compile && compile.isError) || hasErr;
  steps.push({ step: 'compile', ok: !compileFailed, detail: compileText.slice(0, 4000) });

  if (requireZero && compileFailed) {
    steps.push({ step: 'save', ok: false, detail: '编译未通过，按规则不保存' });
    audit({ event: 'finish', ok: false, reason: 'compile-failed' });
    return fail('d_finish 编译未通过，按规则未保存工程。', { finished: false, steps });
  }

  const save = await handleSave({ allow_dirty_save: args.allow_dirty_save === true });
  steps.push({ step: 'save', ok: !isToolFailure(save), detail: textOf(save).slice(0, 1500) });
  const finished = steps.every((s) => s.ok);
  audit({ event: 'finish', ok: finished });
  if (!finished) {
    const failedSteps = steps.filter((s) => !s.ok).map((s) => s.step).join(', ');
    return fail(`d_finish 未完全成功（失败步骤：${failedSteps || 'unknown'}）。`, { finished: false, steps });
  }
  return ok({ finished, steps });
}

const { handleDoctor, handleVersions, handleConnect } = createConnectHandlers({
  upstreams,
  ensureUpstream,
  setActive,
  deactivate,
  getActive: () => active,
  clearActive: () => {
    active = null;
  },
  readLock,
  lockIsStale,
  precheckLock,
  releaseLock,
  audit,
  readPendingRecovery,
  clearPendingRecovery,
});

const { handleReadBlock, handleWriteBlock } = createBlockHandlers({
  getActive: () => active,
  upstreams,
  ensureUpstream,
  callAnyTool,
  ensureLockOwnership,
  audit,
  INBOX_DIR,
  OUTBOX_DIR,
  RUNTIME_DIR,
  readPendingRecovery,
  writePendingRecovery,
  clearPendingRecovery,
});

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

function enqueueToolCall(task) {
  const next = callQueue.then(task, task);
  callQueue = next.catch(() => {});
  return next;
}

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
      // 同一进程内的 tools/call 严格串行，避免宿主并发 pipelining 造成状态或 TIA COM 冲突
      const result = await enqueueToolCall(() => fn(params.arguments || {}));
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
  process.stdin.on('data', (chunk) => {
    buf += chunk;
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

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  log('关闭，回收上游进程');
  const current = active;
  active = null;
  try {
    const up = current ? upstreams.get(current) : null;
    if (up && up.ready && !up.external) {
      let timer = null;
      await Promise.race([
        deactivate(current, 1500).catch(() => null),
        new Promise((r) => {
          timer = setTimeout(r, 1500);
          if (timer.unref) timer.unref();
        }),
      ]);
      if (timer) clearTimeout(timer);
    }
  } catch {}
  releaseLock();
  for (const [, up] of upstreams) {
    try {
      up.stop();
    } catch {}
  }
  process.exit(0);
}

if (require.main === module) {
  startServer();
} else {
  // 被 require 时只导出纯函数，供单元测试用，不挂 stdin
  module.exports = {
    ok,
    fail,
    textOf,
    parseLoose,
    collectBlockFiles,
    TOOLS,
    compileHasErrors,
    slug,
    versionFromPath,
    pickServerForVersion,
    writeBlockFile,
    isToolFailure,
    extractProjectName,
    stripRoot,
    normalizeBlockTarget,
    resolveConnectVersion,
    isTolerableFailure,
    parseSclDeclarations,
    findBlockInHierarchy,
    decideBackupPolicy,
    checkSclCompileDiagnostics,
    isEngineeringNotSupportedError,
    probeLocalTia,
    resolveAutoVersion,
    routeCandidates,
    isBInfraFallbackError,
    setProbeLocalTiaMock,
    resetProbeLocalTiaCache,
    probePort8000,
  };
}
