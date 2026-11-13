'use strict';
/*
 * gateway/lib/connect.js — 零进程本机 TIA 探测、版本路由、故障安全回退与连接编排。
 *
 * 职责：
 *  - probeLocalTia(upstreams, opts)：单次 PowerShell 零进程采集注册表 / 运行中 Portal / Openness 组（60s 缓存）
 *  - routeCandidates(major, probe, upstreams)：校验安装版本、解析 auto 路由并过滤可用上游有序清单
 *  - createConnectHandlers(ctx)：构造并导出 connectB / handleDoctor / handleVersions / handleConnect
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const {
  config,
  IS_WINDOWS,
  log,
  resolvePath,
  textOf,
  ok,
  fail,
  isToolFailure,
  parseLoose,
  extractProjectName,
  resolveConnectVersion,
} = require('./utils');
const { probePort8000 } = require('./upstreams');

const LOCAL_PROBE_TTL_MS = 60 * 1000;
const B_INFRA_ERR_RE =
  /可执行文件不存在|ENOENT|未配置启动命令|启动失败|进程退出|提前退出|超时|timed?\s*out|Could not find|Could not load|FileNotFoundException|Siemens\.Engineering|BadImageFormat|不支持 TIA 版本|version mismatch|未找到.*(?:exe|dll|程序集)/i;
const B_NON_FALLBACK_RE =
  /另一个网关实例|抢锁失败|active\.lock|权限|access is denied|denied|拒绝|already open|已打开|Project file not found|Invalid project file extension/i;

let cachedOsProbe = null;
let probeLocalTiaMock = null;

function setProbeLocalTiaMock(fn) {
  probeLocalTiaMock = typeof fn === 'function' ? fn : null;
  cachedOsProbe = null;
}

function resetProbeLocalTiaCache() {
  cachedOsProbe = null;
}

function toArr(v) {
  if (Array.isArray(v)) return v;
  return v !== undefined && v !== null ? [v] : [];
}

function encodePowerShell(script) {
  return Buffer.from(script, 'utf16le').toString('base64');
}

function execPsJson(script, timeoutMs = 5000) {
  return new Promise((resolve) => {
    try {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodePowerShell(script)],
        { windowsHide: true, timeout: timeoutMs, maxBuffer: 1024 * 1024, encoding: 'utf8' },
        (error, stdout, stderr) => {
          if (error || !stdout || !stdout.trim()) {
            resolve({ ok: false, data: null, error: (error && error.message) || stderr || 'empty output' });
            return;
          }
          try {
            resolve({ ok: true, data: JSON.parse(stdout.trim()), error: null });
          } catch (e) {
            resolve({ ok: false, data: null, error: e.message });
          }
        }
      );
    } catch (e) {
      resolve({ ok: false, data: null, error: e.message });
    }
  });
}

function parsePortalMajorFromExe(exe) {
  if (!exe) return null;
  const m = String(exe).match(/Portal\s+V(\d{2})|[\\/]V(\d{2})[\\/]Bin/i);
  return m ? parseInt(m[1] || m[2], 10) : null;
}

function parseProjectPathFromCmd(cmd) {
  if (!cmd) return null;
  const m = String(cmd).match(/"([^"]+\.(?:ap|als)\d{2})"|(\S+\.(?:ap|als)\d{2})/i);
  return m ? m[1] || m[2] : null;
}

function isPortalMainProcess(p) {
  if (!p) return false;
  const cmd = String(p.cmd || '');
  // 过滤 TIA Portal 伴生后台进程（如 SearchReplaceBackgroundProcess），避免单开 UI 被误判为多实例
  if (/-(?:Name=\S*BackgroundProcess|processId=\d+)\b/i.test(cmd)) return false;
  return true;
}

function collectLocalUpstreamMeta(upstreams) {
  const bVariants = {};
  const bUp = upstreams && typeof upstreams.get === 'function' ? upstreams.get('b') : null;
  if (bUp) {
    if (bUp.cfg && bUp.cfg.byVersion) {
      for (const v of Object.keys(bUp.cfg.byVersion)) {
        const launch = bUp.resolveLaunchFor(v);
        const p = launch && resolvePath(launch.command);
        bVariants[v] = { path: p || null, exists: !!(p && fs.existsSync(p)) };
      }
    } else {
      const launch = bUp.resolveLaunchFor(config.defaultVersion);
      const p = launch && resolvePath(launch.command);
      bVariants.default = { path: p || null, exists: !!(p && fs.existsSync(p)) };
    }
  }
  const cUp = upstreams && typeof upstreams.get === 'function' ? upstreams.get('c') : null;
  const cStatus = {
    enabled: !!cUp,
    installed: !!(cUp && cUp.cfg && cUp.cfg.installed === true),
  };
  return { bVariants, cStatus };
}

async function runWindowsZeroProcessProbe() {
  if (!IS_WINDOWS) {
    return {
      ok: false,
      error: 'non-windows host',
      installed: [],
      installedMajors: [],
      excludedEntries: [],
      publicApi: {},
      portals: [],
      opennessGroup: { ok: false, checked: false, detail: '仅支持 Windows', lines: [] },
    };
  }

  const psScript = [
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    "$ErrorActionPreference = 'SilentlyContinue'",
    '$sw = @()',
    "Get-ChildItem 'HKLM:\\SOFTWARE\\Siemens\\Automation\\_InstalledSW' | ForEach-Object {",
    '  $n = $_.PSChildName',
    "  if ($n -match '^TIAP(\\d+)$') {",
    '    $m = [int]$Matches[1]',
    "    $op = Get-ItemProperty ($_.PSPath + '\\TIA_Opns')",
    '    $p = if ($op) { $op.Path } else { $null }',
    '    $ok = [bool]($p -and (Test-Path -LiteralPath $p))',
    '    $sw += [PSCustomObject]@{ key = $n; major = $m; path = $p; exists = $ok }',
    '  }',
    '}',
    '$pub = @{}',
    "Get-ChildItem 'HKLM:\\SOFTWARE\\Siemens\\Automation\\Openness' | ForEach-Object {",
    '  $v = $_.PSChildName',
    "  $subs = @(Get-ChildItem ($_.PSPath + '\\PublicAPI') | Select-Object -ExpandProperty PSChildName)",
    '  $pub[$v] = $subs',
    '}',
    '$procs = @(Get-CimInstance Win32_Process -Filter "Name=\'Siemens.Automation.Portal.exe\'" | ForEach-Object {',
    '  [PSCustomObject]@{ pid = [int]$_.ProcessId; exe = $_.ExecutablePath; cmd = $_.CommandLine }',
    '})',
    "$wg = @(whoami /groups /fo csv 2>$null | Select-String -Pattern 'Siemens TIA Openness' | ForEach-Object { $_.Line })",
    '[PSCustomObject]@{',
    '  installedRaw = $sw',
    '  publicApi = $pub',
    '  portals = $procs',
    '  opennessGroupLines = $wg',
    '} | ConvertTo-Json -Depth 5 -Compress',
  ].join('\n');

  const res = await execPsJson(psScript, 6000);
  if (!res.ok || !res.data) {
    return {
      ok: false,
      error: res.error || 'probe failed',
      installed: [],
      installedMajors: [],
      excludedEntries: [],
      publicApi: {},
      portals: [],
      opennessGroup: { ok: false, checked: false, detail: `本机探测失败：${res.error}`, lines: [] },
    };
  }

  const raw = res.data;
  const pub = raw.publicApi && typeof raw.publicApi === 'object' ? raw.publicApi : {};
  const publicApi = {};
  for (const [k, v] of Object.entries(pub)) publicApi[k] = toArr(v);

  const installed = [];
  const excludedEntries = [];
  for (const item of toArr(raw.installedRaw)) {
    if (!item || !Number.isInteger(item.major)) continue;
    if (item.exists) {
      installed.push({
        key: item.key,
        major: item.major,
        version: `V${item.major}`,
        path: item.path,
        publicApi: publicApi[`${item.major}.0`] || [],
      });
    } else {
      excludedEntries.push({
        key: item.key,
        major: item.major,
        path: item.path || null,
        exists: false,
      });
    }
  }
  installed.sort((a, b) => a.major - b.major);

  const portals = toArr(raw.portals)
    .filter(isPortalMainProcess)
    .map((p) => ({
      pid: p.pid,
      exe: p.exe || null,
      cmd: p.cmd || null,
      major: parsePortalMajorFromExe(p.exe),
      projectPath: parseProjectPathFromCmd(p.cmd),
    }));

  const groupLines = toArr(raw.opennessGroupLines).map((l) => String(l));
  const groupOk = groupLines.some((l) => /Siemens TIA Openness/i.test(l) && !/deny only|禁用/i.test(l));

  return {
    ok: true,
    error: null,
    installed,
    installedMajors: [...new Set(installed.map((x) => x.major))],
    excludedEntries,
    publicApi,
    portals,
    opennessGroup: {
      ok: groupOk,
      checked: true,
      detail: groupOk ? '当前用户已在 Siemens TIA Openness 组' : '当前会话未检测到激活的 Siemens TIA Openness 组权限',
      lines: groupLines,
    },
  };
}

/** 零进程探测本机 TIA 安装、PublicAPI、运行中 Portal 与 Openness 组（60s 缓存） */
async function probeLocalTia(upstreams, opts = {}) {
  if (typeof opts.probeLocalTia === 'function') {
    return opts.probeLocalTia(upstreams, opts);
  }
  if (probeLocalTiaMock) {
    return probeLocalTiaMock(upstreams, opts);
  }

  const refresh = !!(opts && opts.refresh);
  const now = Date.now();
  let osProbe;
  let cached = false;

  if (!refresh && cachedOsProbe && now - cachedOsProbe.ts < LOCAL_PROBE_TTL_MS) {
    osProbe = cachedOsProbe.data;
    cached = true;
  } else {
    osProbe = await runWindowsZeroProcessProbe();
    if (osProbe.ok) {
      cachedOsProbe = { ts: now, data: osProbe };
    }
  }

  const { bVariants, cStatus } = collectLocalUpstreamMeta(upstreams);
  return {
    ...osProbe,
    source: 'local-zero-process',
    cached,
    probedAt: new Date(now).toISOString(),
    bVariants,
    cStatus,
  };
}

