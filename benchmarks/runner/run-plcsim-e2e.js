#!/usr/bin/env node
'use strict';

const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const {
  REPO_ROOT,
  DEFAULT_TIA_MCP_EXE,
  DEFAULT_PLCSIM_BRIDGE_EXE,
  assertNoActiveGatewayLock,
  McpStdioClient,
} = require('./tia-mcp-client');
const { generateAll } = require('./generate-plc-harness');
const { generateLadHarness } = require('./lad-harness');

const BENCHMARKS_DIR = path.resolve(__dirname, '..');
const GOLDEN_DIR = path.join(BENCHMARKS_DIR, 'golden_library');
const GOLDEN_SCL_DIR = path.join(GOLDEN_DIR, 'scl');
const GOLDEN_UDT_DIR = path.join(GOLDEN_DIR, 'udt');
const VECTORS_DIR = path.join(BENCHMARKS_DIR, 'test_vectors');
const MANIFEST_PATH = path.join(__dirname, 'deviation-manifest.json');
const DEFAULT_REPORTS_DIR = path.join(BENCHMARKS_DIR, 'logs');

const BLOCK_ORDER = [
  'FC_AnalogScaleAlarm',
  'FB_LowPassFilter',
  'FB_CylinderCtrl',
  'FB_MotorRevCtrl',
  'FB_RingFifo',
  'FC_ButtonDebounceToggle',
  'FB_ModbusPoller',
  'FB_DualEStopInterlock',
  'FB_FIO_SortingByHeight',
  'FB_FIO_PickAndPlace',
  'FB_FIO_BufferConveyor',
  'FB_FIO_Turntable',
  'FB_FIO_AutomatedWarehouse',
  'FB_FIO_TankLevelPID',
  'FB_FIO_Assembler',
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function checkTcpPort(ip, port, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      try { sock.destroy(); } catch {}
      resolve(ok);
    };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => finish(true));
    sock.once('timeout', () => finish(false));
    sock.once('error', () => finish(false));
    sock.connect(port, ip);
  });
}

async function waitForPlcTcpReady(ip, maxWaitMs = 10000) {
  if (!ip) return false;
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    if (await checkTcpPort(ip, 102, 1000)) return true;
    await sleep(250);
  }
  return false;
}

function assertSafeTempPath(targetPath) {
  const resolved = path.resolve(targetPath).toLowerCase();
  const forbidden = ['d:\\tia_projects', 'd:\\tia_portal_v20', GOLDEN_DIR.toLowerCase()];
  for (const prefix of forbidden) {
    if (resolved === prefix || resolved.startsWith(prefix + path.sep)) {
      throw new Error(`SAFETY REFUSAL: temp path '${targetPath}' must NEVER touch '${prefix}'`);
    }
  }
}

function parseArgs(argv) {
  const opts = {
    blocks: [],
    all: false,
    ladPath: '',
    dutPath: '',
    customTargets: [],
    ladDirs: [],
    udtPath: '',
    vectorsPath: '',
    mode: 'manifest',
    timeScale: 1,
    marginMs: 20,
    scanMs: 10,
    networkMode: 'TCPIPSingleAdapter',
    plcIp: '192.168.250.10',
    subnetMask: '255.255.255.0',
    instanceName: `TIA_E2E_SIM_${process.pid}`,
    plcName: 'PLC_1',
    cpuType: 'CPU1513',
    mlfb: '6ES7 513-1AM03-0AB0',
    catalogVersion: 'V3.1',
    readMode: 'auto',
    watchTable: '',
    freshProjectPerBlock: false,
    keepTemp: false,
    json: false,
    reportPath: '',
    jsonReportPath: '',
    timeoutMs: 0,
    tiaExe: DEFAULT_TIA_MCP_EXE,
    bridgeExe: DEFAULT_PLCSIM_BRIDGE_EXE,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') opts.all = true;
    else if (a === '--block' && argv[i + 1]) {
      const val = argv[++i];
      if (val.toLowerCase() === 'all') opts.all = true;
      else opts.blocks.push(...val.split(',').map((s) => s.trim()).filter(Boolean));
    } else if ((a === '--lad' || a === '--dut') && argv[i + 1]) {
      const p = path.resolve(argv[++i]);
      if (a === '--lad') opts.ladPath = p;
      opts.dutPath = p;
      opts.customTargets.push({ dutPath: p, isLad: a === '--lad' });
    } else if (a === '--lad-dir' && argv[i + 1]) {
      opts.ladDirs.push(path.resolve(argv[++i]));
    } else if (a === '--udt' && argv[i + 1]) opts.udtPath = path.resolve(argv[++i]);
    else if (a === '--vectors' && argv[i + 1]) opts.vectorsPath = path.resolve(argv[++i]);
    else if (a === '--mode' && argv[i + 1]) opts.mode = argv[++i];
    else if (a === '--time-scale' && argv[i + 1]) opts.timeScale = Number(argv[++i]);
    else if (a === '--margin-ms' && argv[i + 1]) opts.marginMs = Number(argv[++i]);
    else if (a === '--scan-ms' && argv[i + 1]) opts.scanMs = Number(argv[++i]);
    else if (a === '--network-mode' && argv[i + 1]) opts.networkMode = argv[++i];
    else if (a === '--plc-ip' && argv[i + 1]) opts.plcIp = argv[++i];
    else if (a === '--subnet-mask' && argv[i + 1]) opts.subnetMask = argv[++i];
    else if (a === '--mlfb' && argv[i + 1]) opts.mlfb = argv[++i];
    else if (a === '--cpu-type' && argv[i + 1]) opts.cpuType = argv[++i];
    else if (a === '--catalog-version' && argv[i + 1]) opts.catalogVersion = argv[++i];
    else if (a === '--instance' && argv[i + 1]) opts.instanceName = argv[++i];
    else if (a === '--read-mode' && argv[i + 1]) opts.readMode = argv[++i];
    else if (a === '--watch-table' && argv[i + 1]) opts.watchTable = argv[++i];
    else if (a === '--fresh-project-per-block') opts.freshProjectPerBlock = true;
    else if (a === '--keep-temp') opts.keepTemp = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--report' && argv[i + 1]) opts.reportPath = path.resolve(argv[++i]);
    else if (a === '--json-report' && argv[i + 1]) opts.jsonReportPath = path.resolve(argv[++i]);
    else if (a === '--timeout-ms' && argv[i + 1]) opts.timeoutMs = Number(argv[++i]);
    else if (a === '--help' || a === '-h') opts.help = true;
    else throw new Error(`Unknown CLI argument: ${a}`);
  }
  return opts;
}

function loadGoldenTargets(opts) {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const policies = manifest.blockPolicies || {};
  const idToName = new Map();
  for (const [name, p] of Object.entries(policies)) {
    idToName.set(String(p.blockId).toUpperCase(), name);
  }

  let selectedNames;
  if (opts.all) {
    selectedNames = BLOCK_ORDER.filter((n) => policies[n]);
  } else if (opts.blocks.length > 0) {
    selectedNames = opts.blocks.map((token) => {
      const upper = token.toUpperCase();
      if (idToName.has(upper)) return idToName.get(upper);
      if (policies[token]) return token;
      throw new Error(`Unknown golden block selector: '${token}'`);
    });
  } else if (!opts.dutPath && opts.customTargets.length === 0 && opts.ladDirs.length === 0) {
    throw new Error('Specify --block <A01|BlockName|all> or --lad <file> / --lad-dir <dir> / --dut <file>');
  } else {
    return [];
  }

  return selectedNames.map((blockName) => {
    const vecPath = path.join(VECTORS_DIR, `${blockName}.json`);
    const vec = JSON.parse(fs.readFileSync(vecPath, 'utf8'));
    const udtName = vec.udtName;
    const udtFile = udtName ? path.join(GOLDEN_UDT_DIR, `${udtName}.xml`) : '';
    const dutFile = path.join(GOLDEN_SCL_DIR, `${blockName}.scl`);
    if (!fs.existsSync(dutFile)) throw new Error(`Missing DUT file: ${dutFile}`);
    if (udtFile && !fs.existsSync(udtFile)) throw new Error(`Missing UDT file: ${udtFile}`);
    return {
      kind: 'golden',
      blockId: policies[blockName].blockId,
      blockName,
      udtName,
      udtPath: udtFile,
      dutPath: dutFile,
      dutFormat: 'scl',
    };
  });
}

