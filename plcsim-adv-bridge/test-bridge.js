'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { execFileSync, spawn } = require('child_process');

const EXE = path.join(__dirname, 'bin', 'plcsim-adv-bridge.exe');
const TEST_IP = (process.env.PLCSIM_TEST_IP || '').trim() || '172.31.152.201';
const TEST_MASK = (process.env.PLCSIM_TEST_MASK || '').trim() || '255.255.255.0';

function runCli(args) {
  const stdout = execFileSync(EXE, args, { encoding: 'utf8', timeout: 60000 });
  return JSON.parse(stdout.trim());
}

async function testMcpMode(tmpStore, simName) {
  return new Promise((resolve, reject) => {
    const child = spawn(EXE, ['--mcp'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '';
    const pending = new Map();
    let seq = 1;
    let settled = false;

    function rejectAllPending(err) {
      for (const [, h] of pending) {
        clearTimeout(h.timer);
        h.rej(err);
      }
      pending.clear();
    }

    function rpc(method, params) {
      const id = seq++;
      return new Promise((res, rej) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          rej(new Error(`MCP timeout waiting for ${method}`));
        }, 45000);
        pending.set(id, { res, rej, timer });
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      });
    }

    child.stdout.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        const h = pending.get(msg.id);
        if (!h) continue;
        clearTimeout(h.timer);
        pending.delete(msg.id);
        if (msg.error) h.rej(new Error(msg.error.message || JSON.stringify(msg.error)));
        else h.res(msg.result);
      }
    });

    child.on('error', (err) => {
      rejectAllPending(err);
      if (!settled) {
        settled = true;
        reject(err);
      }
    });

    child.on('exit', (code) => {
      if (pending.size > 0) {
        rejectAllPending(new Error(`MCP bridge exited unexpectedly (code=${code})`));
      }
    });

    (async () => {
      let mcpCleaned = false;
      try {
        const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } });
        assert.strictEqual(init.serverInfo.name, 'plcsim-adv-bridge');
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

        const tools = await rpc('tools/list', {});
        assert(Array.isArray(tools.tools) && tools.tools.length >= 12);

        const createRes = await rpc('tools/call', {
          name: 'plcsim_create_instance',
          arguments: {
            name: simName,
            cpu: 'CPU1513',
            storage: path.join(tmpStore, 'mcp_inst'),
            'network-mode': 'TCPIPSingleAdapter',
            ip: TEST_IP,
            mask: TEST_MASK,
            'power-on': 'true',
          },
        });
        const createJson = JSON.parse(createRes.content[0].text);
        assert.strictEqual(createJson.ok, true);
        assert.strictEqual(createJson.data.instance.operatingState, 'Stop');

        const listRes = await rpc('tools/call', { name: 'plcsim_list_instances', arguments: {} });
        const listJson = JSON.parse(listRes.content[0].text);
        assert(listJson.data.instances.some((x) => x.name === simName));

        const cleanRes = await rpc('tools/call', { name: 'plcsim_cleanup', arguments: { name: simName, 'delete-storage': 'true' } });
        const cleanJson = JSON.parse(cleanRes.content[0].text);
        assert.strictEqual(cleanJson.ok, true);
        assert.strictEqual(cleanJson.data.unregistered, true);
        mcpCleaned = true;

        child.stdin.end();
        child.once('exit', () => {
          if (!settled) {
            settled = true;
            resolve({ toolCount: tools.tools.length, simName });
          }
        });
      } catch (e) {
        if (!mcpCleaned) {
          try {
            await rpc('tools/call', { name: 'plcsim_cleanup', arguments: { name: simName, 'delete-storage': 'true' } });
          } catch {}
        }
        try { child.kill(); } catch {}
        if (!settled) {
          settled = true;
          reject(e);
        }
      }
    })();
  });
}

async function main() {
  const tmpStore = fs.mkdtempSync(path.join(os.tmpdir(), 'plcsim_bridge_test_'));
  const simCliName = `TIA_CLI_TEST_${process.pid}`;
  const simMcpName = `TIA_MCP_TEST_${process.pid}`;
  let initialMode = null;
  let initialBoundNics = [];

  try {
    const st0 = runCli(['status']);
    assert.strictEqual(st0.ok, true);
    initialMode = st0.data.networkMode || 'Softbus';
    if (Array.isArray(st0.data.netInterfaces)) {
      initialBoundNics = st0.data.netInterfaces
        .filter((nic) => nic && nic.vSwitchBindingEnabled)
        .map((nic) => nic.interfaceIndex)
        .filter((idx) => idx !== undefined && idx !== null);
    }

    // Test CLI cross-invocation persistence via auto-started named-pipe holder
    const c = runCli([
      'create',
      '--name', simCliName,
      '--cpu', 'CPU1513',
      '--storage', path.join(tmpStore, 'cli_inst'),
      '--network-mode', 'TCPIPSingleAdapter',
      '--ip', TEST_IP,
      '--mask', TEST_MASK,
      '--power-on',
    ]);
    assert.strictEqual(c.ok, true);
    assert.strictEqual(c.data.instance.operatingState, 'Stop');

    const l = runCli(['list']);
    assert.strictEqual(l.ok, true);
    const found = l.data.instances.find((x) => x.name === simCliName);
    assert(found, 'CLI instance should persist across CLI calls');
    assert.strictEqual(found.operatingState, 'Stop');

    const stopRes = runCli(['stop', '--name', simCliName]);
    assert.strictEqual(stopRes.ok, true);
    assert.strictEqual(stopRes.data.operatingState, 'Stop');

    const clean = runCli(['cleanup', '--name', simCliName, '--delete-storage', 'true']);
    assert.strictEqual(clean.ok, true);
    assert.strictEqual(clean.data.unregistered, true);

    // Wait briefly for auto-exit daemon shutdown
    await new Promise((r) => setTimeout(r, 400));

    // Test MCP stdio mode
    const mcpSummary = await testMcpMode(tmpStore, simMcpName);

    const bindIndexNote =
      initialMode === 'Softbus'
        ? 'Softbus mode does not require --bind-index'
        : initialBoundNics.length === 1
          ? `Restored with --bind-index ${initialBoundNics[0]}`
          : initialBoundNics.length > 1
            ? `Initial vSwitch bindings [${initialBoundNics.join(', ')}]; CLI --bind-index restores first index (${initialBoundNics[0]})`
            : 'No pre-existing vSwitch binding detected; --bind-index omitted';

    console.log(JSON.stringify({
      ok: true,
      testIp: TEST_IP,
      cliVerified: simCliName,
      mcpVerified: mcpSummary,
      restoredNetworkMode: initialMode,
      bindIndexNote,
    }, null, 2));
  } finally {
    try { runCli(['cleanup', '--name', simCliName, '--delete-storage', 'true']); } catch {}
    try { runCli(['cleanup', '--name', simMcpName, '--delete-storage', 'true']); } catch {}
    if (initialMode) {
      const restoreArgs = ['network-mode', '--set', initialMode];
      if (
        (initialMode === 'TCPIPSingleAdapter' || initialMode === 'TCPIPMultipleAdapter') &&
        initialBoundNics.length > 0
      ) {
        restoreArgs.push('--bind-index', String(initialBoundNics[0]));
      }
      try {
        runCli(restoreArgs);
      } catch (restoreErr) {
        console.error('Failed to restore network-mode:', restoreErr && restoreErr.message ? restoreErr.message : restoreErr);
      }
    }
    try { runCli(['daemon-stop']); } catch {}
    try { fs.rmSync(tmpStore, { recursive: true, force: true }); } catch {}
  }
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
