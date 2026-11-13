'use strict';
/*
 * gateway/lib/blocks.js — 块读写、P0-1 B 侧 .scl 备份/回滚事务与 P1-2 s7dcl 读取增强。
 *
 * 职责：
 *  - 纯函数导出：parseSclDeclarations / findBlockInHierarchy / decideBackupPolicy / checkSclCompileDiagnostics
 *  - createBlockHandlers(ctx)：构造并导出 handleReadBlock / handleWriteBlock / runPlan
 *  - 依赖 ctx 注入：{ getActive, upstreams, ensureUpstream, callAnyTool,
 *    ensureLockOwnership, audit, INBOX_DIR, OUTBOX_DIR,
 *    RUNTIME_DIR?, readPendingRecovery?, writePendingRecovery?, clearPendingRecovery? }
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  ensureDir,
  writeBlockFile,
  slug,
  stripRoot,
  stamp,
  textOf,
  ok,
  fail,
  isToolFailure,
  parseLoose,
  compileHasErrors,
  collectBlockFiles,
  normalizeBlockTarget,
  isTolerableFailure,
} = require('./utils');

const EXT_BY_FORMAT = { scl: '.scl', s7dcl: '.s7dcl', xml: '.xml', 'lad-spec': '.json' };
const SOFTWARE_UNITS_RE = /^software\s+units(?:[\\/]|$)/i;

function isAbsoluteSourcePath(p) {
  if (!p) return false;
  if (process.platform === 'win32') {
    return /^[A-Za-z]:[\\/]/.test(p) || /^\\\\[^\\]/.test(p);
  }
  return path.isAbsolute(p);
}

function failJson(message, payload) {
  return {
    content: [{ type: 'text', text: JSON.stringify({ ok: false, error: message, ...(payload || {}) }, null, 1) }],
    isError: true,
  };
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ------------------------------------------------------------------ */
/* 纯函数：SCL 声明解析 / 层次树定位 / 备份策略 / 编译诊断过滤          */
/* ------------------------------------------------------------------ */

/**
 * 有限状态机剥离 SCL 注释（// 行注释、(* *) 与 /* *\/ 块注释），
 * 同时尊重单引号字符串 '...' 与双引号标识符 "..."，保留换行以便行首匹配。
 */
function stripSclComments(text) {
  const src = String(text || '');
  const out = [];
  let state = 'normal';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];
    if (state === 'normal') {
      if (ch === '/' && next === '/') {
        state = 'line';
        out.push(' ', ' ');
        i++;
      } else if (ch === '(' && next === '*') {
        state = 'paren';
        out.push(' ', ' ');
        i++;
      } else if (ch === '/' && next === '*') {
        state = 'slash';
        out.push(' ', ' ');
        i++;
      } else if (ch === "'") {
        state = 'sq';
        out.push(ch);
      } else if (ch === '"') {
        state = 'dq';
        out.push(ch);
      } else {
        out.push(ch);
      }
    } else if (state === 'line') {
      if (ch === '\n' || ch === '\r') {
        state = 'normal';
        out.push(ch);
      } else {
        out.push(' ');
      }
    } else if (state === 'paren') {
      if (ch === '*' && next === ')') {
        state = 'normal';
        out.push(' ', ' ');
        i++;
      } else {
        out.push(ch === '\n' || ch === '\r' ? ch : ' ');
      }
    } else if (state === 'slash') {
      if (ch === '*' && next === '/') {
        state = 'normal';
        out.push(' ', ' ');
        i++;
      } else {
        out.push(ch === '\n' || ch === '\r' ? ch : ' ');
      }
    } else if (state === 'sq') {
      out.push(ch);
      if (ch === '$' && next !== undefined) {
        out.push(next);
        i++;
      } else if (ch === "'") {
        if (next === "'") {
          out.push(next);
          i++;
        } else {
          state = 'normal';
        }
      }
    } else if (state === 'dq') {
      out.push(ch);
      if (ch === '"') state = 'normal';
    }
  }
  return out.join('');
}

/**
 * 解析 SCL 顶层块 / UDT 声明。
 * @returns {{ declarations: Array<{kind: string, name: string}>, names: string[], hasMultiple: boolean }}
 */
function parseSclDeclarations(content) {
  const cleaned = stripSclComments(content);
  const declRe =
    /^\s*(ORGANIZATION_BLOCK|FUNCTION_BLOCK|FUNCTION|DATA_BLOCK|TYPE)\s+(?:"([^"\r\n]+)"|([A-Za-z_\u0080-\uFFFF][A-Za-z0-9_.\u0080-\uFFFF]*))/gim;
  const declarations = [];
  let m;
  while ((m = declRe.exec(cleaned)) !== null) {
    const kind = m[1].toUpperCase();
    const name = (m[2] || m[3] || '').trim();
    if (name) declarations.push({ kind, name });
  }
  const names = declarations.map((d) => d.name);
  return {
    declarations,
    names,
    hasMultiple: declarations.length > 1,
  };
}

function extractBlockAttributes(attrs) {
  let number = null;
  let autoNumber = null;
  if (Array.isArray(attrs)) {
    for (const item of attrs) {
      if (!item || typeof item !== 'object') continue;
      const k = String(item.name ?? item.Name ?? '').toLowerCase();
      const v = item.value ?? item.Value;
      if (k === 'number' && v !== undefined && v !== null) {
        const n = Number(v);
        if (!Number.isNaN(n)) number = n;
      } else if (k === 'autonumber' && v !== undefined && v !== null) {
        if (typeof v === 'boolean') autoNumber = v;
        else if (typeof v === 'string') {
          if (/^true$/i.test(v)) autoNumber = true;
          else if (/^false$/i.test(v)) autoNumber = false;
        }
      }
    }
  } else if (attrs && typeof attrs === 'object') {
    const numVal = attrs.Number ?? attrs.number;
    const autoVal = attrs.AutoNumber ?? attrs.autoNumber;
    if (numVal !== undefined && numVal !== null && !Number.isNaN(Number(numVal))) number = Number(numVal);
    if (typeof autoVal === 'boolean') autoNumber = autoVal;
  }
  return { number, autoNumber };
}

/**
 * 在 GetBlocksWithHierarchy 的返回结构中按块名精确查找位置（大小写不敏感）。
 * 根节点（Program blocks / 程序块）本身不计入 groupPath。
 */
function findBlockInHierarchy(payload, targetBlockName) {
  const obj = typeof payload === 'string' ? parseLoose(payload) : payload;
  if (!obj || typeof obj !== 'object') {
    return { valid: false, found: false, count: 0, ambiguous: false, match: null, matches: [], allBlocks: [], allBlockMap: new Map() };
  }
  const root = obj.root ?? obj.Root ?? (obj.blocks || obj.Blocks || obj.groups || obj.Groups ? obj : null);
  if (!root || typeof root !== 'object') {
    return { valid: false, found: false, count: 0, ambiguous: false, match: null, matches: [], allBlocks: [], allBlockMap: new Map() };
  }

  const allBlocks = [];
  const allBlockMap = new Map();
  const matches = [];
  const want = String(targetBlockName || '').trim().toLowerCase();

  function walk(node, groupParts) {
    if (!node || typeof node !== 'object') return;
    const groupPath = groupParts.join('/');
    const blocks = node.blocks ?? node.Blocks ?? [];
    if (Array.isArray(blocks)) {
      for (const b of blocks) {
        if (!b || typeof b !== 'object') continue;
        const name = String(b.name ?? b.Name ?? '').trim();
        if (!name) continue;
        const originPath = groupPath ? `${groupPath}/${name}` : name;
        const rawConsistent = b.isConsistent ?? b.IsConsistent;
        const attrs = extractBlockAttributes(b.attributes ?? b.Attributes);
        const entry = {
          name,
          originGroup: groupPath,
          originPath,
          typeName: b.typeName ?? b.TypeName ?? null,
          programmingLanguage: b.programmingLanguage ?? b.ProgrammingLanguage ?? null,
          isConsistent: typeof rawConsistent === 'boolean' ? rawConsistent : null,
          number: attrs.number,
          autoNumber: attrs.autoNumber,
        };
        allBlocks.push(entry);
        const key = name.toLowerCase();
        if (!allBlockMap.has(key)) allBlockMap.set(key, entry);
        if (want && key === want) matches.push(entry);
      }
    }
    const groups = node.groups ?? node.Groups ?? [];
    if (Array.isArray(groups)) {
      for (const g of groups) {
        if (!g || typeof g !== 'object') continue;
        const gName = stripRoot(g.name ?? g.Name ?? '');
        if (!gName) continue;
        walk(g, [...groupParts, gName]);
      }
    }
  }

  walk(root, []);
  return {
    valid: true,
    found: matches.length > 0,
    count: matches.length,
    ambiguous: matches.length > 1,
    match: matches.length === 1 ? matches[0] : null,
    matches,
    allBlocks,
    allBlockMap,
  };
}