function extractBlockNumber(blockInfoRes) {
  const candidates = [];
  if (blockInfoRes && blockInfoRes.Number !== undefined) candidates.push(blockInfoRes.Number);
  if (blockInfoRes && blockInfoRes.number !== undefined) candidates.push(blockInfoRes.number);
  const attrs = blockInfoRes && (blockInfoRes.Attributes || blockInfoRes.attributes);
  if (Array.isArray(attrs)) {
    for (const item of attrs) {
      if (item && String(item.Name || item.name).toLowerCase() === 'number') {
        candidates.push(item.Value !== undefined ? item.Value : item.value);
      }
    }
  } else if (attrs && typeof attrs === 'object') {
    for (const [k, v] of Object.entries(attrs)) {
      if (k.toLowerCase() === 'number') candidates.push(v);
    }
  }
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isInteger(n) && n > 0) return n;
  }
  throw new Error(`Unable to resolve block Number from GetBlockInfo: ${JSON.stringify(blockInfoRes)}`);
}

function summaryItemsSpecs(dbNumber) {
  const p = `DB${dbNumber}`;
  return [
    `${p}.DBX0.0`, // done
    `${p}.DBX0.1`, // passed
    `${p}.DBX0.2`, // running
    `${p}.DBX0.3`, // hasError
    `${p}.DBW2:INT`,
    `${p}.DBW4:INT`,
    `${p}.DBW6:INT`,
    `${p}.DBW8:INT`,
    `${p}.DBW10:INT`,
    `${p}.DBW12:INT`,
    `${p}.DBW14:INT`,
    `${p}.DBW16:INT`,
    `${p}.DBW18:INT`,
    `${p}.DBW20:INT`,
    `${p}.DBX22.0`,
    `${p}.DBD24:DWORD`,
    `${p}.DBW28:WORD`,
    `${p}.DBD32:DINT`,
    `${p}.DBD36:DINT`,
    `${p}.DBD40:REAL`,
    `${p}.DBD44:REAL`,
    `${p}.DBD48:DINT`,
    `${p}.DBD52:DINT`,
    `${p}.DBW56:WORD`,
    `${p}.DBW58:WORD`,
    `${p}.DBX60.0`,
    `${p}.DBX60.1`,
  ];
}

function parseS7LiveItemsToSummary(liveRes, dbNumber) {
  if (liveRes && (liveRes.ok === false || liveRes.Ok === false || liveRes.success === false || liveRes.Success === false)) {
    throw new Error(`S7 live read returned failure: ${JSON.stringify(liveRes)}`);
  }
  const items = (liveRes && liveRes.Data && liveRes.Data.items) || (liveRes && liveRes.data && liveRes.data.items) || (liveRes && liveRes.items) || [];
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error(`S7 live read returned no items: ${JSON.stringify(liveRes)}`);
  }
  const bySpec = new Map();
  for (const it of items) {
    if (it && it.spec) bySpec.set(String(it.spec).toUpperCase(), it.value);
  }
  if (bySpec.size === 0) {
    throw new Error(`S7 live read returned items without specs: ${JSON.stringify(liveRes)}`);
  }
  const p = `DB${dbNumber}`.toUpperCase();
  const g = (s) => bySpec.get(`${p}.${s}`.toUpperCase());
  const num = (s) => Number(g(s) ?? 0);
  const bool = (s) => Boolean(g(s));
  const statusVal = num('DBW28:WORD');
  return {
    done: bool('DBX0.0'),
    passed: bool('DBX0.1'),
    running: bool('DBX0.2'),
    hasError: bool('DBX0.3'),
    totalCases: num('DBW2:INT'),
    executedCases: num('DBW4:INT'),
    passedCases: num('DBW6:INT'),
    failedCases: num('DBW8:INT'),
    skippedCases: num('DBW10:INT'),
    currentCaseIndex: num('DBW12:INT'),
    currentStepIndex: num('DBW14:INT'),
    firstFailCase: num('DBW16:INT'),
    firstFailStep: num('DBW18:INT'),
    firstFailFieldIndex: num('DBW20:INT'),
    firstFailIsHmi: bool('DBX22.0'),
    firstFailMask: num('DBD24:DWORD'),
    statusCode: statusVal,
    statusCodeHex: `0x${(statusVal >>> 0).toString(16).toUpperCase().padStart(4, '0')}`,
    totalStepsExecuted: num('DBD32:DINT'),
    failedStepsCount: num('DBD36:DINT'),
    firstFailActualReal: num('DBD40:REAL'),
    firstFailExpectedReal: num('DBD44:REAL'),
    firstFailActualDInt: num('DBD48:DINT'),
    firstFailExpectedDInt: num('DBD52:DINT'),
    firstFailActualWord: num('DBW56:WORD'),
    firstFailExpectedWord: num('DBW58:WORD'),
    firstFailActualBool: bool('DBX60.0'),
    firstFailExpectedBool: bool('DBX60.1'),
  };
}