function getInstalledMajorsFromProbe(probe) {
  if (!probe) return [];
  if (Array.isArray(probe.installedMajors) && probe.installedMajors.length) {
    return [...new Set(probe.installedMajors.map(Number).filter(Number.isInteger))].sort((a, b) => a - b);
  }
  if (Array.isArray(probe.installed)) {
    return [...new Set(probe.installed.map((x) => Number(x.major ?? x)).filter(Number.isInteger))].sort((a, b) => a - b);
  }
  return [];
}

function resolveAutoVersion(major, probe, opts = {}) {
  const installedMajors = getInstalledMajorsFromProbe(probe);
  if (major != null) {
    if (!installedMajors.includes(major)) {
      const hasList = installedMajors.length ? installedMajors.map((v) => `V${v}`).join(', ') : '无';
      throw new Error(`请求连接 TIA V${major}，但本机未安装该版本（已安装：${hasList}）。请核实 version 或工程后缀。`);
    }
    return { major, autoNote: opts.autoNote || null };
  }

  const portals = (Array.isArray(probe && probe.portals) ? probe.portals : []).filter(isPortalMainProcess);
  const runningWithMajor = portals.filter(
    (p) => p && Number.isInteger(p.major) && (installedMajors.length === 0 || installedMajors.includes(p.major))
  );
  const distinctMajors = [...new Set(runningWithMajor.map((p) => p.major))];
  if (!opts.hasProjectPath && distinctMajors.length === 1 && runningWithMajor.length >= 1) {
    const picked = distinctMajors[0];
    const autoNote =
      runningWithMajor.length === 1
        ? `检测到当前仅运行 1 个 TIA Portal V${picked} 实例（PID ${runningWithMajor[0].pid}），优先路由到 V${picked}`
        : `检测到当前仅运行 V${picked} TIA Portal（${runningWithMajor.length} 个实例，主 PID ${runningWithMajor[0].pid}），优先路由到 V${picked}`;
    return {
      major: picked,
      autoNote,
    };
  }

  if (installedMajors.length > 0) {
    const picked = Math.max(...installedMajors);
    return {
      major: picked,
      autoNote: `零进程探测已装版本：${installedMajors.map((v) => `V${v}`).join(', ')} → 取最高 V${picked}`,
    };
  }

  throw new Error('本机未检测到有效安装的 TIA Portal（TIAP*\\TIA_Opns 目录不存在），请先运行 d_doctor 检查环境。');
}