/**
 * 纯表驱动备份策略判定：决定新建 / 正常备份 / 不一致阻断 / 显式跳过备份。
 */
function decideBackupPolicy(preflight, options = {}) {
  const overwrite = options.overwrite !== false;
  const allowUnbacked =
    options.allow_unbacked_overwrite === true || options.allowUnbackedOverwrite === true;

  if (!preflight || preflight.exists === false) {
    return {
      action: 'none',
      shouldBackup: false,
      allowed: true,
      status: 'not_needed',
      reason: '目标块不存在（新建块，无需备份）',
    };
  }
  if (preflight.exists === null || preflight.exists === undefined) {
    return {
      action: 'unknown',
      shouldBackup: false,
      allowed: true,
      status: 'not_probed',
      reason: '未探测工程（仅生成预览计划）',
    };
  }
  if (!overwrite) {
    return {
      action: 'abort',
      shouldBackup: false,
      allowed: false,
      status: 'blocked_exists',
      reason: `目标块 "${preflight.originPath || ''}" 已存在且 overwrite=false；B 的外部源生成不会覆盖已有块，已中止。`,
    };
  }
  if (preflight.isConsistent === false) {
    if (allowUnbacked) {
      return {
        action: 'skip_unbacked',
        shouldBackup: false,
        allowed: true,
        status: 'skipped_unbacked',
        reason: '旧块 IsConsistent=false 无法导出 XML 备份，已按显式 allow_unbacked_overwrite=true 放行覆盖',
      };
    }
    return {
      action: 'abort',
      shouldBackup: false,
      allowed: false,
      status: 'blocked_inconsistent',
      reason:
        `旧块 "${preflight.originPath || ''}" 处于 IsConsistent=false 状态，TIA Openness 拒绝导出备份（ExportBlock 不支持不一致块）。` +
        '请先执行 d_compile 使旧块一致后再试；若确认旧块本身有错需强行覆盖，请显式传入 allow_unbacked_overwrite: true。',
    };
  }
  return {
    action: 'backup',
    shouldBackup: true,
    allowed: true,
    status: 'required',
    reason: '目标块存在且可导出，删除前必须先导出 SimaticML XML 备份',
  };
}

function extractDiagFields(item) {
  if (item && typeof item === 'object') {
    const itemPath = String(item.path ?? item.Path ?? item.objectPath ?? item.ObjectPath ?? item.blockName ?? item.BlockName ?? '').trim();
    const text = String(item.description ?? item.Description ?? item.message ?? item.Message ?? JSON.stringify(item));
    return { itemPath, raw: text };
  }
  const s = String(item || '');
  const pathMatch = s.match(/(?:^|;\s*)(?:Path|ObjectPath|BlockName)\s*=\s*([^;]+)/i);
  return { itemPath: pathMatch ? pathMatch[1].trim() : '', raw: s };
}

function pathMatchesBlock(itemPath, blockName, targetGroup) {
  if (!itemPath || !blockName) return false;
  const cleaned = stripRoot(itemPath).replace(/\\/g, '/').trim();
  if (!cleaned) return false;
  const want = blockName.toLowerCase();
  const segRe = new RegExp(`^${escapeRegExp(blockName)}(?:\\s*\\[[^\\]]+\\])?$`, 'i');
  const segments = cleaned.split('/').filter(Boolean);
  const last = segments[segments.length - 1] || '';
  if (segRe.test(last)) return true;
  if (segments.some((seg) => seg.toLowerCase() === want)) return true;
  if (targetGroup && cleaned.toLowerCase() === `${targetGroup}/${blockName}`.toLowerCase()) return true;
  return false;
}

/**
 * 解析 CompileAndDiagnosePlc 结果，隔离“归属目标块错误”与“工程其他块既有错误（foreignErrors）”。
 * 只要出现 errorCount>0 / state=Error / meta.success=false 且未能 100% 归因到其他块，一律 fail-closed 视为目标块错误。
 */
function checkSclCompileDiagnostics(compileRes, targetBlockName, targetGroup) {
  const rawText = typeof compileRes === 'string' ? compileRes : textOf(compileRes);
  const mcpIsError = !!(compileRes && typeof compileRes === 'object' && compileRes.isError);
  const obj = typeof compileRes === 'string' ? parseLoose(compileRes) : parseLoose(rawText) || (compileRes && !compileRes.content ? compileRes : null);

  if (!obj || typeof obj !== 'object') {
    const textErr = mcpIsError || compileHasErrors(rawText);
    return {
      ok: !textErr,
      hasTargetErrors: textErr,
      hasErrors: textErr,
      state: null,
      errorCount: null,
      targetErrors: textErr ? [rawText.slice(0, 1000) || '编译返回非结构化失败'] : [],
      foreignErrors: [],
      diagnosticsComplete: false,
    };
  }

  const state = obj.state ?? obj.State ?? obj.overallState ?? obj.OverallState ?? null;
  const rawCount = obj.errorCount ?? obj.ErrorCount ?? obj.totalErrorCount ?? obj.total_error_count;
  const errorCount = typeof rawCount === 'number' ? rawCount : null;
  const meta = obj.meta ?? obj.Meta ?? {};
  const metaSuccess = meta.success ?? meta.Success;
  const diagComplete = meta.diagnosticsComplete ?? meta.DiagnosticsComplete;
  const errArray = Array.isArray(obj.errors ?? obj.Errors) ? (obj.errors ?? obj.Errors) : [];

  const targetErrors = [];
  const foreignErrors = [];
  let unattributed = 0;

  for (const item of errArray) {
    const { itemPath, raw } = extractDiagFields(item);
    if (!itemPath) {
      unattributed++;
      targetErrors.push(raw);
    } else if (pathMatchesBlock(itemPath, targetBlockName, targetGroup)) {
      targetErrors.push(raw);
    } else {
      foreignErrors.push(raw);
    }
  }

  const overallFailed =
    mcpIsError ||
    metaSuccess === false ||
    obj.ok === false ||
    obj.success === false ||
    (typeof state === 'string' && /^(error|failed|failure)$/i.test(state.trim())) ||
    (errorCount !== null && errorCount > 0) ||
    errArray.length > 0;

  const missingDetails =
    overallFailed &&
    (errArray.length === 0 ||
      diagComplete === false ||
      (errorCount !== null && errArray.length < errorCount));

  if (missingDetails && targetErrors.length === 0) {
    targetErrors.push(
      `编译失败但无法将全部错误隔离到其他块（state=${state}, errorCount=${errorCount}, detailCount=${errArray.length}, diagnosticsComplete=${diagComplete}）`
    );
  }

  const hasTargetErrors = targetErrors.length > 0 || (overallFailed && unattributed > 0) || missingDetails;

  return {
    ok: !hasTargetErrors,
    hasTargetErrors,
    hasErrors: overallFailed,
    state,
    errorCount,
    targetErrors,
    foreignErrors,
    diagnosticsComplete: diagComplete !== false,
  };
}