async function readTestSummary({ plcsim, tia, ip, dbNumber, readMode, watchTable, softwarePath, instanceName }) {
  const channelErrors = {};
  if (readMode === 'sharp7' || readMode === 'auto') {
    try {
      const s7 = await plcsim.callTool(
        'plcsim_read_db',
        { ip, db: dbNumber, offset: 0, size: 62, rack: 0, slot: 1, 'parse-summary': true },
        15000
      );
      if (s7 && s7.ok && s7.data && s7.data.summary) {
        return { channel: 'sharp7-s7-102', summary: s7.data.summary, rawHex: s7.data.hex };
      }
      channelErrors.sharp7 = `Unexpected plcsim_read_db payload: ${JSON.stringify(s7)}`;
    } catch (err) {
      channelErrors.sharp7 = err && err.message ? err.message : String(err);
      if (readMode === 'sharp7') throw err;
      // Fallback to TiaMcpServer S7 reader
    }
  }

  if (readMode === 'mcp-s7' || readMode === 'auto') {
    try {
      const specs = summaryItemsSpecs(dbNumber);
      const live = await tia.callTool(
        'ReadPlcLiveValuesS7',
        { ip, itemsJson: JSON.stringify(specs), rack: 0, slot: 1 },
        15000
      );
      return { channel: 'mcp-ReadPlcLiveValuesS7', summary: parseS7LiveItemsToSummary(live, dbNumber), channelErrors };
    } catch (err) {
      channelErrors.mcpS7 = err && err.message ? err.message : String(err);
      if (readMode === 'mcp-s7') throw err;
    }
  }

  if ((readMode === 'watch-table' || readMode === 'auto') && watchTable) {
    try {
      const wt = await tia.callTool(
        'MonitorWatchTableLiveS7',
        { softwarePath, watchTableName: watchTable, ip, rack: 0, slot: 1 },
        15000
      );
      return { channel: 'watch-table-fallback', summary: parseS7LiveItemsToSummary(wt, dbNumber), channelErrors };
    } catch (err) {
      channelErrors.watchTable = err && err.message ? err.message : String(err);
      if (readMode === 'watch-table') throw err;
    }
  }

  if (readMode === 'plcsim-tags' || readMode === 'auto') {
    try {
      const tagRes = await plcsim.callTool(
        'plcsim_read_tags',
        { name: instanceName, db: 'DB_TestSummary' },
        15000
      );
      const byField = new Map();
      for (const t of (tagRes.data && tagRes.data.tags) || []) {
        const short = String(t.name).replace(/^"?DB_TestSummary"?\./i, '');
        byField.set(short, t.value);
      }
      if (byField.size > 0) {
        const statusCode = Number(byField.get('statusCode') ?? 0);
        return {
          channel: 'plcsim-tags-fallback',
          channelErrors,
          summary: {
          done: Boolean(byField.get('done')),
          passed: Boolean(byField.get('passed')),
          running: Boolean(byField.get('running')),
          hasError: Boolean(byField.get('hasError')),
          totalCases: Number(byField.get('totalCases') ?? 0),
          executedCases: Number(byField.get('executedCases') ?? 0),
          passedCases: Number(byField.get('passedCases') ?? 0),
          failedCases: Number(byField.get('failedCases') ?? 0),
          skippedCases: Number(byField.get('skippedCases') ?? 0),
          currentCaseIndex: Number(byField.get('currentCaseIndex') ?? 0),
          currentStepIndex: Number(byField.get('currentStepIndex') ?? 0),
          firstFailCase: Number(byField.get('firstFailCase') ?? 0),
          firstFailStep: Number(byField.get('firstFailStep') ?? 0),
          firstFailFieldIndex: Number(byField.get('firstFailFieldIndex') ?? 0),
          firstFailIsHmi: Boolean(byField.get('firstFailIsHmi')),
          firstFailMask: Number(byField.get('firstFailMask') ?? 0),
          statusCode,
          statusCodeHex: `0x${(statusCode >>> 0).toString(16).toUpperCase().padStart(4, '0')}`,
          totalStepsExecuted: Number(byField.get('totalStepsExecuted') ?? 0),
          failedStepsCount: Number(byField.get('failedStepsCount') ?? 0),
          firstFailActualReal: Number(byField.get('firstFailActualReal') ?? 0),
          firstFailExpectedReal: Number(byField.get('firstFailExpectedReal') ?? 0),
          firstFailActualDInt: Number(byField.get('firstFailActualDInt') ?? 0),
          firstFailExpectedDInt: Number(byField.get('firstFailExpectedDInt') ?? 0),
          firstFailActualWord: Number(byField.get('firstFailActualWord') ?? 0),
          firstFailExpectedWord: Number(byField.get('firstFailExpectedWord') ?? 0),
          firstFailActualBool: Boolean(byField.get('firstFailActualBool')),
          firstFailExpectedBool: Boolean(byField.get('firstFailExpectedBool')),
        },
      };
    }
      channelErrors.plcsimTags = `No DB_TestSummary tags returned: ${JSON.stringify(tagRes)}`;
    } catch (err) {
      channelErrors.plcsimTags = err && err.message ? err.message : String(err);
      if (readMode === 'plcsim-tags') throw err;
    }
  }

  throw new Error(`All configured read channels failed for DB${dbNumber} at ${ip}: ${JSON.stringify(channelErrors)}`);
}

async function setupIsolatedTiaProject(tia, projectDir, projectName, opts) {
  assertSafeTempPath(projectDir);
  fs.mkdirSync(projectDir, { recursive: true });

  await tia.callTool('CreateProject', { directoryPath: projectDir, projectName, closeForeignProject: false, supportSimulation: true }, 90000);
  const addDev = await tia.callTool(
    'AddDeviceWithFallback',
    {
      preferredMlfb: opts.mlfb,
      preferredVersion: opts.catalogVersion,
      deviceName: opts.plcName,
      family: 'S7-1500',
    },
    90000
  );
  if (addDev && (addDev.ok === false || addDev.Ok === false)) {
    throw new Error(`AddDeviceWithFallback failed: ${addDev.error || addDev.Error || addDev.message || addDev.Message}`);
  }

  const versionUsed = String((addDev && (addDev.VersionUsed || addDev.versionUsed)) || opts.catalogVersion || '');
  const isAccessControlFw = /^V(?:3\.[1-9]|[4-9]\.)/i.test(versionUsed);
  const protArgs = isAccessControlFw
    ? { devicePath: opts.plcName, accessControlMode: 'Disabled', masterSecretMode: 'unprotect' }
    : { devicePath: opts.plcName, accessLevel: 'FullAccess', masterSecretMode: 'unprotect' };
  const prot = await tia.callTool('SetPlcProtection', protArgs, 30000);
  if (prot && (prot.ok === false || prot.Ok === false)) {
    throw new Error(`SetPlcProtection failed: ${prot.message || prot.Message || JSON.stringify(prot)}`);
  }

  const putGet = await tia.callTool('SetPutGetAccess', { devicePath: opts.plcName, enable: true }, 30000);
  if (putGet && (putGet.ok === false || putGet.Ok === false)) {
    throw new Error(`SetPutGetAccess failed: ${putGet.message || putGet.Message}`);
  }

  // Discover the actual PROFINET interface path from Openness before setting IP & subnet (locale-safe)
  const ipInfoBefore = await tia.callTool('GetDeviceIpAddress', { devicePath: opts.plcName }, 30000);
  const nodesBefore = (ipInfoBefore && ((ipInfoBefore.data && ipInfoBefore.data.nodes) || (ipInfoBefore.Data && ipInfoBefore.Data.nodes))) || [];
  const primaryIeNode =
    nodesBefore.find((n) => n && n.isIndustrialEthernet && n.interfacePath && !n.interfacePath.includes('#'))
    || nodesBefore.find((n) => n && n.isIndustrialEthernet)
    || nodesBefore[0];
  const rawIfacePath = (primaryIeNode && primaryIeNode.interfacePath) || `${opts.plcName}/${opts.plcName}/PROFINET 接口_1`;
  const ifacePath = rawIfacePath.includes('#')
    ? `${opts.plcName}/PROFINET 接口_1`
    : rawIfacePath;
  const ensureSubnetAnchor = ifacePath.startsWith(`${opts.plcName}/${opts.plcName}/`)
    ? ifacePath
    : ifacePath.startsWith(`${opts.plcName}/`)
      ? `${opts.plcName}/${ifacePath}`
      : `${opts.plcName}/${opts.plcName}/PROFINET 接口_1`;

  if (opts.plcIp) {
    const setIp = await tia.callTool(
      'SetDeviceIpAddress',
      {
        devicePath: opts.plcName,
        ipAddress: opts.plcIp,
        subnetMask: opts.subnetMask || '255.255.255.0',
        interfacePath: ifacePath,
      },
      30000
    );
    if (setIp && (setIp.ok === false || setIp.Ok === false)) {
      throw new Error(`SetDeviceIpAddress failed: ${setIp.message || setIp.Message || JSON.stringify(setIp)}`);
    }
  }

  const ensureSub = await tia.callTool(
    'EnsureSubnet',
    {
      anchorDeviceItemPath: ensureSubnetAnchor,
      subnetType: 'PROFINET',
      subnetName: 'PN/IE_1',
    },
    30000
  );
  const ensureMeta = ensureSub && (ensureSub.meta || ensureSub.Meta);
  if (ensureMeta && ensureMeta.success === false) {
    throw new Error(`EnsureSubnet failed: ${ensureSub.message || ensureSub.Message} (${ensureMeta.error || ''})`);
  }

  const compileHw = await tia.callTool('CompileHardware', { devicePath: opts.plcName }, 120000);
  const hwData = compileHw && (compileHw.data || compileHw.Data);
  const hwErrCount = hwData ? Number(hwData.errorCount || 0) : 0;
  if ((compileHw && (compileHw.ok === false || compileHw.Ok === false)) || hwErrCount > 0) {
    throw new Error(`CompileHardware failed (${hwErrCount}E): ${compileHw.message || compileHw.Message || JSON.stringify(compileHw)}`);
  }

  const ipInfo = await tia.callTool('GetDeviceIpAddress', { devicePath: opts.plcName }, 30000);
  const plcIp = (ipInfo && ((ipInfo.data && ipInfo.data.ipAddress) || (ipInfo.Data && ipInfo.Data.ipAddress) || ipInfo.ipAddress)) || opts.plcIp || '192.168.250.10';
  if (opts.plcIp && plcIp !== opts.plcIp) {
    throw new Error(`GetDeviceIpAddress readback mismatch: expected '${opts.plcIp}', got '${plcIp}'`);
  }

  return {
    mlfbUsed: (addDev && (addDev.MlfbUsed || addDev.mlfbUsed)) || opts.mlfb,
    versionUsed: (addDev && (addDev.VersionUsed || addDev.versionUsed)) || opts.catalogVersion,
    plcIp,
    hardwareDownloaded: false,
  };
}