function upstreamSupportsVersion(name, upstreams, major) {
  const hasMap = upstreams && typeof upstreams.has === 'function';
  const up = hasMap ? upstreams.get(name) : null;
  const cfg = up ? up.cfg : config.upstreams && config.upstreams[name];
  if (!cfg || cfg.enabled === false) return false;
  if (name === 'c') return cfg.installed === true;
  if (name === 'b') {
    if (cfg.byVersion) return Boolean(cfg.byVersion[String(major)]);
    return true;
  }
  return true;
}

/** 校验目标版本已装并返回过滤后的有序上游清单（如 V20 -> ['b','a'], V16 -> ['a']） */
function routeCandidates(major, probe, upstreams, opts = {}) {
  const { major: resolvedMajor } = resolveAutoVersion(major, probe, opts);
  let order;
  if (resolvedMajor >= 21) order = ['c', 'b', 'a'];
  else if (resolvedMajor === 20) order = ['b', 'a'];
  else order = ['a'];

  return order.filter((name) => upstreamSupportsVersion(name, upstreams, resolvedMajor));
}

function isBInfraFallbackError(errOrMsg, stage) {
  if (stage !== 'ensure' && stage !== 'connect') return false;
  const msg = String((errOrMsg && errOrMsg.message) || errOrMsg || '');
  if (!msg) return false;
  if (B_NON_FALLBACK_RE.test(msg)) return false;
  return B_INFRA_ERR_RE.test(msg);
}