function isEngineeringNotSupportedError(text) {
  if (!text) return false;
  if (!/EngineeringNotSupportedException/i.test(text)) return false;
  if (/\bnot found\b|does not exist|未找到|不存在|IsConsistent|inconsistent|online mode|No project is open/i.test(text)) {
    return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* 上游处理器工厂                                                      */
/* ------------------------------------------------------------------ */

function createBlockHandlers(ctx) {
  const {
    getActive,
    upstreams,
    ensureUpstream,
    callAnyTool,
    ensureLockOwnership,
    audit,
    INBOX_DIR,
    OUTBOX_DIR,
  } = ctx;

  const runtimeDir = ctx.RUNTIME_DIR || (OUTBOX_DIR ? path.dirname(OUTBOX_DIR) : null);
  const pendingRecoveryPath = runtimeDir ? path.join(runtimeDir, 'pending_recovery.json') : null;

  const readPendingRecovery =
    ctx.readPendingRecovery ||
    (() => {
      if (!pendingRecoveryPath) return null;
      try {
        return JSON.parse(fs.readFileSync(pendingRecoveryPath, 'utf8'));
      } catch {
        return null;
      }
    });

  const writePendingRecovery =
    ctx.writePendingRecovery ||
    ((entry) => {
      if (!pendingRecoveryPath) return entry;
      ensureDir(path.dirname(pendingRecoveryPath));
      const payload = JSON.stringify(entry, null, 2);
      const tmp = `${pendingRecoveryPath}.${process.pid}.tmp`;
      try {
        fs.writeFileSync(tmp, payload, 'utf8');
        fs.renameSync(tmp, pendingRecoveryPath);
      } catch {
        fs.writeFileSync(pendingRecoveryPath, payload, 'utf8');
      } finally {
        try {
          if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
        } catch {}
      }
      return entry;
    });

  const clearPendingRecovery =
    ctx.clearPendingRecovery ||
    ((reason) => {
      if (!pendingRecoveryPath) return false;
      try {
        if (fs.existsSync(pendingRecoveryPath)) {
          fs.unlinkSync(pendingRecoveryPath);
          if (typeof audit === 'function') {
            audit({ event: 'clear-pending-recovery', reason: reason || 'resolved' });
          }
          return true;
        }
      } catch {}
      return false;
    });

  function canCallTool(up, tool) {
    if (!up) return false;
    if (typeof up.hasTool === 'function' && up.hasTool(tool)) return true;
    return up.name === 'b' && typeof up.hasTool === 'function' && up.hasTool('CallTool');
  }

  async function invokeTool(up, tool, toolArgs, timeoutMs = 900000, customCaller = null) {
    try {
      const res = customCaller
        ? await customCaller(up, tool, toolArgs, timeoutMs)
        : await callAnyTool(up, tool, toolArgs, timeoutMs);
      const text = textOf(res);
      const bad = isToolFailure(res);
      return { ok: !bad, res, text, error: bad ? text : null };
    } catch (e) {
      return { ok: false, res: null, text: e.message || String(e), error: e.message || String(e) };
    }
  }

  async function runPlan(plan, opts = {}) {
    const steps = [];
    const customCaller = opts && typeof opts.call === 'function' ? opts.call : null;
    for (const step of plan) {
      ensureLockOwnership();
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
        const res = customCaller
          ? await customCaller(up, step.tool, step.arguments, 900000)
          : await callAnyTool(up, step.tool, step.arguments, 900000);
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
    if (!done) {
      return failJson('执行写入计划失败', { executed: false, steps });
    }
    return ok({ executed: true, steps });
  }

  /* ---------------------------------------------------------------- */
  /* P1-2：d_read_block（子组自动解析 + EngineeringNotSupported 引导）*/
  /* ---------------------------------------------------------------- */

  async function handleReadBlock(args) {
    const active = getActive();
    if (!active) return fail('还没有活动上游，先 d_connect');
    ensureLockOwnership();
    const up = await ensureUpstream(active);
    const { block: parsedName, group: parsedGroup } = normalizeBlockTarget(args.block, args.group);
    const block = stripRoot(args.block);
    if (!block || !parsedName) return fail('缺少 block 参数（块名，如 Main 或 Group/Sub/Name）');
    const plc = args.plc || 'PLC';

    if (active === 'b') {
      const fmt = args.format ? String(args.format).toLowerCase() : '';
      if (!fmt) {
        const logicRes = await invokeTool(up, 'DescribeBlockLogic', { softwarePath: plc, blockPath: block }, 600000);
        if (!logicRes.ok) {
          return fail(`读取块逻辑失败（DescribeBlockLogic）：${logicRes.text.slice(0, 1500)}`, {
            server: 'b',
            blockPath: block,
          });
        }
        return logicRes.res;
      }
      if (fmt !== 's7dcl' && fmt !== 'xml') {
        return fail(`B 上 d_read_block 仅支持默认逻辑骨架或 format=s7dcl / xml（收到：${args.format}）`);
      }

      // ExportAsDocuments / ExportBlock 在不带组路径时只查根目录，不递归子组；若未传 group 则先用工程树解析唯一位置
      let resolvedBlockPath = parsedGroup ? `${parsedGroup}/${parsedName}` : block;
      if (!parsedGroup && canCallTool(up, 'GetBlocksWithHierarchy')) {
        const hierCall = await invokeTool(up, 'GetBlocksWithHierarchy', { softwarePath: plc }, 300000);
        if (hierCall.ok) {
          const hier = findBlockInHierarchy(hierCall.text, parsedName);
          if (hier.valid) {
            if (hier.ambiguous) {
              return fail(`块 "${parsedName}" 在多个分组中存在重名，请传入完整组路径`, {
                server: 'b',
                block: parsedName,
                candidates: hier.matches.map((m) => m.originPath),
              });
            }
            if (hier.match) {
              resolvedBlockPath = hier.match.originPath;
            }
          }
        }
      }

      const dir = ensureDir(path.join(OUTBOX_DIR, `${stamp()}_${slug(resolvedBlockPath)}`));
      const tool = fmt === 's7dcl' ? 'ExportAsDocuments' : 'ExportBlock';
      const expRes = await invokeTool(
        up,
        tool,
        { softwarePath: plc, blockPath: resolvedBlockPath, exportPath: dir, preservePath: false },
        600000
      );
      const files = collectBlockFiles(dir);

      if (!expRes.ok && files.length === 0) {
        const errText = expRes.text || '';
        const fallbackToXml = args.fallback_to_xml === true || args.fallbackToXml === true;
        if (fmt === 's7dcl' && isEngineeringNotSupportedError(errText)) {
          if (!fallbackToXml) {
            return fail(
              `块 "${resolvedBlockPath}" 不支持导出为 .s7dcl（TIA V20 ExportAsDocuments 不支持 SCL 或混合语言块：EngineeringNotSupportedException）。` +
                `请改用 format="xml" 获取完整 SimaticML XML（含接口与逻辑，可回写），或传 fallback_to_xml: true 自动回退导出 XML；` +
                `若仅需查看代码正文可省略 format（注意 DescribeBlockLogic 不含 VAR 接口声明）。`,
              {
                server: 'b',
                requested_format: 's7dcl',
                blockPath: resolvedBlockPath,
                upstream: errText.slice(0, 1500),
              }
            );
          }
          const xmlRes = await invokeTool(
            up,
            'ExportBlock',
            { softwarePath: plc, blockPath: resolvedBlockPath, exportPath: dir, preservePath: false },
            600000
          );
          const xmlFiles = collectBlockFiles(dir);
          if (!xmlRes.ok && xmlFiles.length === 0) {
            return fail('s7dcl 不支持该块且回退 ExportBlock(xml) 也失败', {
              server: 'b',
              requested_format: 's7dcl',
              blockPath: resolvedBlockPath,
              fallback_reason: errText.slice(0, 600),
              upstream: xmlRes.text.slice(0, 1500),
            });
          }
          return ok({
            server: 'b',
            format: 'xml',
            requested_format: 's7dcl',
            actual_format: 'xml',
            fallback_used: true,
            fallback_reason: errText.slice(0, 600),
            blockPath: resolvedBlockPath,
            exportedTo: dir,
            upstreamResult: xmlRes.text.slice(0, 2000),
            files: xmlFiles,
            note: '该块不支持 .s7dcl 导出，已按 fallback_to_xml=true 自动回退为 ExportBlock(xml) 并读回 SimaticML XML',
          });
        }
        if (/is inconsistent/i.test(errText)) {
          return fail(`块 "${resolvedBlockPath}" 当前处于未编译一致状态（IsConsistent=false），TIA Openness 拒绝导出不一致块，请先运行 d_compile 编译后再读取`, {
            server: 'b',
            format: fmt,
            blockPath: resolvedBlockPath,
            inconsistent: true,
            upstream: errText.slice(0, 1500),
          });
        }
        return fail(`导出块失败（${tool} 报错且目录里没有任何文件）`, {
          server: 'b',
          format: fmt,
          blockPath: resolvedBlockPath,
          upstream: errText.slice(0, 2000),
        });
      }

      return ok({
        server: 'b',
        format: fmt,
        blockPath: resolvedBlockPath,
        exportedTo: dir,
        upstreamResult: expRes.text.slice(0, 2000),
        files,
        note: files.length ? `已通过 ${tool} 导出并读回块文件` : '目录里没有块文件，看 upstreamResult',
      });
    }

    if (active === 'a') {
      const dir = ensureDir(path.join(OUTBOX_DIR, `${stamp()}_${slug(block)}`));
      const params = { target_directory: dir, block_names: [block] };
      if (args.format) params.export_format = args.format; // A 的默认是 simaticml，不要硬塞 xml
      if (args.plc) params.plc_name = args.plc;
      const expRes = await invokeTool(up, 'export_program_blocks', params, 600000);
      // 目录是本次调用专属的，直接递归读目录，不依赖上游返回文本的路径格式
      const files = collectBlockFiles(dir);
      if (!expRes.ok && files.length === 0) {
        return fail('导出块失败（上游报错且目录里没有任何文件）', { upstream: expRes.text.slice(0, 2000) });
      }
      return ok({
        server: 'a',
        exportedTo: dir,
        upstreamResult: expRes.text.slice(0, 2000),
        files,
        note: files.length ? '已把导出目录里的块文件（含 .s7res）内容带回' : '目录里没有块文件，看 upstreamResult',
      });
    }

    return fail('C 的读块要用 plc_read(operations=[...])，形状较特殊，请用 d_call 指定参数');
  }

  /* ---------------------------------------------------------------- */
  /* P0-1：B 侧 .scl 预检、备份校验、事务执行与补偿回滚               */
  /* ---------------------------------------------------------------- */

  async function probeBlockPreflight({ up, softwarePath, block, requestedGroup, ancillaryDecls, isConfirm }) {
    const base = {
      probed: false,
      probeError: null,
      exists: null,
      blockName: block,
      originPath: null,
      originGroup: null,
      targetGroup: requestedGroup || '',
      relocate: false,
      blockType: null,
      number: null,
      autoNumber: null,
      pinnedBlockNumber: null,
      isConsistent: null,
      crossReferenceAvailable: null,
      crossReferenceCount: null,
      existingAncillaryBlocks: [],
      multiBlockSource: ancillaryDecls.length > 0,
      ancillaryDeclarations: ancillaryDecls,
    };

    if (!canCallTool(up, 'GetBlocksWithHierarchy')) {
      return { ok: true, preflight: base };
    }

    const hierCall = await invokeTool(up, 'GetBlocksWithHierarchy', { softwarePath }, 300000);
    if (!hierCall.ok) {
      base.probeError = hierCall.text.slice(0, 600);
      if (isConfirm) {
        return {
          ok: false,
          error: `预检失败（GetBlocksWithHierarchy 无法获取工程块树，为安全起见中止写入）：${base.probeError}`,
          preflight: base,
        };
      }
      return { ok: true, preflight: base };
    }

    const hier = findBlockInHierarchy(hierCall.text, block);
    if (!hier.valid) {
      base.probeError = 'GetBlocksWithHierarchy 返回结构无法解析';
      if (isConfirm) {
        return { ok: false, error: `预检失败：${base.probeError}`, preflight: base };
      }
      return { ok: true, preflight: base };
    }

    if (hier.ambiguous) {
      return {
        ok: false,
        error: `工程中存在多个同名块 "${block}"（${hier.matches.map((m) => m.originPath).join(', ')}），无法安全定位覆盖目标`,
        preflight: base,
      };
    }

    base.probed = true;
    base.existingAncillaryBlocks = ancillaryDecls
      .filter((d) => hier.allBlockMap.has(d.name.toLowerCase()))
      .map((d) => ({ ...d, originPath: hier.allBlockMap.get(d.name.toLowerCase()).originPath }));

    if (!hier.found) {
      base.exists = false;
      return { ok: true, preflight: base };
    }

    const m = hier.match;
    base.exists = true;
    base.blockName = m.name;
    base.originPath = m.originPath;
    base.originGroup = m.originGroup;
    base.targetGroup = requestedGroup || m.originGroup || '';
    base.relocate = base.targetGroup !== (m.originGroup || '');
    base.blockType = m.typeName;
    base.isConsistent = m.isConsistent;
    base.number = m.number;
    base.autoNumber = m.autoNumber;
    if (m.autoNumber === false && m.number !== null) {
      base.pinnedBlockNumber = m.number;
    }

    // 实时核实 IsConsistent 与属性（避免层次树缓存缺字段）
    if (canCallTool(up, 'GetBlockInfo')) {
      const infoCall = await invokeTool(up, 'GetBlockInfo', { softwarePath, blockPath: m.originPath }, 300000);
      if (infoCall.ok) {
        const infoObj = parseLoose(infoCall.text);
        if (infoObj && typeof infoObj === 'object') {
          const ic = infoObj.isConsistent ?? infoObj.IsConsistent;
          if (typeof ic === 'boolean') base.isConsistent = ic;
          const tn = infoObj.typeName ?? infoObj.TypeName;
          if (tn) base.blockType = tn;
          const attrs = extractBlockAttributes(infoObj.attributes ?? infoObj.Attributes);
          if (attrs.number !== null) base.number = attrs.number;
          if (attrs.autoNumber !== null) base.autoNumber = attrs.autoNumber;
          if (base.autoNumber === false && base.number !== null) {
            base.pinnedBlockNumber = base.number;
          }
        }
      }
    }

    // 干跑预览且未阻止时，调一次只读 DeletePlcBlock(dryRun:true) 取 pinnedBlockNumber 与交叉引用
    if (!isConfirm && base.isConsistent !== false && canCallTool(up, 'DeletePlcBlock')) {
      const delPreview = await invokeTool(
        up,
        'DeletePlcBlock',
        { softwarePath, blockPath: m.originPath, dryRun: true },
        300000
      );
      if (delPreview.ok) {
        const delObj = parseLoose(delPreview.text);
        const data = delObj && (delObj.data || delObj.Data || delObj);
        if (data && typeof data === 'object') {
          const pinned = data.pinnedBlockNumber ?? data.PinnedBlockNumber;
          if (typeof pinned === 'number') {
            base.pinnedBlockNumber = pinned;
            base.number = pinned;
            base.autoNumber = false;
          }
          const crAvail = data.crossReferenceAvailable ?? data.CrossReferenceAvailable;
          const crCount = data.crossReferenceCount ?? data.CrossReferenceCount;
          if (typeof crAvail === 'boolean') base.crossReferenceAvailable = crAvail;
          if (typeof crCount === 'number') base.crossReferenceCount = crCount;
        }
      }
    }

    return { ok: true, preflight: base };
  }

  function verifyBackupXml(backupDir, blockName, metaInfo) {
    let xmlPath = path.join(backupDir, `${blockName}.xml`);
    if (!fs.existsSync(xmlPath)) {
      const xmls = fs.readdirSync(backupDir).filter((f) => /\.xml$/i.test(f));
      if (xmls.length > 0) xmlPath = path.join(backupDir, xmls[0]);
    }
    if (!fs.existsSync(xmlPath)) {
      return { ok: false, error: `ExportBlock 未在 ${backupDir} 生成 .xml 备份文件` };
    }
    const buf = fs.readFileSync(xmlPath);
    if (buf.length === 0) {
      return { ok: false, error: `导出的备份文件为空（0 字节）：${xmlPath}` };
    }
    const txt = buf.toString('utf8').replace(/^\uFEFF/, '');
    if (!/<\s*Document\b/i.test(txt)) {
      return { ok: false, error: `导出的备份 XML 缺少 <Document 根节点：${xmlPath}` };
    }
    const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
    const metaPath = path.join(backupDir, 'backup.json');
    fs.writeFileSync(
      metaPath,
      JSON.stringify({ ...metaInfo, xmlPath, sha256, bytes: buf.length }, null, 2),
      'utf8'
    );
    return { ok: true, xmlPath, metaPath, sha256, bytes: buf.length };
  }

  async function cleanupBlockResidue({ up, softwarePath, block, originGroup, targetGroup, steps, recordStep }) {
    const pathsToDelete = new Set();
    if (canCallTool(up, 'GetBlocksWithHierarchy')) {
      const hierCall = await invokeTool(up, 'GetBlocksWithHierarchy', { softwarePath }, 300000);
      if (hierCall.ok) {
        const hier = findBlockInHierarchy(hierCall.text, block);
        if (hier.valid) {
          for (const m of hier.matches) pathsToDelete.add(m.originPath);
        }
      }
    }
    if (pathsToDelete.size === 0) {
      pathsToDelete.add(String(block));
      if (targetGroup) pathsToDelete.add(`${targetGroup}/${block}`);
      if (originGroup) pathsToDelete.add(`${originGroup}/${block}`);
    }

    let allCleaned = true;
    const errors = [];
    for (const bp of pathsToDelete) {
      const args = { softwarePath, blockPath: bp, dryRun: false };
      const r = await invokeTool(up, 'DeletePlcBlock', args, 300000);
      const ignored = !r.ok && isTolerableFailure({ allowNotFound: true }, r.text);
      recordStep('rollback', 'DeletePlcBlock', args, r.ok, ignored, r.text);
      if (!r.ok && !ignored) {
        allCleaned = false;
        errors.push(`清理残片 "${bp}" 失败：${r.text.slice(0, 400)}`);
      }
    }
    return { ok: allCleaned, errors };
  }

  async function performRollback({
    up,
    softwarePath,
    block,
    preflight,
    backup,
    failedStep,
    steps,
    recordStep,
  }) {
    const originGroup = preflight.originGroup || '';
    const targetGroup = preflight.targetGroup || '';
    const rollback = {
      needed: true,
      attempted: true,
      ok: false,
      state: 'failed',
      restoredGroup: null,
      residueRemoved: false,
      numberBefore: preflight.pinnedBlockNumber ?? preflight.number ?? null,
      numberAfter: null,
      manualRecovery: null,
      errors: [],
    };

    // 新建块在 compile 失败时只需清除新建的残片，无需导入旧 XML
    if (preflight.exists === false) {
      const clean = await cleanupBlockResidue({
        up,
        softwarePath,
        block,
        originGroup,
        targetGroup,
        steps,
        recordStep,
      });
      rollback.residueRemoved = clean.ok;
      rollback.ok = clean.ok;
      rollback.state = clean.ok ? 'cleaned_new_block' : 'failed';
      rollback.errors.push(...clean.errors);
      return rollback;
    }

    if (!backup.path) {
      rollback.state = 'impossible_no_backup';
      rollback.errors.push('本次为无备份覆盖（allow_unbacked_overwrite=true），无法回滚恢复原块');
      writePendingRecovery({
        ts: new Date().toISOString(),
        phase: failedStep,
        softwarePath,
        block,
        originPath: preflight.originPath,
        originGroup,
        backupXmlPath: null,
        reason: `无备份覆盖在 ${failedStep} 失败`,
      });
      return rollback;
    }

    const clean = await cleanupBlockResidue({
      up,
      softwarePath,
      block,
      originGroup,
      targetGroup,
      steps,
      recordStep,
    });
    rollback.residueRemoved = clean.ok;
    rollback.errors.push(...clean.errors);

    const primaryImportArgs = { softwarePath, groupPath: originGroup, importPath: backup.path };
    let impRes = await invokeTool(up, 'ImportBlock', primaryImportArgs, 600000);
    recordStep('rollback', 'ImportBlock', primaryImportArgs, impRes.ok, false, impRes.text);

    if (impRes.ok) {
      rollback.ok = true;
      rollback.state = 'restored';
      rollback.restoredGroup = originGroup;
    } else {
      rollback.errors.push(`ImportBlock(${originGroup || '<root>'}) 失败：${impRes.text.slice(0, 400)}`);
      const groupMissing =
        !!originGroup && /group|not found|未找到|不存在/i.test(impRes.text);
      let restoredViaCreate = false;

      if (groupMissing && canCallTool(up, 'CreatePlcBlockGroup')) {
        const grpArgs = { softwarePath, groupPath: originGroup };
        const grpRes = await invokeTool(up, 'CreatePlcBlockGroup', grpArgs, 300000);
        recordStep('rollback', 'CreatePlcBlockGroup', grpArgs, grpRes.ok, false, grpRes.text);
        if (grpRes.ok) {
          const retryRes = await invokeTool(up, 'ImportBlock', primaryImportArgs, 600000);
          recordStep('rollback', 'ImportBlock', primaryImportArgs, retryRes.ok, false, retryRes.text);
          if (retryRes.ok) {
            rollback.ok = true;
            rollback.state = 'restored';
            rollback.restoredGroup = originGroup;
            restoredViaCreate = true;
          } else {
            rollback.errors.push(`建组后重试 ImportBlock 失败：${retryRes.text.slice(0, 400)}`);
          }
        } else {
          rollback.errors.push(`CreatePlcBlockGroup("${originGroup}") 失败：${grpRes.text.slice(0, 300)}`);
        }
      }

      if (!restoredViaCreate && originGroup) {
        const rootImportArgs = { softwarePath, groupPath: '', importPath: backup.path };
        const rootRes = await invokeTool(up, 'ImportBlock', rootImportArgs, 600000);
        recordStep('rollback', 'ImportBlock', rootImportArgs, rootRes.ok, false, rootRes.text);
        if (rootRes.ok) {
          rollback.ok = true;
          rollback.state = 'restored_to_root';
          rollback.restoredGroup = '';
        } else {
          rollback.errors.push(`降级根目录 ImportBlock 失败：${rootRes.text.slice(0, 400)}`);
        }
      }
    }

    if (rollback.ok && canCallTool(up, 'CompileAndDiagnosePlc')) {
      const rbCmp = await invokeTool(up, 'CompileAndDiagnosePlc', { softwarePath }, 900000);
      const rbDiag = checkSclCompileDiagnostics(
        rbCmp.res || rbCmp.text,
        preflight.blockName || block,
        rollback.restoredGroup || ''
      );
      rollback.recompiled = !rbDiag.hasTargetErrors;
      if (typeof recordStep === 'function') {
        recordStep('rollback_compile', 'CompileAndDiagnosePlc', { softwarePath }, rollback.recompiled, true, rbCmp.text);
      }
    }

    if (rollback.ok && canCallTool(up, 'GetBlockInfo')) {
      const checkPath = rollback.restoredGroup
        ? `${rollback.restoredGroup}/${preflight.blockName || block}`
        : preflight.blockName || block;
      const verifyCall = await invokeTool(up, 'GetBlockInfo', { softwarePath, blockPath: checkPath }, 300000);
      if (verifyCall.ok) {
        const info = parseLoose(verifyCall.text);
        const attrs = extractBlockAttributes(info && (info.attributes ?? info.Attributes));
        if (attrs.number !== null) rollback.numberAfter = attrs.number;
        if (
          rollback.numberBefore !== null &&
          rollback.numberAfter !== null &&
          rollback.numberBefore !== rollback.numberAfter
        ) {
          if (rollback.state === 'restored') rollback.state = 'restored_number_mismatch';
          rollback.errors.push(
            `块已恢复，但块号变化：原 ${rollback.numberBefore} → 现 ${rollback.numberAfter}`
          );
        }
      }
    }

    if (!rollback.ok) {
      rollback.manualRecovery = {
        tool: 'ImportBlock',
        arguments: primaryImportArgs,
        ...(originGroup ? { fallbackArguments: { softwarePath, groupPath: '', importPath: backup.path } } : {}),
        backupMetaPath: backup.metaPath,
      };
      writePendingRecovery({
        ts: new Date().toISOString(),
        phase: failedStep,
        softwarePath,
        block,
        originPath: preflight.originPath,
        originGroup,
        backupXmlPath: backup.path,
        backupMetaPath: backup.metaPath,
        sha256: backup.sha256,
        reason: rollback.errors.join(' | ').slice(0, 800) || failedStep,
        manualRecovery: rollback.manualRecovery,
      });
    }

    return rollback;
  }

  async function executeSclWriteTransaction({
    up,
    softwarePath,
    block,
    safeBlock,
    filePath,
    preflight,
    backupPolicy,
    overwrite,
    onCompileError,
    warnings,
  }) {
    const steps = [];
    let phase = 'preflight';
    let failedStep = null;
    let failureReason = '';
    let hasDeletedBlock = false;
    let compileDiagnostics = null;
    let placed = false;
    let residueAt = null;

    const backup = {
      status: backupPolicy.status,
      path: null,
      metaPath: null,
      sha256: null,
      bytes: 0,
    };

    let rollback = {
      needed: false,
      attempted: false,
      ok: null,
      state: 'not_needed',
      restoredGroup: null,
      residueRemoved: false,
      numberBefore: preflight.pinnedBlockNumber ?? preflight.number ?? null,
      numberAfter: null,
      manualRecovery: null,
      errors: [],
    };

    const recordStep = (stepPhase, tool, toolArgs, isOk, ignored, output) => {
      steps.push({
        server: 'b',
        phase: stepPhase,
        tool,
        arguments: toolArgs,
        ok: isOk,
        ignored: !!ignored,
        output: String(output || '').slice(0, 4000),
      });
      audit({ event: 'write', phase: stepPhase, server: 'b', tool, ok: isOk, ignored: !!ignored });
    };

    const runStep = async (stepPhase, tool, toolArgs, opts = {}) => {
      ensureLockOwnership();
      const r = await invokeTool(up, tool, toolArgs, opts.timeoutMs || 900000);
      const ignored = !r.ok && isTolerableFailure(opts, r.text);
      recordStep(stepPhase, tool, toolArgs, r.ok, ignored, r.text);
      return { ...r, effectiveOk: r.ok || ignored };
    };

    try {
      // 1) 备份阶段（仅当旧块存在且一致）
      if (backupPolicy.shouldBackup) {
        phase = 'backup';
        const backupDir = ensureDir(path.join(OUTBOX_DIR, `${stamp()}_${safeBlock}_backup`));
        const expArgs = {
          softwarePath,
          blockPath: preflight.originPath,
          exportPath: backupDir,
          preservePath: false,
        };
        const exp = await runStep('backup', 'ExportBlock', expArgs, { timeoutMs: 600000 });
        if (!exp.effectiveOk) {
          backup.status = 'failed';
          failedStep = 'ExportBlock';
          failureReason = `备份导出失败，已在任何删除操作前中止：${exp.text.slice(0, 600)}`;
          return failJson(failureReason, {
            executed: false,
            phase,
            failedStep,
            preflight,
            backup,
            rollback,
            warnings,
            steps,
          });
        }
        const verified = verifyBackupXml(backupDir, preflight.blockName || block, {
          ts: new Date().toISOString(),
          softwarePath,
          blockName: preflight.blockName || block,
          originPath: preflight.originPath,
          originGroup: preflight.originGroup || '',
          targetGroup: preflight.targetGroup || '',
          blockType: preflight.blockType,
          pinnedBlockNumber: preflight.pinnedBlockNumber,
          isConsistent: preflight.isConsistent,
        });
        if (!verified.ok) {
          backup.status = 'failed';
          failedStep = 'VerifyBackup';
          failureReason = `备份校验失败，已在任何删除操作前中止：${verified.error}`;
          return failJson(failureReason, {
            executed: false,
            phase,
            failedStep,
            preflight,
            backup,
            rollback,
            warnings,
            steps,
          });
        }
        backup.status = 'created';
        backup.path = verified.xmlPath;
        backup.metaPath = verified.metaPath;
        backup.sha256 = verified.sha256;
        backup.bytes = verified.bytes;
      } else if (backupPolicy.status === 'skipped_unbacked') {
        audit({
          event: 'unbacked-overwrite',
          softwarePath,
          block,
          originPath: preflight.originPath,
          reason: 'allow_unbacked_overwrite',
        });
      }

      // 2) 暂存外部源（在 DeletePlcBlock 之前导入，失败可零代价中止）
      phase = 'staged';
      const delSrcPre = await runStep(
        'staged',
        'DeletePlcExternalSource',
        { softwarePath, externalSourceName: safeBlock },
        { allowNotFound: true }
      );
      if (!delSrcPre.effectiveOk) {
        failedStep = 'DeletePlcExternalSource';
        failureReason = `清理同名外部源失败：${delSrcPre.text.slice(0, 600)}`;
        return failJson(failureReason, { executed: false, phase, failedStep, preflight, backup, rollback, warnings, steps });
      }
      const impSrc = await runStep('staged', 'ImportPlcExternalSource', {
        softwarePath,
        groupPath: '',
        filePath,
      });
      if (!impSrc.effectiveOk) {
        failedStep = 'ImportPlcExternalSource';
        failureReason = `导入外部源失败：${impSrc.text.slice(0, 600)}`;
        return failJson(failureReason, { executed: false, phase, failedStep, preflight, backup, rollback, warnings, steps });
      }

      // 3) 破坏性删除旧块（若已知存在或未探测）
      if (overwrite && preflight.exists !== false) {
        phase = 'deleted';
        const delPath = preflight.originPath || (preflight.targetGroup ? `${preflight.targetGroup}/${block}` : String(block));
        const delOpts = preflight.exists === true ? {} : { allowNotFound: true };
        const delRes = await runStep(
          'deleted',
          'DeletePlcBlock',
          { softwarePath, blockPath: delPath, dryRun: false },
          delOpts
        );
        if (!delRes.effectiveOk) {
          failedStep = 'DeletePlcBlock';
          failureReason = `删除旧块 "${delPath}" 失败：${delRes.text.slice(0, 600)}`;
          // 若 Delete 抛异常但实际已把块删掉，触发回滚保护；若块仍在则直接中止
          if (preflight.exists === true && canCallTool(up, 'GetBlockInfo')) {
            const checkStillThere = await invokeTool(up, 'GetBlockInfo', { softwarePath, blockPath: delPath }, 120000);
            if (!checkStillThere.ok && /\bnot found\b|不存在|未找到/i.test(checkStillThere.text)) {
              hasDeletedBlock = true;
            }
          }
          if (hasDeletedBlock) {
            rollback = await performRollback({ up, softwarePath, block, preflight, backup, failedStep, steps, recordStep });
          }
          return failJson(failureReason, {
            executed: false,
            phase,
            failedStep,
            preflight,
            backup,
            rollback,
            warnings,
            steps,
          });
        }
        if (preflight.exists === true || delRes.ok) {
          hasDeletedBlock = true;
        }
      }

      // 4) 从外部源生成块
      phase = 'generated';
      const genRes = await runStep('generated', 'GenerateBlocksFromExternalSource', {
        softwarePath,
        externalSourceName: safeBlock,
      });
      if (!genRes.effectiveOk) {
        failedStep = 'GenerateBlocksFromExternalSource';
        failureReason = `从外部源生成块失败：${genRes.text.slice(0, 600)}`;
        if (hasDeletedBlock) {
          rollback = await performRollback({ up, softwarePath, block, preflight, backup, failedStep, steps, recordStep });
        }
        return failJson(failureReason, {
          executed: false,
          phase,
          failedStep,
          preflight,
          backup,
          rollback,
          warnings,
          steps,
        });
      }

      // 5) 编译门：始终走 CompileAndDiagnosePlc 并区分本块错误与 foreignErrors
      phase = 'compiled';
      ensureLockOwnership();
      const cmpArgs = { softwarePath };
      const cmpCall = await invokeTool(up, 'CompileAndDiagnosePlc', cmpArgs, 900000);
      compileDiagnostics = checkSclCompileDiagnostics(
        cmpCall.res || cmpCall.text,
        preflight.blockName || block,
        preflight.targetGroup || ''
      );
      recordStep('compiled', 'CompileAndDiagnosePlc', cmpArgs, !compileDiagnostics.hasTargetErrors, false, cmpCall.text);

      if (compileDiagnostics.hasTargetErrors) {
        failedStep = 'CompileAndDiagnosePlc';
        failureReason = `SCL 编译未通过：${compileDiagnostics.targetErrors.slice(0, 3).join(' | ')}`;
        if (onCompileError === 'keep') {
          if (preflight.targetGroup) {
            placed = false;
            residueAt = '<root>';
          }
          rollback = { ...rollback, needed: false, attempted: false, state: 'skipped_on_compile_error_keep' };
        } else if (hasDeletedBlock || preflight.exists === false) {
          rollback = await performRollback({ up, softwarePath, block, preflight, backup, failedStep, steps, recordStep });
        }
        return failJson(failureReason, {
          executed: false,
          phase,
          failedStep,
          placed,
          ...(residueAt ? { residueAt } : {}),
          preflight,
          backup,
          rollback,
          compileDiagnostics,
          warnings,
          steps,
        });
      }

      // 6) 移入目标分组
      if (preflight.targetGroup) {
        phase = 'placed';
        const movRes = await runStep('placed', 'MoveBlockToGroup', {
          softwarePath,
          blockName: String(preflight.blockName || block),
          targetGroupPath: preflight.targetGroup,
          autoCreateGroup: true,
        });
        if (!movRes.effectiveOk) {
          failedStep = 'MoveBlockToGroup';
          failureReason = `移动块到分组 "${preflight.targetGroup}" 失败：${movRes.text.slice(0, 600)}`;
          if (hasDeletedBlock || preflight.exists === false) {
            rollback = await performRollback({ up, softwarePath, block, preflight, backup, failedStep, steps, recordStep });
          }
          return failJson(failureReason, {
            executed: false,
            phase,
            failedStep,
            placed: false,
            preflight,
            backup,
            rollback,
            compileDiagnostics,
            warnings,
            steps,
          });
        }
        placed = true;

        // MoveBlockToGroup 内部通过导出/删除/重导 XML 移组，会将新位置块重置为 IsConsistent=false，必须随手重编译恢复一致态
        phase = 'post_move_compiled';
        ensureLockOwnership();
        const postCmpCall = await invokeTool(up, 'CompileAndDiagnosePlc', cmpArgs, 900000);
        const postDiag = checkSclCompileDiagnostics(
          postCmpCall.res || postCmpCall.text,
          preflight.blockName || block,
          preflight.targetGroup || ''
        );
        compileDiagnostics = postDiag;
        recordStep('post_move_compiled', 'CompileAndDiagnosePlc', cmpArgs, !postDiag.hasTargetErrors, false, postCmpCall.text);
        if (postDiag.hasTargetErrors) {
          failedStep = 'CompileAndDiagnosePlc';
          failureReason = `移入分组后复编译未通过：${postDiag.targetErrors.slice(0, 3).join(' | ')}`;
          if (onCompileError === 'keep') {
            rollback = { ...rollback, needed: false, attempted: false, state: 'skipped_on_compile_error_keep' };
          } else if (hasDeletedBlock || preflight.exists === false) {
            rollback = await performRollback({ up, softwarePath, block, preflight, backup, failedStep, steps, recordStep });
          }
          return failJson(failureReason, {
            executed: false,
            phase,
            failedStep,
            placed,
            preflight,
            backup,
            rollback,
            compileDiagnostics,
            warnings,
            steps,
          });
        }
      }

      // 7) 清理临时外部源 & 若同块曾挂起恢复则自动清标
      phase = 'cleaned';
      await runStep(
        'cleaned',
        'DeletePlcExternalSource',
        { softwarePath, externalSourceName: safeBlock },
        { allowNotFound: true, optional: true }
      );
      const pending = readPendingRecovery();
      if (
        pending &&
        !pending.corrupt &&
        pending.block &&
        String(pending.block).toLowerCase() === String(block).toLowerCase() &&
        (!pending.softwarePath || pending.softwarePath === softwarePath)
      ) {
        clearPendingRecovery('overwrite-succeeded');
      }

      return ok({
        executed: true,
        phase,
        placed,
        targetGroup: preflight.targetGroup || '',
        preflight,
        backup,
        rollback,
        compileDiagnostics,
        warnings,
        steps,
      });
    } catch (e) {
      // 例如 ensureLockOwnership() 失锁异常：若已删除旧块，记录挂起恢复但不继续操作他人接管的 TIA
      failedStep = failedStep || phase;
      failureReason = e.message || String(e);
      if (hasDeletedBlock && backup.path) {
        writePendingRecovery({
          ts: new Date().toISOString(),
          phase,
          softwarePath,
          block,
          originPath: preflight.originPath,
          originGroup: preflight.originGroup || '',
          backupXmlPath: backup.path,
          backupMetaPath: backup.metaPath,
          sha256: backup.sha256,
          reason: `事务在 ${phase} 阶段异常中断：${failureReason}`,
          manualRecovery: {
            tool: 'ImportBlock',
            arguments: { softwarePath, groupPath: preflight.originGroup || '', importPath: backup.path },
          },
        });
        rollback = { ...rollback, needed: true, attempted: false, ok: false, state: 'aborted_lock_lost' };
      }
      return failJson(failureReason, {
        executed: false,
        phase,
        failedStep,
        preflight,
        backup,
        rollback,
        warnings,
        steps,
      });
    } finally {
      // 尽最大努力清理外部源（仅当仍持锁且未到达 cleaned）
      if (phase !== 'cleaned') {
        try {
          ensureLockOwnership();
          const cl = await invokeTool(
            up,
            'DeletePlcExternalSource',
            { softwarePath, externalSourceName: safeBlock },
            120000
          );
          recordStep('cleanup', 'DeletePlcExternalSource', { softwarePath, externalSourceName: safeBlock }, cl.ok, true, cl.text);
        } catch {}
      }
    }
  }

  async function handleWriteBlock(args) {
    const active = getActive();
    if (!active) return fail('还没有活动上游，先 d_connect');
    ensureLockOwnership();
    const up = await ensureUpstream(active);
    const rawBlockInput = stripRoot(args.block);
    const rawGroupInput = stripRoot(args.group);
    // 剥掉 AI 可能照抄的"程序块/Program blocks"根容器前缀；支持 block 写 "Group/Sub/Name"
    const { block, group } = normalizeBlockTarget(args.block, args.group);
    const format = args.format || 'scl';
    if (!block) return fail('缺少 block 参数');
    if (!EXT_BY_FORMAT[format]) return fail(`不支持的 format：${format}（可选 scl / s7dcl / xml / lad-spec）`);

    let content = args.content;
    let resolvedSourcePath = null;
    if (!content && args.source_path !== undefined && args.source_path !== null) {
      const srcPath = typeof args.source_path === 'string' ? args.source_path.trim() : '';
      if (!srcPath) return fail('source_path 不能为空');
      if (!isAbsoluteSourcePath(srcPath)) {
        return fail(
          `source_path 必须是绝对路径（收到相对路径 "${srcPath}"）。网关进程的 cwd（${process.cwd()}）不是你的工程目录，请传完整绝对路径，或改用 content 直接传源码。`
        );
      }
      resolvedSourcePath = srcPath;
      try {
        content = fs.readFileSync(srcPath, 'utf8').replace(/^\uFEFF/, '');
      } catch (e) {
        return fail(`读不到 source_path：${e.message}`);
      }
      if (!content) return fail(`source_path 文件内容为空：${srcPath}`);
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

    /* ---- B + .scl 前置静态校验与 Phase 0 预检 ---- */
    if (active === 'b' && format === 'scl') {
      if (SOFTWARE_UNITS_RE.test(rawBlockInput) || SOFTWARE_UNITS_RE.test(rawGroupInput) || SOFTWARE_UNITS_RE.test(group)) {
        return fail(
          'd_write_block 暂不支持对 "Software units/..." 路径执行 B 侧 .scl 外部源事务（Software units 独立于主 Program blocks 树）。请改用 d_call 调用单元相关工具。'
        );
      }
      if (/^(OB1|Main)$/i.test(String(block).trim())) {
        return fail(
          'B 上不能用 .scl 外部源写 OB1/Main（会和 CPU 自动生成的 OB1 冲突，整批回滚）。' +
            '请改用 format=s7dcl，或把逻辑放进 FC/FB 再由 OB1 调用。'
        );
      }
      const parsedScl = parseSclDeclarations(content);
      if (parsedScl.declarations.length === 0) {
        return fail('SCL 内容中未识别到有效的顶层块声明（FUNCTION_BLOCK / FUNCTION / DATA_BLOCK / ORGANIZATION_BLOCK / TYPE）。');
      }
      if (
        parsedScl.declarations.some(
          (d) => d.kind === 'ORGANIZATION_BLOCK' && /^(OB1|Main)$/i.test(d.name)
        )
      ) {
        return fail(
          'B 上不能用 .scl 外部源写 OB1/Main（源码内声明了 ORGANIZATION_BLOCK "OB1/Main"，会与 CPU 自动生成的 OB1 冲突）。'
        );
      }
      const matchedDecl = parsedScl.declarations.find((d) => d.name.toLowerCase() === block.toLowerCase());
      if (!matchedDecl) {
        const declaredList = parsedScl.declarations.map((d) => `${d.kind} "${d.name}"`).join(', ');
        return failJson(
          `SCL 源码声明的块名（${declaredList}）与参数 block="${block}" 不一致。为防止删除 "${block}" 后生成同名新块导致原块丢失，已拦截。`,
          { executed: false, phase: 'preflight', block, declared: parsedScl.declarations }
        );
      }

      const softwarePath = args.plc || 'PLC';
      const ancillaryDecls = parsedScl.declarations.filter((d) => d.name.toLowerCase() !== block.toLowerCase());
      const allowMultiBlock = args.allow_multi_block === true || args.allowMultiBlock === true;
      const isConfirm = args.confirm === true;

      const probeRes = await probeBlockPreflight({
        up,
        softwarePath,
        block,
        requestedGroup: group,
        ancillaryDecls,
        isConfirm,
      });
      if (!probeRes.ok) {
        return failJson(probeRes.error, { executed: false, phase: 'preflight', preflight: probeRes.preflight });
      }
      const preflight = probeRes.preflight;
      preflight.declared = parsedScl.declarations;

      if (ancillaryDecls.length > 0 && !allowMultiBlock && isConfirm) {
        const extraNames = ancillaryDecls.map((d) => `${d.kind} "${d.name}"`).join(', ');
        const existingNames = preflight.existingAncillaryBlocks.map((d) => d.originPath).join(', ');
        return failJson(
          `单份 .scl 文件包含多块顶层声明（附属声明：${extraNames}` +
            (existingNames ? `；工程中已存在：${existingNames}` : '') +
            '）。为防止 GenerateBlocksFromExternalSource 在无备份情况下连带改写或冲突，已阻断；请拆分文件或显式传入 allow_multi_block: true。',
          { executed: false, phase: 'preflight', preflight }
        );
      }

      const backupPolicy = decideBackupPolicy(preflight, {
        overwrite,
        allow_unbacked_overwrite: args.allow_unbacked_overwrite,
        allowUnbackedOverwrite: args.allowUnbackedOverwrite,
      });
      if (!backupPolicy.allowed) {
        return failJson(backupPolicy.reason, {
          executed: false,
          phase: 'preflight',
          preflight,
          backup: { status: backupPolicy.status },
        });
      }

      const warnings = [];
      if (ancillaryDecls.length > 0 && !allowMultiBlock) {
        warnings.push(
          `单份 .scl 含多块顶层声明（${ancillaryDecls.map((d) => `${d.kind} "${d.name}"`).join(', ')}）` +
            (preflight.existingAncillaryBlocks.length
              ? `，且工程中已存在 ${preflight.existingAncillaryBlocks.map((d) => d.originPath).join(', ')}`
              : '') +
            '；confirm:true 时必须拆分文件或显式传入 allow_multi_block: true。'
        );
      }
      if (preflight.pinnedBlockNumber !== null) {
        warnings.push(
          `目标块 "${block}" 启用了手动固定块号 ${preflight.pinnedBlockNumber}（AutoNumber=false）。` +
            `B 保持 lite 档位且 .scl 外部源必须删旧重建，成功覆盖后该号将被重置为自动编号（失败回滚时可通过 XML 备份恢复原号 ${preflight.pinnedBlockNumber}）；` +
            `如需保留手动块号，请改用 format="s7dcl" 或 format="xml"。`
        );
      }

      const safeBlock = slug(block);
      const dir = ensureDir(path.join(INBOX_DIR, `${stamp()}_${safeBlock}`));
      const fileName = `${safeBlock}.scl`;
      const filePath = path.join(dir, fileName);
      const written = writeBlockFile(filePath, content, 'scl');

      if (!isConfirm) {
        const previewPlan = [];
        if (backupPolicy.shouldBackup) {
          previewPlan.push({
            server: 'b',
            tool: 'ExportBlock',
            arguments: {
              softwarePath,
              blockPath: preflight.originPath,
              exportPath: `<OUTBOX_DIR>/${stamp()}_${safeBlock}_backup`,
              preservePath: false,
            },
          });
        }
        previewPlan.push(
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
        if (overwrite && preflight.exists !== false) {
          const delPath = preflight.originPath || (preflight.targetGroup ? `${preflight.targetGroup}/${block}` : String(block));
          previewPlan.push({
            server: 'b',
            tool: 'DeletePlcBlock',
            arguments: { softwarePath, blockPath: delPath, dryRun: false },
            allowNotFound: true,
          });
          if (!preflight.probed && preflight.targetGroup) {
            previewPlan.push({
              server: 'b',
              tool: 'DeletePlcBlock',
              arguments: { softwarePath, blockPath: String(block), dryRun: false },
              allowNotFound: true,
            });
          }
        }
        previewPlan.push(
          {
            server: 'b',
            tool: 'GenerateBlocksFromExternalSource',
            arguments: { softwarePath, externalSourceName: safeBlock },
          },
          {
            server: 'b',
            tool: 'CompileAndDiagnosePlc',
            arguments: { softwarePath },
          }
        );
        if (preflight.targetGroup) {
          previewPlan.push(
            {
              server: 'b',
              tool: 'MoveBlockToGroup',
              arguments: {
                softwarePath,
                blockName: String(preflight.blockName || block),
                targetGroupPath: preflight.targetGroup,
                autoCreateGroup: true,
              },
            },
            {
              server: 'b',
              tool: 'CompileAndDiagnosePlc',
              arguments: { softwarePath },
            }
          );
        }
        previewPlan.push({
          server: 'b',
          tool: 'DeletePlcExternalSource',
          arguments: { softwarePath, externalSourceName: safeBlock },
          allowNotFound: true,
        });

        return ok({
          prepared: written,
          preflight,
          backup: { status: backupPolicy.status, reason: backupPolicy.reason },
          warnings,
          plan: previewPlan,
          note:
            '这是写入计划，文件已按编码规则落盘。确认后带 confirm:true 重放（覆盖已存在块时将先导出 XML 备份并在失败时自动回滚）。' +
            (warnings.length ? ' 注意：' + warnings.join(' ') : ''),
        });
      }

      const onCompileError =
        args.on_compile_error === 'keep' || args.onCompileError === 'keep' ? 'keep' : 'rollback';
      return executeSclWriteTransaction({
        up,
        softwarePath,
        block,
        safeBlock,
        filePath,
        preflight,
        backupPolicy,
        overwrite,
        onCompileError,
        warnings,
      });
    }

    const safeBlock = slug(block);
    const dir = ensureDir(path.join(INBOX_DIR, `${stamp()}_${safeBlock}`));
    const fileName = `${safeBlock}${EXT_BY_FORMAT[format]}`;
    const filePath = path.join(dir, fileName);
    const written = writeBlockFile(filePath, content, format);

    let resContent = args.res_content;
    let resAutoLoadedFrom = null;
    if (format === 's7dcl' && !resContent && resolvedSourcePath) {
      const siblingRes = resolvedSourcePath.replace(/\.[^.\\/]+$/, '') + '.s7res';
      if (siblingRes !== resolvedSourcePath && fs.existsSync(siblingRes)) {
        try {
          resContent = fs.readFileSync(siblingRes, 'utf8').replace(/^\uFEFF/, '');
          resAutoLoadedFrom = siblingRes;
        } catch {}
      }
    }
    let resFile = null;
    if (format === 's7dcl' && resContent) {
      const resPath = path.join(dir, `${safeBlock}.s7res`);
      resFile = writeBlockFile(resPath, resContent, 's7dcl');
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
            importOption: overwrite ? 'Override' : 'None',
          },
        });
      } else if (format === 'xml') {
        const isPlcType = /<\s*SW\.Types\.PlcStruct\b|<\s*SW\.Types\./i.test(content);
        plan.push({
          server: 'b',
          tool: isPlcType ? 'ImportType' : 'ImportBlock',
          arguments: {
            softwarePath: args.plc || 'PLC',
            groupPath: group,
            importPath: filePath,
          },
        });
      } else {
        return fail(`B 不支持的 format：${format}`);
      }
    } else {
      return fail('C 写块需要先 plc_read 拿 contentHash，再 plc_write 带 expectedContentHash，请用 d_call 分两步做。');
    }

    if (args.confirm !== true) {
      return ok({
        prepared: written,
        resFile,
        ...(resAutoLoadedFrom ? { resAutoLoadedFrom } : {}),
        plan,
        note:
          '这是写入计划，文件已按编码规则落盘。确认后带 confirm:true 重放。' +
          (format === 's7dcl' && !resContent
            ? ' 注意：s7dcl 若含标题/中文注释，需要同时提供 res_content（或同目录配对 .s7res），否则导入会失败。'
            : '') +
          (active === 'b' && format === 'xml' && !overwrite
            ? ' 注意：B 的 XML 导入固定以 Override 方式执行，不支持 overwrite:false。'
            : ''),
      });
    }

    return runPlan(plan);
  }

  return {
    handleReadBlock,
    handleWriteBlock,
    runPlan,
  };
}

module.exports = {
  createBlockHandlers,
  parseSclDeclarations,
  findBlockInHierarchy,
  decideBackupPolicy,
  checkSclCompileDiagnostics,
  isEngineeringNotSupportedError,
};