async function cleanupTiaBlocksForNextRun(tia, softwarePath, target, harnessMeta) {
  try {
    await tia.callTool('GoOffline', { softwarePath }, 15000);
  } catch {}

  const blockNames = [
    `OB_TestRunner_${target.blockName}`,
    `DB_Harness_${target.blockName}`,
    `FB_Harness_${target.blockName}`,
    'DB_TestSummary',
    target.blockName,
  ];
  for (const name of blockNames) {
    try {
      await tia.callTool('DeletePlcBlock', { softwarePath, blockPath: name, dryRun: false }, 20000);
    } catch {}
  }

  const srcListRes = await tia.callTool('GetPlcExternalSources', { softwarePath }, 15000);
  const srcItems = (srcListRes && (srcListRes.Items || srcListRes.items)) || [];
  for (const srcName of srcItems) {
    try {
      await tia.callTool('DeletePlcExternalSource', { softwarePath, externalSourceName: srcName }, 15000);
    } catch {}
  }

  if (target.udtName) {
    try {
      await tia.callTool('DeletePlcType', { softwarePath, typePath: target.udtName, dryRun: false }, 20000);
    } catch {}
  }

  const remaining = await tia.callTool('GetBlocks', { softwarePath, regexName: '' }, 15000);
  const remBlocks = (remaining && (remaining.Blocks || remaining.blocks || remaining.Items || remaining.items)) || [];
  const leftovers = remBlocks
    .map((b) => b.Name || b.name)
    .filter((n) => n && !/^Main(?:_1)?$/i.test(n));
  if (leftovers.length > 0) {
    throw new Error(`Leftover blocks after cleanup: ${leftovers.join(', ')}`);
  }
  void harnessMeta;
}

function stripLeadingSclComments(rawText) {
  const text = String(rawText || '').replace(/^\uFEFF+/, '');
  let idx = 0;
  while (idx < text.length) {
    const slice = text.slice(idx);
    const wsMatch = /^\s+/.exec(slice);
    if (wsMatch) {
      idx += wsMatch[0].length;
      continue;
    }
    const lineMatch = /^\/\/[^\r\n]*/.exec(slice);
    if (lineMatch) {
      idx += lineMatch[0].length;
      continue;
    }
    const blkMatch = /^\(\*[\s\S]*?\*\)/.exec(slice);
    if (blkMatch) {
      idx += blkMatch[0].length;
      continue;
    }
    break;
  }
  const rest = text.slice(idx);
  if (/^(?:DATA_BLOCK|FUNCTION_BLOCK|FUNCTION|ORGANIZATION_BLOCK|TYPE)\b/i.test(rest)) {
    return rest;
  }
  return text;
}

function stageSclForOpenness(filePath, stageDir, importAliasName) {
  const dir = stageDir || path.join(os.tmpdir(), 'tia_e2e_scl_stage');
  fs.mkdirSync(dir, { recursive: true });
  const targetName = importAliasName || path.basename(filePath);
  const stagedPath = path.join(dir, targetName);
  const raw = fs.readFileSync(filePath, 'utf8');
  const cleaned = stripLeadingSclComments(raw);
  fs.writeFileSync(stagedPath, '\uFEFF' + cleaned, 'utf8');
  return stagedPath;
}

async function importExternalScl(tia, softwarePath, filePath, importAliasName, stageDir) {
  const importFile = stageSclForOpenness(filePath, stageDir, importAliasName);
  const srcName = path.basename(importFile);
  await tia.callTool('ImportPlcExternalSource', { softwarePath, groupPath: '', filePath: importFile }, 30000);
  await tia.callTool('GenerateBlocksFromExternalSource', { softwarePath, externalSourceName: srcName }, 60000);
}