function isLockContentionMessage(msg) {
  return /另一个网关实例|抢锁失败|active\.lock/.test(String(msg || ''));
}

function createConnectHandlers(ctx) {
  const {
    upstreams,
    ensureUpstream,
    setActive,
    deactivate,
    clearActive,
    readLock,
    lockIsStale,
    precheckLock,
    releaseLock,
  } = ctx;

  const audit = typeof ctx.audit === 'function' ? ctx.audit : () => {};
  const readPendingRecovery = typeof ctx.readPendingRecovery === 'function' ? ctx.readPendingRecovery : () => null;
  const clearPendingRecovery = typeof ctx.clearPendingRecovery === 'function' ? ctx.clearPendingRecovery : null;
  const runLocalProbe = (refresh) =>
    typeof ctx.probeLocalTia === 'function'
      ? ctx.probeLocalTia(upstreams, { refresh })
      : probeLocalTia(upstreams, { refresh });

  async function handleDoctor(args = {}) {
    const deep = !!(args && args.deep === true);
    const refresh = !!(args && args.refresh === true);
    const report = { ok: true, mode: deep ? 'deep' : 'fast', checks: [], fixes: [] };

    if (args && args.clear_pending_recovery === true && clearPendingRecovery) {
      report.clearedPendingRecovery = clearPendingRecovery('d_doctor_clear_flag');
    }

    const lock = readLock();
    let lockOk = !lock || lock.pid === process.pid || lockIsStale(lock);
    let lockConflict = null;
    if (typeof precheckLock === 'function') {
      try {
        precheckLock();
      } catch (e) {
        lockOk = false;
        lockConflict = e.message;
      }
    }
    report.checks.push({
      name: 'exclusive-lock',
      ok: lockOk,
      detail: lock
        ? `锁被 pid ${lock.pid} 持有（上游 ${lock.server}）${lockIsStale(lock) ? ' — 已失效' : ''}`
        : lockConflict || '无锁',
      ...(lockConflict ? { conflict: lockConflict } : {}),
    });
    if (lockConflict) {
      report.fixes.push(lockConflict);
    }

    const pending = readPendingRecovery();
    report.checks.push({
      name: 'pending-recovery',
      ok: !pending,
      detail: pending
        ? `存在未完成恢复的块事务（${pending.block || 'unknown'}，phase=${pending.phase || 'unknown'}）`
        : '无待恢复块事务',
      entry: pending || undefined,
    });
    if (pending) {
      report.fixes.push('请先手动或重新 d_write_block 恢复故障块后再执行 d_save / d_finish。');
    }

    const upA = upstreams.get('a');
    let portProbe = null;
    if (upA) {
      const expectedCmd = upA.cfg.spawn && upA.cfg.spawn.command ? resolvePath(upA.cfg.spawn.command) : null;
      portProbe = await probePort8000(upA.url, upA.child ? upA.child.pid : null, {
        expectedCommand: expectedCmd,
        withServerInfo: Boolean(args.with_server_info || args.withServerInfo || deep),
      });
      const adoptable =
        (portProbe.status === 'foreign_mcp' && upA.cfg.adoptExternal === true) ||
        (portProbe.status === 'own_orphan' && (upA.cfg.adoptExternal === true || upA.cfg.reclaimOrphan === true));
      const portOk = portProbe.status === 'free' || portProbe.status === 'own_managed' || adoptable;
      report.checks.push({
        name: 'port-8000',
        ok: portOk,
        status: portProbe.status,
        detail:
          portProbe.status === 'free'
            ? `端口 ${portProbe.port} 空闲`
            : portProbe.status === 'own_managed'
              ? `由当前网关托管的 A 正在运行（PID ${portProbe.pid}）`
              : `status=${portProbe.status}, PID=${portProbe.pid ?? '未知'}, 进程=${portProbe.executablePath || portProbe.processName || '未知'}${adoptable ? '（已启用接管）' : ''}`,
        probe: portProbe,
      });
      if (!portOk) {
        if (portProbe.status === 'excluded_by_os') {
          report.fixes.push(`端口 ${portProbe.port} 命中 Windows excludedportrange，请排查系统保留端口或重启 WinNAT。`);
        } else {
          report.fixes.push(
            `端口 ${portProbe.port} 被占用（${portProbe.status}, PID=${portProbe.pid ?? '未知'}）。` +
              `若要连已有外部 MCP A，请在 d.config.json 为 "a" 显式配置 "adoptExternal": true，或结束占用进程。`
          );
        }
      }
    }

    const local = await runLocalProbe(refresh || deep);
    const verSummary = local.installed.map((x) => x.version).join(', ');
    report.checks.push({
      name: 'tia-installed',
      ok: local.installed.length > 0,
      detail: verSummary || '未检测到有效 TIAP*\\TIA_Opns 安装',
      excluded: local.excludedEntries,
    });
    if (local.installed.length === 0) {
      report.fixes.push('未检测到有效 TIA Portal 安装路径，请确认本机安装及注册表 TIA_Opns\\Path。');
    }

    report.checks.push({
      name: 'openness-group',
      ok: !!(local.opennessGroup && local.opennessGroup.ok),
      detail: (local.opennessGroup && local.opennessGroup.detail) || '无法确认 Openness 组',
    });
    if (!local.opennessGroup || !local.opennessGroup.ok) {
      report.fixes.push('把当前用户加入「Siemens TIA Openness」组并注销重登。');
    }

    report.checks.push({
      name: 'running-portals',
      ok: true,
      detail: local.portals.length
        ? local.portals.map((p) => `PID ${p.pid} (V${p.major || '?'})`).join(', ')
        : '当前无运行中 Portal UI 进程',
      portals: local.portals,
    });

    if (upA && upA.cfg.spawn && upA.cfg.spawn.command) {
      const aPath = resolvePath(upA.cfg.spawn.command);
      const aExists = !!(aPath && fs.existsSync(aPath));
      report.checks.push({ name: 'upstream-a', ok: aExists, detail: aExists ? aPath : `找不到 ${aPath}` });
      if (!aExists) report.fixes.push(`检查 A 的 exe 路径是否还在 d.config.json 里：${aPath}`);
    }

    for (const [v, info] of Object.entries(local.bVariants || {})) {
      const checkName = v === 'default' ? 'upstream-b' : `upstream-b-v${v}`;
      report.checks.push({
        name: checkName,
        ok: info.exists,
        detail: info.exists ? info.path : `找不到 ${info.path}`,
      });
      if (!info.exists) report.fixes.push(`上游 B${v === 'default' ? '' : ` 的 V${v}`} 运行时缺失：${info.path}`);
    }

    const cCfg = upstreams.get('c');
    report.checks.push({
      name: 'upstream-c',
      ok: !!cCfg && cCfg.cfg.installed === true,
      detail: cCfg && cCfg.cfg.installed ? '已启用' : '未安装（需 TIA V21 + dotnet tool install -g TiaMcpServer）',
    });

    if (deep && upA) {
      if (lockConflict) {
        report.checks.push({ name: 'deep-upstream-a', ok: false, detail: `跳过深探：${lockConflict}` });
      } else {
        const aWasReady = !!upA.ready;
        try {
          const up = await ensureUpstream('a');
          report.checks.push({ name: 'deep-upstream-a', ok: true, detail: `${up.tools.length} 个工具` });
          const vRes = await up.callTool('detect_tia_installations', {}, 180000);
          const vText = textOf(vRes);
          const parsed = parseLoose(vText);
          if (!parsed || typeof parsed !== 'object') {
            report.checks.push({
              name: 'deep-tia-installed',
              ok: false,
              detail: `detect_tia_installations 返回非 JSON 输出：${vText.slice(0, 300) || '(empty)'}`,
            });
            report.fixes.push('A 的 detect_tia_installations 返回格式异常，请检查上游 A 输出。');
          } else {
            const liveVersions = (Array.isArray(parsed.installed) ? parsed.installed : []).map(
              (x) => (x && (x.version || x.label)) || String(x)
            );
            report.checks.push({
              name: 'deep-tia-installed',
              ok: liveVersions.length > 0,
              detail: liveVersions.join(', ') || '未检测到',
            });
          }
        } catch (e) {
          report.checks.push({ name: 'deep-upstream-a', ok: false, detail: e.message });
          report.fixes.push(`deep 实起 A 探测失败：${e.message}`);
        } finally {
          if (!aWasReady && upA.isManagedRunning()) {
            upA.stop();
          }
        }
      }
    }

    try {
      const auto = resolveAutoVersion(null, local, {});
      const servers = routeCandidates(auto.major, local, upstreams);
      report.routing = { preferredVersion: `V${auto.major}`, preferred: servers[0] || null, servers };
    } catch {
      report.routing = null;
    }

    const requiredChecks = report.checks.filter((c) => c.name !== 'upstream-c' && c.name !== 'running-portals');
    report.ok = report.ok && requiredChecks.every((c) => c.ok);
    return ok(report);
  }

  async function handleVersions(args = {}) {
    const local = await runLocalProbe(Boolean(args && args.refresh));
    const installed = local.installed.map((x) => x.version);
    const routing = local.installed.map((x) => ({
      version: x.version,
      major: x.major,
      servers: routeCandidates(x.major, local, upstreams),
      publicApi: x.publicApi,
    }));
    return ok({
      source: local.source,
      cached: local.cached,
      installed,
      routing,
      runningPortals: local.portals,
      excluded: local.excludedEntries,
    });
  }

  /** B：Connect 是严格无参工具，传任何参数都会被 ArgDiagnosticTool 拦截 */
  async function connectB(up, projectPath, hooks = {}) {
    const notifyStage = typeof hooks.onStage === 'function' ? hooks.onStage : () => {};
    const requestedPlcName =
      hooks && (hooks.plcName || hooks.plc_name) ? String(hooks.plcName || hooks.plc_name).trim() : '';
    const warnings = [];
    if (requestedPlcName) {
      const w = `B 的 Connect/OpenProject 不支持按 plc_name="${requestedPlcName}" 选择 PLC，已忽略该参数（后续读写块请通过 plc 参数传 softwarePath）。`;
      warnings.push(w);
      log(w);
    }
    notifyStage('connect');

    let connectRes;
    try {
      connectRes = await up.callTool('Connect', {}, 600000);
    } catch (e) {
      return {
        ok: false,
        stage: 'connect',
        connect: e.message,
        ...(warnings.length ? { warnings } : {}),
        opened: { via: 'none', ok: false, detail: `Connect 异常：${e.message}` },
      };
    }

    const out = {
      ok: false,
      stage: 'connect',
      connect: textOf(connectRes).slice(0, 2000),
      ...(warnings.length ? { warnings } : {}),
      opened: null,
    };
    if (isToolFailure(connectRes)) {
      out.opened = {
        via: 'none',
        ok: false,
        detail: out.connect ? `Connect 失败：${out.connect}` : 'Connect 失败，后续无法打开工程',
      };
      return out;
    }

    if (projectPath) {
      notifyStage('open_project');
      out.stage = 'open_project';
      let openErr = null;
      let openRes = null;
      try {
        // B 的 OpenProject 参数名是 path，不是 projectPath
        openRes = await up.callTool('OpenProject', { path: projectPath }, 900000);
      } catch (e) {
        openErr = e.message;
      }
      if (!openErr && !isToolFailure(openRes)) {
        out.ok = true;
        out.opened = { via: 'OpenProject', ok: true, detail: textOf(openRes).slice(0, 2000) };
        return out;
      }

      const projName = path.basename(projectPath).replace(/\.(?:ap|als)\d+$/i, '');
      const reason = openErr || textOf(openRes).slice(0, 120);
      log(`OpenProject 失败（${reason}），尝试 AttachToOpenProject("${projName}")`);
      notifyStage('attach_project');
      try {
        const r2 = await up.callTool('AttachToOpenProject', { projectName: projName }, 300000);
        const ok2 = !isToolFailure(r2);
        out.ok = ok2;
        out.opened = {
          via: 'AttachToOpenProject',
          projectName: projName,
          ok: ok2,
          detail: textOf(r2).slice(0, 2000),
          openError: reason,
        };
      } catch (e) {
        out.ok = false;
        out.opened = {
          via: 'AttachToOpenProject',
          projectName: projName,
          ok: false,
          detail: `AttachToOpenProject 失败：${e.message}`,
          openError: reason,
        };
      }
      return out;
    }

    // 没给路径：看看 TIA 里是否已经开着工程，唯一就自动附着
    notifyStage('get_project');
    out.stage = 'get_project';
    try {
      const g = await up.callTool('GetProject', {}, 300000);
      const gText = textOf(g);
      if (isToolFailure(g)) {
        out.ok = false;
        out.opened = { via: 'none', ok: false, detail: `GetProject 返回失败：${gText.slice(0, 1000)}` };
        return out;
      }
      const name = extractProjectName(gText);
      if (name && name !== '-' && name.trim()) {
        notifyStage('attach_project');
        out.stage = 'attach_project';
        const r = await up.callTool('AttachToOpenProject', { projectName: name }, 300000);
        const attachOk = !isToolFailure(r);
        out.ok = attachOk;
        out.opened = {
          via: 'AttachToOpenProject(自动)',
          projectName: name,
          ok: attachOk,
          detail: textOf(r).slice(0, 2000),
        };
      } else {
        out.ok = true;
        out.opened = {
          via: 'none',
          ok: true,
          attached: false,
          detail: 'TIA 里没有唯一可附着的工程；请传 project_file_path，或用 B 的 CreateProject/ScaffoldProject',
          raw: gText.slice(0, 800),
        };
      }
    } catch (e) {
      out.ok = false;
      out.opened = { via: 'none', ok: false, detail: `GetProject 失败：${e.message}` };
    }
    return out;
  }

  async function windDownBeforeFallback(name) {
    const up = upstreams.get(name);
    if (!up) return;
    if (up.ready) {
      try {
        await deactivate(name);
      } catch {}
    }
    if (up.ready || up.isManagedRunning()) {
      up.stop();
    }
    clearActive();
    // 给 Windows 进程/管道句柄短暂收拢窗口，避免与紧随其后的上游竞争
    await new Promise((r) => setTimeout(r, 120));
  }

  async function connectCandidate(target, major, args, setStage) {
    setStage('ensure');
    const { up, notes } = await setActive(target, major);
    let detail;
    if (target === 'a') {
      setStage('connect');
      const a = { version: `V${major}` };
      if (args.project_file_path) a.project_file_path = args.project_file_path;
      if (args.plc_name) a.plc_name = args.plc_name;
      const res = await up.callTool('connect_tia', a, 600000);
      detail = { ok: !isToolFailure(res), via: 'connect_tia', detail: textOf(res).slice(0, 4000) };
    } else if (target === 'b') {
      detail = await connectB(up, args.project_file_path, { onStage: setStage, plcName: args.plc_name });
    } else {
      setStage('open_project');
      if (args.project_file_path) {
        const r = await up.callTool('open_project', { projectPath: args.project_file_path }, 900000);
        if (!isToolFailure(r)) {
          detail = { ok: true, via: 'open_project', detail: textOf(r).slice(0, 3000) };
        } else {
          const r2 = await up.callTool('bind_project', { projectPath: args.project_file_path }, 300000);
          detail = { ok: !isToolFailure(r2), via: 'bind_project', detail: textOf(r2).slice(0, 3000) };
        }
      } else {
        const r = await up.callTool('bind_project', {}, 300000);
        detail = { ok: !isToolFailure(r), via: 'bind_project', detail: textOf(r).slice(0, 3000) };
      }
    }
    return { notes, detail };
  }

  async function connectWithFallback({ major, autoNote, candidates, args }) {
    const fallbackEnabled = args.fallback !== false;
    const wasReady = new Map();
    for (const [k, u] of upstreams.entries()) wasReady.set(k, !!(u && u.ready));
    const touched = new Set();

    let fallbackFrom = null;
    let fallbackReason = null;
    let allNotes = [];
    let lastTarget = null;
    let lastStage = 'init';
    let lastDetail = null;
    let lastError = null;
    let lockConflict = false;

    for (let i = 0; i < candidates.length; i++) {
      const target = candidates[i];
      const nextTarget = i + 1 < candidates.length ? candidates[i + 1] : null;
      lastTarget = target;
      touched.add(target);
      let stage = 'ensure';

      try {
        const { notes, detail } = await connectCandidate(target, major, args, (s) => {
          stage = s;
        });
        if (notes && notes.length) allNotes = allNotes.concat(notes);
        if (detail && Array.isArray(detail.warnings) && detail.warnings.length) {
          allNotes = allNotes.concat(detail.warnings);
        }
        if (detail && detail.ok) {
          const capabilityNote =
            fallbackFrom === 'b'
              ? '已从上游 B 回退至上游 A：A 不提供 S7DCL 与 B 的 L1/L2 符号化读表/批改能力。'
              : undefined;
          audit({
            event: 'connect',
            ok: true,
            routedTo: target,
            version: `V${major}`,
            fallbackFrom: fallbackFrom || undefined,
            fallbackReason: fallbackReason || undefined,
          });
          return ok({
            routedTo: target,
            version: `V${major}`,
            autoNote,
            notes: allNotes,
            ...(fallbackFrom ? { fallbackFrom, fallbackReason, capabilityNote } : {}),
            result: detail,
          });
        }
        lastStage = (detail && detail.stage) || stage;
        lastDetail = detail;
        lastError =
          (detail && detail.opened && detail.opened.detail) ||
          (detail && detail.stage === 'connect' && detail.connect) ||
          (detail && detail.detail) ||
          `${target} 连接或打开工程返回失败`;
      } catch (e) {
        lastStage = stage;
        lastDetail = { ok: false, stage, detail: e.message };
        lastError = e.message;
        if (isLockContentionMessage(e.message)) {
          lockConflict = true;
          break;
        }
      }

      const canFallbackFromB = target === 'b' && fallbackEnabled && nextTarget === 'a' && isBInfraFallbackError(lastError, lastStage);
      const canFallbackFromC = target === 'c' && fallbackEnabled && nextTarget && lastStage === 'ensure' && isBInfraFallbackError(lastError, 'ensure');

      if (canFallbackFromB || canFallbackFromC) {
        log(`上游 ${target} 在 ${lastStage} 阶段发生基础设施失败（${lastError}），保持独占锁并回退到 ${nextTarget}`);
        fallbackFrom = target;
        fallbackReason = lastError;
        await windDownBeforeFallback(target);
        continue;
      }
      break;
    }

    if (!lockConflict) {
      for (const name of touched) {
        const up = upstreams.get(name);
        if (!up) continue;
        if (up.ready) {
          try {
            await deactivate(name);
          } catch {}
        }
        if (!wasReady.get(name) && (up.ready || up.isManagedRunning())) {
          up.stop();
        }
      }
      clearActive();
      releaseLock();
    }

    audit({
      event: 'connect',
      ok: false,
      routedTo: lastTarget,
      version: `V${major}`,
      stage: lastStage,
      error: lastError,
    });

    return fail(`d_connect 连接或打开工程失败（路由到 ${lastTarget} / V${major}，阶段 ${lastStage}）`, {
      routedTo: lastTarget,
      stage: lastStage,
      candidates,
      fallbackAttempted: !!fallbackFrom,
      fallbackFrom,
      fallbackReason,
      version: `V${major}`,
      autoNote,
      notes: allNotes,
      result: lastDetail,
      error: lastError,
    });
  }

  async function handleConnect(args = {}) {
    try {
      precheckLock();
      const parsed = resolveConnectVersion(args.version, args.project_file_path);
      const local = await runLocalProbe(false);
      const resolved = resolveAutoVersion(parsed.major, local, {
        hasProjectPath: !!args.project_file_path,
        autoNote: parsed.autoNote,
      });
      const candidates = routeCandidates(resolved.major, local, upstreams);
      if (!candidates.length) {
        return fail(`TIA V${resolved.major} 在当前配置中没有可用的启用上游。`, {
          version: `V${resolved.major}`,
          autoNote: resolved.autoNote,
        });
      }
      return await connectWithFallback({
        major: resolved.major,
        autoNote: resolved.autoNote,
        candidates,
        args,
      });
    } catch (e) {
      audit({ event: 'connect', ok: false, stage: 'preflight', error: e.message });
      return fail(`d_connect 失败：${e.message}`);
    }
  }

  return {
    connectB,
    handleDoctor,
    handleVersions,
    handleConnect,
    connectWithFallback,
  };
}

module.exports = {
  createConnectHandlers,
  probeLocalTia,
  resolveAutoVersion,
  routeCandidates,
  isBInfraFallbackError,
  setProbeLocalTiaMock,
  resetProbeLocalTiaCache,
};
