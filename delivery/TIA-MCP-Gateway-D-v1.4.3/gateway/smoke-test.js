#!/usr/bin/env node
'use strict';
/*
 * 网关 D 的离线自检（不需要 TIA 正在运行）。
 * 不需要 TIA 正在运行：只验证协议层、路由、编码、计划生成、锁、编译判据。
 * 用法：node smoke-test.js [gateway 文件名]
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const GW_FILE = process.argv[2] || 'gateway.js';
const NODE = process.execPath;
const GW = path.join(__dirname, GW_FILE);
const RUNTIME = path.join(__dirname, 'runtime');

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + String(detail).replace(/\n/g, ' ').slice(0, 140) : ''}`);
}

function makeClient(tag) {
  const p = spawn(NODE, [GW], {
    cwd: __dirname,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, HTTP_PROXY: '', HTTPS_PROXY: '', http_proxy: '', https_proxy: '' },
  });
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
        console.error('非 JSON 输出:', line.slice(0, 160));
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

function text(res) {
  const r = (res && res.result) || {};
  if (r.content) return r.content.map((c) => c.text).join('\n');
  return JSON.stringify(r);
}
function parse(res) {
  try {
    return JSON.parse(text(res));
  } catch {
    return null;
  }
}

(async () => {
  fs.rmSync(path.join(RUNTIME, 'active.lock'), { force: true });

  /* ---------- 纯函数单元测试 ---------- */
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
  const errOk = errCases.every(([t, want]) => g.compileHasErrors(t) === want);
  record('compileHasErrors 9 种形态', errOk, errCases.length + ' 个用例');
  record('slug 过滤路径穿越与保留名', g.slug('..') === '_' && g.slug('CON') === '_CON', `${g.slug('..')} / ${g.slug('CON')}`);
  record('versionFromPath 从 .ap20 推断', g.versionFromPath('D:\\p\\line.ap20') === 20, '');

  // 带前缀文本时，兜底正则必须容忍键名后的引号
  record(
    'compileHasErrors 容忍带前缀与引号',
    g.compileHasErrors('编译输出如下 {"errorCount": 2}') === true &&
      g.compileHasErrors('result: {"error_count":1}') === true,
    ''
  );
  // 子项里的 ok:false 不应把整体判成编译失败
  record(
    'compileHasErrors 不被子项 ok:false 误判',
    g.compileHasErrors('{"errorCount":0,"state":"Success","items":[{"ok":false}]}') === false,
    ''
  );
  // 块名中间的单个点必须保留（B 用块名反查原块号）
  record('slug 保留块名中间的单个点', g.slug('FB_Motor.V2') === 'FB_Motor.V2', g.slug('FB_Motor.V2'));

  // isToolFailure 必须识别"正常返回但载荷失败"
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
  // 剥掉"程序块/Program blocks"根容器前缀
  record(
    'stripRoot 剥根容器前缀',
    g.stripRoot('程序块/Main') === 'Main' &&
      g.stripRoot('Program blocks/工位A/FC_1') === '工位A/FC_1' &&
      g.stripRoot('工位A/子功能/FC_1') === '工位A/子功能/FC_1' &&
      g.stripRoot('') === '',
    [g.stripRoot('程序块/Main'), g.stripRoot('Program blocks/工位A/FC_1')].join(' | ')
  );

  // allowNotFound 只吞"目标不存在"，不吞路径错/在线模式
  record(
    'isTolerableFailure 只吞 NotFound',
    g.isTolerableFailure({ allowNotFound: true }, "block 'X' not found in 'PLC_1'") === true &&
      g.isTolerableFailure({ allowNotFound: true }, 'PLC software not found at PLC') === false &&
      g.isTolerableFailure({ allowNotFound: true }, 'not permitted in online mode') === false &&
      g.isTolerableFailure({}, 'anything') === false &&
      g.isTolerableFailure({ optional: true }, 'anything') === true,
    ''
  );

  // 编译结果是小写 state（真机 {"state":"Error"}），必须也认出来
  record(
    'isToolFailure 认小写 state',
    g.isToolFailure({ content: [{ type: 'text', text: '{"state":"Error","errorCount":4}' }] }) === true &&
      g.isToolFailure({ content: [{ type: 'text', text: '{"state":"Success","errorCount":0}' }] }) === false,
    ''
  );


  // GetProject 返回数组/信封时也要能挖出工程名
  const pn = [
    ['{"projectName":"Line1"}', 'Line1'],
    ['[{"name":"P1"}]', 'P1'],
    ['{"items":[{"ProjectName":"P2"}]}', 'P2'],
    ['{"items":[{"name":"A"},{"name":"B"}]}', null],
    ['{"projects":[]}', null],
  ];
  record('extractProjectName 5 种形态', pn.every(([t, want]) => g.extractProjectName(t) === want), pn.length + ' 个用例');


  /* ---------- 协议层 ---------- */
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
  record('d_status 含 lock 字段', !!st && Array.isArray(st.upstreams) && st.upstreams.length === 3 && 'lock' in st, 'active=' + (st && st.active));

  const doc = parse(await c.call('d_doctor'));
  record(
    'd_doctor 有检查项',
    !!doc && Array.isArray(doc.checks) && doc.checks.length >= 4,
    doc && doc.checks.map((x) => `${x.name}:${x.ok}`).join(' ')
  );

  const ver = parse(await c.call('d_versions'));
  record('d_versions 探测到 V20', !!ver && (ver.installed || []).some((v) => String(v).startsWith('20')), ver && ver.installed.join(','));

  const lt = parse(await c.call('d_list_tools', { server: 'b', filter: 'compile', limit: 5 }));
  record('d_list_tools(b) 同时查 lite 与全量', !!lt && lt.totalMatched > 0 && !!lt.fullRoster, lt && `lite 匹配 ${lt.totalMatched}`);

  const a1 = parse(await c.call('d_call', { server: 'a', tool: 'get_tia_status', arguments: {} }));
  record('d_call(a,get_tia_status)', !!a1 && a1.ok === true, JSON.stringify(a1));

  const b1 = parse(await c.call('d_call', { server: 'b', tool: 'Bootstrap', arguments: {} }));
  record(
    'd_call(b,Bootstrap)',
    !!b1 && b1.ready === true,
    b1 && `tia=${b1.environment && b1.environment.tiaVersionDetected} group=${b1.environment && b1.environment.opennessGroupOk}`
  );

  const st2 = parse(await c.call('d_status'));
  const bUp = st2 && st2.upstreams.find((u) => u.server === 'b');
  record('切换后 active=b 且 b 已启动', !!st2 && st2.active === 'b' && bUp.started && bUp.tools === 65, bUp && `tools=${bUp.tools}`);

  /* L2 工具可达性：B 上不在 lite 档的工具必须能自动走 CallTool 转发 */
  const l2 = await c.call('d_call', { server: 'b', tool: 'GetPlcExternalSources', arguments: { softwarePath: 'PLC' } }, 300000);
  const l2Text = text(l2);
  record('d_call 能触达 B 的非 lite 工具', !/没有工具|未找到工具/.test(l2Text), l2Text.replace(/\n/g, ' ').slice(0, 100));

  /* ---------- 写块与编码 ---------- */
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
  record(
    's7dcl 未给 res_content 时提示 .s7res',
    !!s7 && typeof s7.note === 'string' && s7.note.includes('.s7res'),
    s7 && s7.note.slice(0, 60)
  );
  record('s7dcl 计划走 ImportFromDocuments(Override)', !!s7 && s7.plan[0].tool === 'ImportFromDocuments' && s7.plan[0].arguments.importOption === 'Override', '');
  // B 上带 group 的 SCL 计划必须"外部源 groupPath 为空 + 末尾 MoveBlockToGroup"
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
  record(
    'B+SCL+group：外部源 groupPath 固定为空',
    !!imp && imp.arguments.groupPath === '',
    imp ? JSON.stringify(imp.arguments.groupPath) : 'no step'
  );
  record(
    'B+SCL+group：末尾插入 MoveBlockToGroup 且目标组已剥前缀',
    !!mov && mov.arguments.targetGroupPath === '工位A/子功能' && mov.arguments.autoCreateGroup === true,
    mov ? mov.arguments.targetGroupPath : 'no step'
  );

  // 移动分组前必须先编译（否则块 inconsistent，MoveBlockToGroup 内部导出会失败）
  const cmpi = grp && grp.plan.findIndex((s) => s.tool === 'CompileSoftware');
  const movi = grp && grp.plan.findIndex((s) => s.tool === 'MoveBlockToGroup');
  record(
    'B+SCL+group：编译步骤在移动之前',
    cmpi > -1 && movi > -1 && cmpi < movi,
    `compile@${cmpi} move@${movi}`
  );


  const obRes = await c.call('d_write_block', {
    block: 'OB1',
    format: 'scl',
    content: 'ORGANIZATION_BLOCK "Main"\nBEGIN\nEND_ORGANIZATION_BLOCK',
    plc: 'PLC',
  });
  const obText = text(obRes);
  record(
    'B 上 .scl 写 OB1 被拒并给出替代',
    !!(obRes.result && obRes.result.isError) || /OB1|不能/.test(obText),
    obText.replace(/\n/g, ' ').slice(0, 80)
  );

  const auditExists = fs.existsSync(path.join(RUNTIME, 'd.log'));
  record('审计日志已写入', auditExists, auditExists ? 'runtime/d.log' : '');

  c.p.kill();

  /* ---------- 独占锁：不同上游 + 同一上游都要拦 ---------- */
  const c2 = makeClient('lock-holder');
  await c2.init();
  await c2.call('d_call', { server: 'a', tool: 'get_tia_status', arguments: {} });

  const c3 = makeClient('intruder-other');
  await c3.init();
  const intrOther = text(await c3.call('d_call', { server: 'b', tool: 'Bootstrap', arguments: {} }));
  record('锁拦住「不同上游」的第二个宿主', /另一个网关实例|占用 TIA/.test(intrOther), intrOther.slice(0, 90));

  const c4 = makeClient('intruder-same');
  await c4.init();
  const intrSame = text(await c4.call('d_call', { server: 'a', tool: 'get_tia_status', arguments: {} }));
  record('锁拦住「同一上游」的第二个宿主', /另一个网关实例|占用 TIA/.test(intrSame), intrSame.slice(0, 90));

  c2.p.kill();
  c3.p.kill();
  c4.p.kill();

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