async function runSingleBlock({ tia, plcsim, target, harnessDir, harnessMeta, plcIp, projectState, opts }) {
  const softwarePath = opts.plcName;
  const startedAt = Date.now();
  const blockResult = {
    blockId: target.blockId,
    blockName: target.blockName,
    blockType: harnessMeta.blockType,
    dutFormat: target.dutFormat,
    timingMode: harnessMeta.timingMode,
    expectedCases: harnessMeta.executedCases,
    plannedSteps: harnessMeta.plannedSteps,
    ok: false,
    compileErrors: null,
    compileWarnings: null,
    dbTestSummaryNumber: null,
    downloadMode: '',
    downloadRoute: '',
    readChannel: '',
    summary: null,
    diagnostic: '',
    elapsedMs: 0,
  };

  try {
    // 1. Ensure PLCSIM instance is stopped cleanly before import/download
    await plcsim.callTool('plcsim_stop', { name: opts.instanceName, timeout: 20000 }, 30000);

    // 2. Import UDT -> DUT -> Route 1 Harness
    if (target.udtPath) {
      await tia.callTool('ImportType', { softwarePath, groupPath: '', importPath: target.udtPath }, 30000);
    }

    if (target.dutFormat === 'scl') {
      await importExternalScl(
        tia,
        softwarePath,
        target.dutPath,
        `${target.blockId}_${path.basename(target.dutPath)}`,
        opts.sclStageDir
      );
    } else if (target.dutFormat === 'xml') {
      await tia.callTool('ImportBlock', { softwarePath, groupPath: '', importPath: target.dutPath }, 30000);
    } else if (target.dutFormat === 's7dcl') {
      const docDir = path.join(harnessDir, 'dut_doc');
      fs.mkdirSync(docDir, { recursive: true });
      const rawDoc = fs.readFileSync(target.dutPath);
      const bom = Buffer.from([0xef, 0xbb, 0xbf]);
      const withBom = rawDoc[0] === 0xef && rawDoc[1] === 0xbb && rawDoc[2] === 0xbf ? rawDoc : Buffer.concat([bom, rawDoc]);
      fs.writeFileSync(path.join(docDir, `${target.blockName}.s7dcl`), withBom);
      const resTwin = target.dutPath.replace(/\.s7dcl$/i, '.s7res');
      if (fs.existsSync(resTwin)) {
        fs.copyFileSync(resTwin, path.join(docDir, `${target.blockName}.s7res`));
      }
      await tia.callTool(
        'ImportBlocksFromDocuments',
        { softwarePath, groupPath: '', importPath: docDir, regexName: '', importOption: 'Override' },
        45000
      );
    } else {
      throw new Error(`Unsupported DUT format: ${target.dutFormat}`);
    }

    for (const hFile of harnessMeta.files) {
      await importExternalScl(
        tia,
        softwarePath,
        path.join(harnessDir, hFile),
        `${target.blockId}_${hFile}`,
        opts.sclStageDir
      );
    }

    // 3. Compile 0E/0W
    const compileRes = await tia.callTool('CompileAndDiagnosePlc', { softwarePath }, 120000);
    const errs = compileRes.ErrorCount !== undefined ? compileRes.ErrorCount : compileRes.errorCount;
    const warns = compileRes.WarningCount !== undefined ? compileRes.WarningCount : compileRes.warningCount;
    blockResult.compileErrors = Number(errs ?? -1);
    blockResult.compileWarnings = Number(warns ?? -1);
    if (blockResult.compileErrors !== 0 || blockResult.compileWarnings !== 0) {
      throw new Error(
        `Compile failed (${blockResult.compileErrors}E/${blockResult.compileWarnings}W): ${JSON.stringify(compileRes.Errors || compileRes.Warnings || compileRes)}`
      );
    }

    // 4. Resolve dynamic DB_TestSummary block number via GetBlockInfo
    const dbInfo = await tia.callTool('GetBlockInfo', { softwarePath, blockPath: 'DB_TestSummary' }, 30000);
    const dbNumber = extractBlockNumber(dbInfo);
    blockResult.dbTestSummaryNumber = dbNumber;

    // 5. Readiness check + Download to PLCSIM
    const readiness = await tia.callTool('CheckDownloadReadiness', { softwarePath }, 60000);
    if (readiness && readiness.Ready === false) {
      throw new Error(`CheckDownloadReadiness failed: ${JSON.stringify(readiness.Issues || readiness)}`);
    }

    const recreatePlcsimForDownload = async (tag) => {
      if (!opts.storageDir) return;
      try {
        await plcsim.callTool(
          'plcsim_cleanup',
          { name: opts.instanceName, 'delete-storage': 'true', timeout: 20000 },
          30000
        );
      } catch {}
      await sleep(1200);
      const retryStorage = path.join(path.dirname(opts.storageDir), `${path.basename(opts.storageDir)}_${tag}`);
      fs.mkdirSync(retryStorage, { recursive: true });
      opts.storageDir = retryStorage;
      await plcsim.callTool(
        'plcsim_create_instance',
        {
          name: opts.instanceName,
          cpu: opts.cpuType,
          storage: retryStorage,
          'network-mode': opts.networkMode,
          ip: plcIp,
          mask: opts.subnetMask || '255.255.255.0',
          'power-on': 'true',
          timeout: 45000,
        },
        60000
      );
      if (projectState) {
        projectState.hardwareDownloaded = false;
      }
      if (opts.networkMode !== 'Softbus' && plcIp) {
        const readyAfter = await waitForPlcTcpReady(plcIp, 25000);
        if (!readyAfter && !opts.json) {
          process.stderr.write(`  ! Warning: TCP 102 still not ready on ${plcIp} after recreate (${tag}); attempting DownloadToPlc anyway...\n`);
        }
      }
    };

    if (opts.networkMode !== 'Softbus' && plcIp) {
      const tcpOk = await waitForPlcTcpReady(plcIp, 20000);
      if (!tcpOk) {
        if (!opts.json) {
          process.stderr.write(`  ! Warning: TCP 102 not ready on ${plcIp} after 20s; recreating PLCSIM instance before DownloadToPlc...\n`);
        }
        await recreatePlcsimForDownload('pre');
      }
    }

    const makeDlArgs = (mode) => {
      const a = {
        softwarePath,
        consistentBlocksOnly: true,
        keepActualValues: false,
        startAfterDownload: false,
        stopBeforeDownload: true,
        downloadMode: mode,
        allowProtectionDowngrade: true,
        acceptUnencryptedSensitiveData: true,
      };
      if (opts.networkMode !== 'Softbus') {
        a.pgPcInterface = 'Siemens PLCSIM Virtual Ethernet Adapter';
        if (plcIp) {
          a.targetIpAddress = plcIp;
        }
      }
      return a;
    };

    const includeHardwareOnDownload = Boolean(
      projectState && (!projectState.hardwareDownloaded || projectState.preferHardwareWithSoftware)
    );
    let dlArgs = makeDlArgs(includeHardwareOnDownload ? 'hardware_and_software' : 'software');
    blockResult.downloadMode = dlArgs.downloadMode;
    let dlRes;
    const maxDlAttempts = 3;
    for (let dlAttempt = 1; dlAttempt <= maxDlAttempts; dlAttempt++) {
      try {
        dlRes = await tia.callTool('DownloadToPlc', dlArgs, 90000);
        if (dlRes && (dlRes.ok === false || dlRes.Ok === false)) {
          throw new Error(`DownloadToPlc failed: ${(dlRes && (dlRes.message || dlRes.Message)) || JSON.stringify(dlRes)}`);
        }
        break;
      } catch (dlErr) {
        const errMsg = dlErr && dlErr.message ? dlErr.message : String(dlErr);
        if (/TiaMcpServer timeout|TiaMcpServer exited|TiaMcpServer is not running/i.test(errMsg) || dlAttempt >= maxDlAttempts) {
          throw dlErr;
        }
        let instanceAlive = true;
        try {
          const st = await plcsim.callTool('plcsim_status', {}, 15000);
          const list = (st && st.data && st.data.registeredInstances) || [];
          instanceAlive = list.some((inst) => String(inst.name).toLowerCase() === String(opts.instanceName).toLowerCase());
        } catch {}

        const isTransientInfraErr =
          !instanceAlive ||
          /Online connection could not be established|连接到模块|InvalidVersion|DownloadProvider|vanished|timeout/i.test(errMsg);

        if (isTransientInfraErr && opts.storageDir) {
          if (!opts.json) {
            process.stderr.write(`  ! DownloadToPlc attempt ${dlAttempt}/${maxDlAttempts} failed (${errMsg.split('\n')[0]}); recreating PLCSIM instance and retrying...\n`);
          }
          await recreatePlcsimForDownload(`r${dlAttempt}`);
          dlArgs = makeDlArgs('hardware_and_software');
          blockResult.downloadMode = dlArgs.downloadMode;
        } else if (dlArgs.downloadMode === 'software') {
          if (!opts.json) {
            process.stderr.write(`  ! DownloadToPlc(software) failed (${errMsg.split('\n')[0]}); retrying with hardware_and_software...\n`);
          }
          dlArgs = makeDlArgs('hardware_and_software');
          blockResult.downloadMode = dlArgs.downloadMode;
          if (projectState) {
            projectState.preferHardwareWithSoftware = true;
          }
        } else {
          throw dlErr;
        }
      }
    }
    const dlMeta = (dlRes && (dlRes.meta || dlRes.Meta)) || {};
    blockResult.downloadRoute = dlMeta.pgPcRoute || '';
    if (dlArgs.downloadMode === 'hardware_and_software' && projectState) {
      projectState.hardwareDownloaded = true;
    }

    try {
      await tia.callTool('GoOffline', { softwarePath }, 15000);
    } catch {}

    // 6. Switch PLCSIM to RUN
    await plcsim.callTool('plcsim_run', { name: opts.instanceName, timeout: 30000 }, 40000);

    // 7. Poll 62-byte DB_TestSummary until done (with single self-recovery if S7/OB1 stalls after Run)
    const maxWaitMs = opts.timeoutMs || Math.max(30000, Number(harnessMeta.estimatedTimeMs || 5000) * 3 + 20000);
    let pollStartedAt = Date.now();
    let deadline = pollStartedAt + maxWaitMs;
    let lastRead = null;
    let stalledRecovered = false;

    while (Date.now() < deadline) {
      try {
        lastRead = await readTestSummary({
          plcsim,
          tia,
          ip: plcIp,
          dbNumber,
          readMode: opts.readMode,
          watchTable: opts.watchTable,
          softwarePath,
          instanceName: opts.instanceName,
        });
        blockResult.readChannel = lastRead.channel;
        if (lastRead.summary && lastRead.summary.done) {
          break;
        }
      } catch (err) {
        lastRead = { error: err.message };
      }

      const hasStarted = Boolean(
        lastRead &&
        lastRead.summary &&
        (lastRead.summary.done || lastRead.summary.running || lastRead.summary.totalCases > 0)
      );
      if (!hasStarted && !stalledRecovered && Date.now() - pollStartedAt > 10000) {
        stalledRecovered = true;
        let curState = 'unknown';
        try {
          const st = await plcsim.callTool('plcsim_status', {}, 15000);
          const inst = ((st && st.data && st.data.registeredInstances) || []).find(
            (i) => String(i.name).toLowerCase() === String(opts.instanceName).toLowerCase()
          );
          curState = inst ? String(inst.operatingState) : 'missing';
        } catch {}

        if (!opts.json) {
          process.stderr.write(
            `  ! Poll stalled >10s with no DB_TestSummary progress (state=${curState}, last=${JSON.stringify(lastRead)}); recovering PLCSIM & re-running...\n`
          );
        }
        if ((curState === 'Run' || curState === 'missing') && opts.storageDir) {
          await recreatePlcsimForDownload('stall');
          const dlRetry = await tia.callTool('DownloadToPlc', makeDlArgs('hardware_and_software'), 180000);
          if (dlRetry && (dlRetry.ok === false || dlRetry.Ok === false)) {
            throw new Error(`DownloadToPlc recovery failed: ${(dlRetry && (dlRetry.message || dlRetry.Message)) || JSON.stringify(dlRetry)}`);
          }
          blockResult.downloadMode = 'hardware_and_software';
          try {
            await tia.callTool('GoOffline', { softwarePath }, 15000);
          } catch {}
        }
        await plcsim.callTool('plcsim_run', { name: opts.instanceName, timeout: 30000 }, 40000);
        pollStartedAt = Date.now();
        deadline = pollStartedAt + maxWaitMs;
        continue;
      }
      await sleep(150);
    }

    if (!lastRead || !lastRead.summary || !lastRead.summary.done) {
      throw new Error(`Timed out after ${maxWaitMs}ms waiting for DB_TestSummary.done=true (last=${JSON.stringify(lastRead)})`);
    }

    const s = lastRead.summary;
    blockResult.summary = s;

    const fieldEntry = (harnessMeta.fieldMap || []).find((f) => f.index === s.firstFailFieldIndex);
    const countMismatch =
      s.executedCases !== harnessMeta.executedCases ||
      s.failedCases !== 0 ||
      s.failedStepsCount !== 0 ||
      !s.passed ||
      s.hasError;

    if (countMismatch) {
      blockResult.diagnostic =
        `status=${s.statusCodeHex}, passedCases=${s.passedCases}/${s.executedCases} (expected=${harnessMeta.executedCases}), ` +
        `failedCases=${s.failedCases}, failedSteps=${s.failedStepsCount}, ` +
        `firstFail=(case=${s.firstFailCase}, step=${s.firstFailStep}, fieldIdx=${s.firstFailFieldIndex}` +
        `${fieldEntry ? ` [${fieldEntry.isHmi ? 'HMI' : 'OUT'}:${fieldEntry.name}]` : ''}, ` +
        `actReal=${s.firstFailActualReal}, expReal=${s.firstFailExpectedReal}, ` +
        `actDInt=${s.firstFailActualDInt}, expDInt=${s.firstFailExpectedDInt}, ` +
        `actWord=${s.firstFailActualWord}, expWord=${s.firstFailExpectedWord}, ` +
        `actBool=${s.firstFailActualBool}, expBool=${s.firstFailExpectedBool})`;
      throw new Error(`PLC verification assertion failed: ${blockResult.diagnostic}`);
    }

    blockResult.ok = true;
    blockResult.diagnostic = `PASS via ${lastRead.channel} (${s.passedCases}/${s.executedCases} cases, ${s.totalStepsExecuted} steps, status=${s.statusCodeHex}, DB${dbNumber})`;
  } catch (err) {
    if (err && typeof err === 'object') {
      err.blockResult = blockResult;
    }
    throw err;
  } finally {
    blockResult.elapsedMs = Date.now() - startedAt;
  }
  return blockResult;
}

function buildMarkdownReport(report) {
  const lines = [];
  lines.push(`# PLCSIM Advanced V7.0 E2E Verification Report`);
  lines.push('');
  lines.push(`- **Timestamp**: ${report.timestamp}`);
  lines.push(`- **PLCSIM Instance**: \`${report.instanceName}\` (mode=\`${report.networkMode}\`, ip=\`${report.plcIp}\`)`);
  lines.push(`- **CPU**: \`${report.cpuMlfb}\` (${report.cpuVersion})`);
  lines.push(`- **Summary**: **${report.totals.passed}/${report.totals.total} blocks passed** (${report.totals.failed} failed) | ${report.totals.totalCasesPassed}/${report.totals.totalCasesExecuted} test cases passed | Elapsed: ${(report.totals.elapsedMs / 1000).toFixed(1)}s`);
  lines.push('');
  lines.push('| ID | Block | Type | Timing | Compile | DB# | Cases (Pass/Exec/Plan) | Steps | Channel | Status | Time (s) |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of report.results) {
    const comp = r.compileErrors !== null ? `${r.compileErrors}E/${r.compileWarnings}W` : '-';
    const s = r.summary;
    const cases = s ? `${s.passedCases}/${s.executedCases}/${r.expectedCases}` : `-/-/${r.expectedCases}`;
    const steps = s ? `${s.totalStepsExecuted}` : `${r.plannedSteps}`;
    const status = r.ok ? 'PASS' : `FAIL`;
    lines.push(
      `| ${r.blockId} | ${r.blockName} | ${r.blockType || '-'} (${r.dutFormat}) | ${r.timingMode || '-'} | ${comp} | ${r.dbTestSummaryNumber || '-'} | ${cases} | ${steps} | ${r.readChannel || '-'} | ${status} | ${(r.elapsedMs / 1000).toFixed(1)} |`
    );
  }
  const failures = report.results.filter((r) => !r.ok);
  if (failures.length > 0) {
    lines.push('');
    lines.push('## Failures');
    for (const f of failures) {
      lines.push(`- **[${f.blockId}] ${f.blockName}**: ${f.error || f.diagnostic}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(
      'Usage: node run-plcsim-e2e.js [--block A01|FB_CylinderCtrl|all] [--lad path.xml|.s7dcl]... [--lad-dir dir] [--dut path] [--vectors path.json] [--mode manifest|raw] [--time-scale 1] [--network-mode TCPIPSingleAdapter|Softbus] [--plc-ip 192.168.250.10] [--subnet-mask 255.255.255.0] [--cpu-type CPU1513] [--mlfb "6ES7 513-1AM03-0AB0"] [--catalog-version V3.1] [--read-mode auto|sharp7|mcp-s7|plcsim-tags] [--fresh-project-per-block] [--keep-temp] [--report path.md] [--json]'
    );
    return;
  }

  assertNoActiveGatewayLock();
  const targets = loadGoldenTargets(opts);
  const customList = [...opts.customTargets];
  for (const dir of opts.ladDirs) {
    if (!fs.existsSync(dir)) {
      throw new Error(`--lad-dir does not exist: ${dir}`);
    }
    const entries = fs.readdirSync(dir).sort();
    for (const f of entries) {
      if (!/\.(xml|s7dcl)$/i.test(f)) continue;
      const full = path.join(dir, f);
      const base = full.replace(/\.(xml|s7dcl)$/i, '');
      if (fs.existsSync(`${base}.vectors.json`) || /_LAD\.(xml|s7dcl)$/i.test(f)) {
        customList.push({ dutPath: full, isLad: true });
      }
    }
  }
  const seenCustom = new Set();
  for (let i = 0; i < customList.length; i++) {
    const item = customList[i];
    if (seenCustom.has(item.dutPath.toLowerCase())) continue;
    seenCustom.add(item.dutPath.toLowerCase());
    const dutName = path.basename(item.dutPath, path.extname(item.dutPath));
    targets.push({
      kind: 'custom',
      blockId: item.isLad ? `LAD${String(i + 1).padStart(2, '0')}` : `DUT${String(i + 1).padStart(2, '0')}`,
      blockName: dutName,
      udtName: customList.length === 1 && opts.udtPath ? path.basename(opts.udtPath, path.extname(opts.udtPath)) : '',
      udtPath: customList.length === 1 ? opts.udtPath || '' : '',
      dutPath: item.dutPath,
      dutFormat: path.extname(item.dutPath).toLowerCase().replace('.', ''),
      vectorsPath: customList.length === 1 ? opts.vectorsPath || '' : '',
    });
  }

  const runRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tia_plcsim_e2e_'));
  assertSafeTempPath(runRoot);
  const harnessRoot = path.join(runRoot, 'harness');
  const stageRoot = path.join(runRoot, 'scl_stage');
  const storageDir = path.join(runRoot, 'plcsim_storage');
  opts.sclStageDir = stageRoot;
  opts.storageDir = storageDir;
  const projectBaseDir = path.join(runRoot, 'tia_projects');
  fs.mkdirSync(harnessRoot, { recursive: true });
  fs.mkdirSync(stageRoot, { recursive: true });
  fs.mkdirSync(storageDir, { recursive: true });
  fs.mkdirSync(projectBaseDir, { recursive: true });

  // Prepare Route 1 harnesses upfront so lint/planning failures surface before spawning TIA Portal
  const planned = [];
  const goldenTargets = targets.filter((t) => t.kind === 'golden');
  let goldenReport = null;
  if (goldenTargets.length > 0) {
    goldenReport = generateAll({
      blocks: goldenTargets.map((t) => t.blockName),
      sclDir: GOLDEN_SCL_DIR,
      udtDir: GOLDEN_UDT_DIR,
      vectorsDir: VECTORS_DIR,
      manifestPath: MANIFEST_PATH,
      manifestMode: opts.mode,
      timeScale: opts.timeScale,
      marginMs: opts.marginMs,
      scanMs: opts.scanMs,
      caseIsolation: 'auto',
      includePrivateDep: false,
      outDir: harnessRoot,
      singleFile: false,
      checkOnly: false,
      json: false,
    });
    if (goldenReport.totals.lintErrors > 0) {
      throw new Error(`Harness generation failed with ${goldenReport.totals.lintErrors} lint error(s)`);
    }
  }
  for (const t of targets) {
    if (t.kind === 'golden') {
      const hDir = path.join(harnessRoot, t.blockName);
      const summaryMeta = JSON.parse(fs.readFileSync(path.join(hDir, 'harness-summary.json'), 'utf8'));
      const blockRep = goldenReport && goldenReport.blocks.find((b) => b.blockName === t.blockName);
      summaryMeta.files = blockRep
        ? blockRep.writtenFiles.map((w) => path.basename(w.path)).filter((n) => /\.scl$/i.test(n)).sort()
        : [
            '01_DB_TestSummary.scl',
            `02_FB_Harness_${t.blockName}.scl`,
            `03_DB_Harness_${t.blockName}.scl`,
            `04_OB_TestRunner_${t.blockName}.scl`,
          ];
      planned.push({ target: t, harnessDir: hDir, harnessMeta: summaryMeta });
    } else {
      const hDir = path.join(harnessRoot, t.blockName);
      const summaryMeta = generateLadHarness({
        dutPath: t.dutPath,
        vectorsPath: t.vectorsPath,
        outDir: hDir,
        scanMs: opts.scanMs,
        marginMs: opts.marginMs,
        timeScale: opts.timeScale,
      });
      t.blockName = summaryMeta.blockName;
      t.blockId = summaryMeta.blockId;
      planned.push({ target: t, harnessDir: hDir, harnessMeta: summaryMeta });
    }
  }

  const createTiaClient = () =>
    new McpStdioClient({
      name: 'TiaMcpServer',
      command: opts.tiaExe,
      args: ['--tia-major-version', '20', '--profile', 'full', '--logging', '0'],
      env: { TIA_MCP_PROFILE: 'full' },
    });

  let tia = createTiaClient();
  const plcsim = new McpStdioClient({
    name: 'PlcSimAdvBridge',
    command: opts.bridgeExe,
    args: ['--mcp'],
  });

  const results = [];
  const overallStart = Date.now();
  let previousNetworkMode = 'Softbus';
  let activeProjectOpen = false;
  let sharedSetup = null;
  let plcsimCreated = false;
  let projSeq = 1;

  const restartTiaSession = async (reason) => {
    if (!opts.json) {
      process.stderr.write(`  ! Recycling wedged TiaMcpServer session (${String(reason).split('\n')[0]})...\n`);
    }
    activeProjectOpen = false;
    await tia.close(3000);
    tia = createTiaClient();
    await tia.start(30000);
    await tia.callTool('ConnectIsolated', {}, 120000);
    projSeq++;
    const pDir = path.join(projectBaseDir, `proj_${projSeq}`);
    sharedSetup = await setupIsolatedTiaProject(tia, pDir, `PlcSimE2E_${projSeq}`, opts);
    activeProjectOpen = true;
  };

  try {
    await Promise.all([tia.start(30000), plcsim.start(30000)]);

    const simStatus = await plcsim.callTool('plcsim_status', {}, 15000);
    previousNetworkMode = (simStatus && simStatus.data && simStatus.data.networkMode) || 'Softbus';

    // Connect isolated headless TIA instance (never touches existing GUI windows or D:\TIA_Projects)
    await tia.callTool('ConnectIsolated', {}, 120000);

    // Setup initial temp project
    const firstProjDir = path.join(projectBaseDir, `proj_${projSeq}`);
    sharedSetup = await setupIsolatedTiaProject(tia, firstProjDir, `PlcSimE2E_${projSeq}`, opts);
    activeProjectOpen = true;

    const createFreshPlcsimInstance = async (seqIndex) => {
      try {
        await plcsim.callTool(
          'plcsim_cleanup',
          { name: opts.instanceName, 'delete-storage': 'true', timeout: 20000 },
          30000
        );
      } catch {}
      await sleep(800);
      const blkStorage = path.join(storageDir, `blk_${seqIndex}`);
      fs.mkdirSync(blkStorage, { recursive: true });
      opts.storageDir = blkStorage;
      await plcsim.callTool(
        'plcsim_create_instance',
        {
          name: opts.instanceName,
          cpu: opts.cpuType,
          storage: blkStorage,
          'network-mode': opts.networkMode,
          ip: sharedSetup.plcIp,
          mask: opts.subnetMask || '255.255.255.0',
          'power-on': 'true',
          timeout: 45000,
        },
        60000
      );
      plcsimCreated = true;
      if (sharedSetup) {
        sharedSetup.hardwareDownloaded = false;
      }
    };

    // Create & power on temp PLCSIM instance matching PLC_1 IP
    await createFreshPlcsimInstance(0);

    for (let idx = 0; idx < planned.length; idx++) {
      const { target, harnessDir, harnessMeta } = planned[idx];
      if (!opts.json) {
        process.stderr.write(
          `[${idx + 1}/${planned.length}] Running [${target.blockId}] ${target.blockName} (${harnessMeta.timingMode}, ${harnessMeta.executedCases} cases)...\n`
        );
      }

      if (idx > 0 && opts.freshProjectPerBlock) {
        if (activeProjectOpen) {
          await tia.callTool('CloseProject', { closeForeignProject: false }, 30000);
          activeProjectOpen = false;
        }
        projSeq++;
        const pDir = path.join(projectBaseDir, `proj_${projSeq}`);
        sharedSetup = await setupIsolatedTiaProject(tia, pDir, `PlcSimE2E_${projSeq}`, opts);
        activeProjectOpen = true;
      }

      if (idx > 0) {
        await createFreshPlcsimInstance(idx);
      }

      let res;
      const blockAttemptStartedAt = Date.now();
      const execBlockAttempt = async () =>
        runSingleBlock({
          tia,
          plcsim,
          target,
          harnessDir,
          harnessMeta,
          plcIp: sharedSetup.plcIp,
          projectState: sharedSetup,
          opts,
        });
      try {
        try {
          res = await execBlockAttempt();
        } catch (firstErr) {
          const msg = firstErr && firstErr.message ? firstErr.message : String(firstErr);
          if (/TiaMcpServer timeout|TiaMcpServer exited|TiaMcpServer is not running/i.test(msg)) {
            await restartTiaSession(msg);
            await createFreshPlcsimInstance(`${idx}_rec`);
            res = await execBlockAttempt();
          } else {
            throw firstErr;
          }
        }
      } catch (err) {
        const partial = err && err.blockResult ? err.blockResult : null;
        res = {
          blockId: target.blockId,
          blockName: target.blockName,
          blockType: harnessMeta.blockType,
          dutFormat: target.dutFormat,
          timingMode: harnessMeta.timingMode,
          expectedCases: harnessMeta.executedCases,
          plannedSteps: harnessMeta.plannedSteps,
          ok: false,
          compileErrors: partial ? partial.compileErrors : null,
          compileWarnings: partial ? partial.compileWarnings : null,
          dbTestSummaryNumber: partial ? partial.dbTestSummaryNumber : null,
          downloadMode: partial ? partial.downloadMode : '',
          downloadRoute: partial ? partial.downloadRoute : '',
          readChannel: partial ? partial.readChannel : '',
          summary: partial ? partial.summary : null,
          diagnostic: err.message,
          error: err.message,
          elapsedMs: Date.now() - blockAttemptStartedAt,
        };
      }
      results.push(res);

      if (!opts.json) {
        process.stderr.write(
          `  -> ${res.ok ? 'PASS' : 'FAIL'}: ${res.diagnostic} (${(res.elapsedMs / 1000).toFixed(1)}s)\n`
        );
      }

      // Cleanup TIA blocks cleanly before next block (if shared project); PLCSIM instance is recreated per block.
      if (idx + 1 < planned.length && !opts.freshProjectPerBlock) {
        try {
          await cleanupTiaBlocksForNextRun(tia, opts.plcName, target, harnessMeta);
        } catch (cleanupErr) {
          const cMsg = cleanupErr && cleanupErr.message ? cleanupErr.message : String(cleanupErr);
          if (!opts.json) {
            process.stderr.write(`  ! Shared project block cleanup fell back to fresh project: ${cMsg}\n`);
          }
          if (/TiaMcpServer timeout|TiaMcpServer exited|TiaMcpServer is not running/i.test(cMsg)) {
            await restartTiaSession(cMsg);
          } else {
            try { await tia.callTool('CloseProject', { closeForeignProject: false }, 30000); } catch {}
            activeProjectOpen = false;
            projSeq++;
            const pDir = path.join(projectBaseDir, `proj_${projSeq}`);
            sharedSetup = await setupIsolatedTiaProject(tia, pDir, `PlcSimE2E_${projSeq}`, opts);
            activeProjectOpen = true;
          }
        }
      }
    }
  } finally {
    try {
      if (activeProjectOpen) {
        await tia.callTool('CloseProject', { closeForeignProject: false }, 30000);
      }
    } catch {}
    try {
      await tia.callTool('Disconnect', {}, 15000);
    } catch {}
    await tia.close(3000);

    if (plcsimCreated && !opts.keepTemp) {
      try {
        await plcsim.callTool(
          'plcsim_cleanup',
          { name: opts.instanceName, 'delete-storage': 'true', timeout: 20000 },
          30000
        );
      } catch {}
    }
    try {
      await plcsim.callTool('plcsim_set_network_mode', { set: previousNetworkMode }, 15000);
    } catch {}
    await plcsim.close(3000);

    if (!opts.keepTemp) {
      try {
        fs.rmSync(runRoot, { recursive: true, force: true });
      } catch {}
    }
  }

  const passedCount = results.filter((r) => r.ok).length;
  const totalCasesExecuted = results.reduce((acc, r) => acc + (r.summary ? r.summary.executedCases : 0), 0);
  const totalCasesPassed = results.reduce((acc, r) => acc + (r.summary ? r.summary.passedCases : 0), 0);

  const report = {
    ok: results.length > 0 && passedCount === results.length,
    timestamp: new Date().toISOString(),
    instanceName: opts.instanceName,
    networkMode: opts.networkMode,
    plcIp: sharedSetup ? sharedSetup.plcIp : opts.plcIp,
    cpuMlfb: sharedSetup ? sharedSetup.mlfbUsed : opts.mlfb,
    cpuVersion: sharedSetup ? sharedSetup.versionUsed : opts.catalogVersion,
    totals: {
      total: results.length,
      passed: passedCount,
      failed: results.length - passedCount,
      totalCasesExecuted,
      totalCasesPassed,
      elapsedMs: Date.now() - overallStart,
    },
    results,
  };

  if (opts.jsonReportPath) {
    fs.mkdirSync(path.dirname(opts.jsonReportPath), { recursive: true });
    fs.writeFileSync(opts.jsonReportPath, JSON.stringify(report, null, 2), 'utf8');
  }
  if (opts.reportPath) {
    fs.mkdirSync(path.dirname(opts.reportPath), { recursive: true });
    fs.writeFileSync(opts.reportPath, buildMarkdownReport(report), 'utf8');
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    console.log('\n' + buildMarkdownReport(report));
  }

  if (!report.ok) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
