#!/usr/bin/env node
'use strict';

/**
 * Offline unit tests for benchmarks/runner/lad-harness.js and benchmarks/lad_test/*.
 * Strictly offline — never spawns TIA Portal, PLCSIM, or TiaMcpServer.exe.
 */

const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  parseLadInterface,
  parseS7dclSection,
  defaultVectorsForBlock,
  formatSclLiteral,
  emitSummaryDbScl,
  generateLadHarness,
} = require('./lad-harness');
const { lintSclSource } = require('./generate-plc-harness');

const BENCHMARKS_DIR = path.resolve(__dirname, '..');
const LAD_TEST_DIR = path.join(BENCHMARKS_DIR, 'lad_test');
const COOKBOOK_DIR = path.resolve(
  BENCHMARKS_DIR,
  '..',
  'delivery',
  'TIA-MCP-Gateway-D-v1.4.3',
  'upstreams',
  'b',
  'tools',
  'tiaportal-mcp',
  'skill',
  'lad-cookbook'
);

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS: ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL: ${name}\n  ${err && err.stack ? err.stack : err}`);
  }
}

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lad_harness_test_'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function validateSimaticMlLadXml(xmlPath) {
  const buf = fs.readFileSync(xmlPath);
  assert.strictEqual(buf[0], 0xef, `${path.basename(xmlPath)} missing UTF-8 BOM byte 0`);
  assert.strictEqual(buf[1], 0xbb, `${path.basename(xmlPath)} missing UTF-8 BOM byte 1`);
  assert.strictEqual(buf[2], 0xbf, `${path.basename(xmlPath)} missing UTF-8 BOM byte 2`);
  const xml = buf.toString('utf8').slice(1);
  assert.notStrictEqual(xml.charCodeAt(0), 0xfeff, `${path.basename(xmlPath)} must not have duplicate UTF-8 BOM`);
  assert.ok(xml.startsWith('<?xml'), `${path.basename(xmlPath)} must start directly with <?xml after single UTF-8 BOM`);

  assert.ok(/<Engineering\s+version="V20"\s*\/>/.test(xml), `${path.basename(xmlPath)} must declare V20 Engineering`);
  assert.ok(!/<!--[\s\S]*?-->/.test(xml), `${path.basename(xmlPath)} must not contain XML comments`);
  assert.ok(/<MemoryLayout>Optimized<\/MemoryLayout>/.test(xml), `${path.basename(xmlPath)} must use Optimized layout`);
  assert.ok(/<ProgrammingLanguage>LAD<\/ProgrammingLanguage>/.test(xml), `${path.basename(xmlPath)} must declare LAD`);

  // Verify unique hex IDs on block-level elements
  const idMatches = [...xml.matchAll(/\sID="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(idMatches.length > 0, `${path.basename(xmlPath)} has no block IDs`);
  const seenIds = new Set();
  for (const id of idMatches) {
    assert.ok(/^[0-9A-Fa-f]+$/.test(id), `${path.basename(xmlPath)} invalid hex ID "${id}"`);
    assert.ok(!seenIds.has(id.toUpperCase()), `${path.basename(xmlPath)} duplicate hex ID "${id}"`);
    seenIds.add(id.toUpperCase());
  }

  // Validate every FlgNet separately: decimal UIds, no duplicate UIds, every IdentCon/NameCon resolves
  const flgNets = [...xml.matchAll(/<FlgNet\b[^>]*>([\s\S]*?)<\/FlgNet>/g)];
  assert.ok(flgNets.length > 0, `${path.basename(xmlPath)} has no FlgNet networks`);
  for (let nIdx = 0; nIdx < flgNets.length; nIdx += 1) {
    const net = flgNets[nIdx][1];
    const uidMatches = [...net.matchAll(/\bUId="([^"]+)"/g)].map((m) => m[1]);
    for (const uid of uidMatches) {
      assert.ok(/^\d+$/.test(uid), `${path.basename(xmlPath)} network ${nIdx + 1} non-decimal UId="${uid}"`);
    }

    const partsMatch = net.match(/<Parts>([\s\S]*?)<\/Parts>/);
    const wiresMatch = net.match(/<Wires>([\s\S]*?)<\/Wires>/);
    assert.ok(partsMatch && wiresMatch, `${path.basename(xmlPath)} network ${nIdx + 1} missing Parts or Wires`);
    const partsXml = partsMatch[1];
    const wiresXml = wiresMatch[1];

    const accessUIds = new Set([...partsXml.matchAll(/<Access\b[^>]*\bUId="(\d+)"/g)].map((m) => m[1]));
    const partUIds = new Set([...partsXml.matchAll(/<Part\b[^>]*\bUId="(\d+)"/g)].map((m) => m[1]));
    const instanceUIds = new Set([...partsXml.matchAll(/<Instance\b[^>]*\bUId="(\d+)"/g)].map((m) => m[1]));
    const openConUIds = new Set([...wiresXml.matchAll(/<OpenCon\b[^>]*\bUId="(\d+)"/g)].map((m) => m[1]));
    const wireUIds = [...wiresXml.matchAll(/<Wire\b[^>]*\bUId="(\d+)"/g)].map((m) => m[1]);

    const declaredUIds = [...accessUIds, ...partUIds, ...instanceUIds, ...openConUIds, ...wireUIds];
    assert.strictEqual(
      new Set(declaredUIds).size,
      declaredUIds.length,
      `${path.basename(xmlPath)} network ${nIdx + 1} has duplicate UId`
    );

    for (const m of wiresXml.matchAll(/<IdentCon\b[^>]*\bUId="(\d+)"/g)) {
      assert.ok(
        accessUIds.has(m[1]),
        `${path.basename(xmlPath)} network ${nIdx + 1} IdentCon UId="${m[1]}" missing matching <Access>`
      );
    }
    for (const m of wiresXml.matchAll(/<NameCon\b[^>]*\bUId="(\d+)"\s+Name="([^"]+)"/g)) {
      assert.ok(
        partUIds.has(m[1]),
        `${path.basename(xmlPath)} network ${nIdx + 1} NameCon UId="${m[1]}" (${m[2]}) missing matching <Part>`
      );
    }
  }
}

runTest('1. XML parser handles FB_Motor_DirectStart_LAD.xml without InOut bleed or Member truncation', () => {
  const iface = parseLadInterface(path.join(LAD_TEST_DIR, 'FB_Motor_DirectStart_LAD.xml'));
  assert.strictEqual(iface.format, 'xml');
  assert.strictEqual(iface.blockType, 'FB');
  assert.strictEqual(iface.blockName, 'FB_Motor_DirectStart_LAD');
  assert.deepStrictEqual(
    iface.inputs,
    [
      { name: 'startBtn', type: 'Bool' },
      { name: 'stopBtn', type: 'Bool' },
      { name: 'overloadNC', type: 'Bool' },
    ]
  );
  assert.deepStrictEqual(iface.outputs, [{ name: 'motor', type: 'Bool' }]);
  assert.deepStrictEqual(iface.inouts, []);
});

runTest('2. XML parser handles self-closing sections, nested Static/Struct sections, reversed attrs, InOut, and entity decoding', () => {
  withTempDir((dir) => {
    const xmlPath = path.join(dir, 'ComplexXml.xml');
    const xml = [
      '\uFEFF<?xml version="1.0" encoding="utf-8"?>',
      '<Document>',
      '  <Engineering version="V20" />',
      '  <SW.Blocks.FC ID="0">',
      '    <AttributeList>',
      '      <Interface>',
      '        <Sections xmlns="http://www.siemens.com/automation/Openness/SW/Interface/v5">',
      '          <Section Name="Input" />',
      '          <Section Name="Output">',
      '            <Member Datatype="Real" Name="outVal" />',
      '            <Member Name="nestedStruct" Datatype="Struct">',
      '              <Sections>',
      '                <Section Name="None">',
      '                  <Member Name="innerOnly" Datatype="Bool" />',
      '                </Section>',
      '              </Sections>',
      '            </Member>',
      '          </Section>',
      '          <Section Name="InOut">',
      '            <Member Datatype="&quot;UDT_Custom.V1&quot;" Name="ioCfg" />',
      '          </Section>',
      '          <Section Name="Static">',
      '            <Member Name="tonInst" Datatype="TON_TIME" Version="1.0">',
      '              <AttributeList><BooleanAttribute Name="SetPoint" SystemDefined="true">true</BooleanAttribute></AttributeList>',
      '            </Member>',
      '          </Section>',
      '        </Sections>',
      '      </Interface>',
      '      <Name>FC_Complex_Xml</Name>',
      '    </AttributeList>',
      '  </SW.Blocks.FC>',
      '</Document>',
    ].join('\n');
    fs.writeFileSync(xmlPath, xml, 'utf8');

    const iface = parseLadInterface(xmlPath);
    assert.strictEqual(iface.blockType, 'FC');
    assert.strictEqual(iface.blockName, 'FC_Complex_Xml');
    assert.deepStrictEqual(iface.inputs, []);
    assert.deepStrictEqual(iface.outputs, [
      { name: 'outVal', type: 'Real' },
      { name: 'nestedStruct', type: 'Struct' },
    ]);
    assert.deepStrictEqual(iface.inouts, [{ name: 'ioCfg', type: 'UDT_Custom.V1' }]);
  });

  const mainObPath = path.join(LAD_TEST_DIR, 'Main_export.xml', 'Main.xml');
  if (fs.existsSync(mainObPath)) {
    assert.throws(() => parseLadInterface(mainObPath), /<SW\.Blocks\.FB> or <SW\.Blocks\.FC>/);
  }
});

runTest('3. S7DCL parser handles cookbook files plus comments, attributes, quoted/dotted ids, comma decls, and InOut', () => {
  const fcCook = path.join(COOKBOOK_DIR, 'MCPVerify_FC_LAD.s7dcl');
  if (fs.existsSync(fcCook)) {
    const fcIface = parseLadInterface(fcCook);
    assert.strictEqual(fcIface.blockType, 'FC');
    assert.strictEqual(fcIface.blockName, 'MCPVerify_FC_LAD');
    assert.strictEqual(fcIface.inputs.length, 7);
    assert.strictEqual(fcIface.inputs[0].name, 'A');
    assert.strictEqual(fcIface.outputs.length, 6);
  }

  const fbCook = path.join(COOKBOOK_DIR, 'MCPVerify_FB_LAD_v3.s7dcl');
  if (fs.existsSync(fbCook)) {
    const fbIface = parseLadInterface(fbCook);
    assert.strictEqual(fbIface.blockType, 'FB');
    assert.strictEqual(fbIface.blockName, 'MCPVerify_FB_LAD_v3');
    assert.strictEqual(fbIface.inputs.length, 5);
    assert.strictEqual(fbIface.outputs.length, 4);
  }

  withTempDir((dir) => {
    const s7Path = path.join(dir, 'FB_Foo.V2.s7dcl');
    const src = [
      '\uFEFF{',
      '   S7_BlockComment := "FUNCTION fake"; // comment inside attrs',
      '   S7_Optimized := "TRUE";',
      '}',
      '// Leading comment mentioning FUNCTION_BLOCK "WrongName"',
      'FUNCTION_BLOCK "FB_Foo.V2"',
      '   VAR_INPUT',
      '      { ExternalAccessible := \'False\'; S7_MLC := "MLC_1 {nested}" }',
      '      "pin.One", pinTwo : Bool := FALSE; // trailing comment : fake',
      '      (* multi-line',
      '         block comment *)',
      '      multiLinePin :',
      '         DInt := DINT#10;',
      '   END_VAR',
      '   VAR_IN_OUT',
      '      "io.State", ioCount : "UDT_Drive.V2";',
      '   END_VAR',
      '   VAR_OUTPUT',
      '      "doneFlag" : Bool;',
      '   END_VAR',
      'BEGIN',
      'END_FUNCTION_BLOCK',
    ].join('\n');
    fs.writeFileSync(s7Path, src, 'utf8');

    const iface = parseLadInterface(s7Path);
    assert.strictEqual(iface.format, 's7dcl');
    assert.strictEqual(iface.blockType, 'FB');
    assert.strictEqual(iface.blockName, 'FB_Foo.V2');
    assert.deepStrictEqual(iface.inputs, [
      { name: 'pin.One', type: 'Bool' },
      { name: 'pinTwo', type: 'Bool' },
      { name: 'multiLinePin', type: 'DInt' },
    ]);
    assert.deepStrictEqual(iface.inouts, [
      { name: 'io.State', type: 'UDT_Drive.V2' },
      { name: 'ioCount', type: 'UDT_Drive.V2' },
    ]);
    assert.deepStrictEqual(iface.outputs, [{ name: 'doneFlag', type: 'Bool' }]);

    const directSec = parseS7dclSection(src, 'VAR_IN_OUT');
    assert.strictEqual(directSec.length, 2);
  });
});

runTest('4. All 4 lad_test XML blocks are valid V20 SimaticML and generate 0-lint-error BOM+CRLF harnesses', () => {
  const xmlFiles = [
    'FB_Motor_DirectStart_LAD.xml',
    'FB_Motor_SealIn_FaultLatch_LAD.xml',
    'FB_Valve_TonDelay_Pulse_LAD.xml',
    'FB_Conveyor_BatchCounter_LAD.xml',
  ];

  for (const xmlName of xmlFiles) {
    const xmlPath = path.join(LAD_TEST_DIR, xmlName);
    assert.ok(fs.existsSync(xmlPath), `Missing ${xmlPath}`);
    validateSimaticMlLadXml(xmlPath);

    const vecPath = xmlPath.replace(/\.xml$/i, '.vectors.json');
    const useVec = fs.existsSync(vecPath) ? vecPath : '';

    withTempDir((outRoot) => {
      const outDir = path.join(outRoot, path.basename(xmlName, '.xml'));
      const meta = generateLadHarness({ dutPath: xmlPath, vectorsPath: useVec, outDir });

      for (const reqKey of [
        'blockId',
        'blockName',
        'blockType',
        'timingMode',
        'totalCases',
        'executedCases',
        'skippedCases',
        'plannedSteps',
        'estimatedTimeMs',
        'fieldMap',
        'files',
        'dutFormat',
      ]) {
        assert.ok(reqKey in meta, `${xmlName} summaryMeta missing ${reqKey}`);
      }
      assert.strictEqual(meta.files.length, 4);
      assert.strictEqual(meta.dutFormat, 'xml');
      assert.strictEqual(meta.skippedCases, 0);

      for (const fname of meta.files) {
        const fpath = path.join(outDir, fname);
        const buf = fs.readFileSync(fpath);
        assert.strictEqual(buf[0], 0xef, `${fname} missing BOM[0]`);
        assert.strictEqual(buf[1], 0xbb, `${fname} missing BOM[1]`);
        assert.strictEqual(buf[2], 0xbf, `${fname} missing BOM[2]`);

        const text = buf.toString('utf8');
        assert.ok(!/[^\r]\n/.test(text), `${fname} contains bare LF instead of CRLF`);
        const lint = lintSclSource(text, { requireBom: true, label: `${meta.blockName}/${fname}` });
        assert.deepStrictEqual(lint.errors, [], `${fname} lint errors: ${lint.errors.join('; ')}`);
      }

      const obText = fs.readFileSync(path.join(outDir, `04_OB_TestRunner_${meta.blockName}.scl`), 'utf8');
      assert.ok(!/\bTITLE\s*=/.test(obText), `${meta.blockName} OB_TestRunner must not contain TITLE =`);
    });
  }

  // Specific instruction checks for LAD03 and LAD04
  const lad03Xml = fs.readFileSync(path.join(LAD_TEST_DIR, 'FB_Valve_TonDelay_Pulse_LAD.xml'), 'utf8');
  assert.ok(/Datatype="TON_TIME"\s+Version="1\.0"/.test(lad03Xml), 'LAD03 must declare TON_TIME Version 1.0');
  assert.ok(/BooleanAttribute\s+Name="SetPoint"\s+SystemDefined="true">true</.test(lad03Xml), 'LAD03 tonInst needs SetPoint=true');
  assert.ok(/<Member Name="statPrevEdge" Datatype="Bool"/.test(lad03Xml), 'LAD03 needs Static statPrevEdge');
  assert.ok(/<Part Name="PBox"/.test(lad03Xml) && /<Part Name="TON" Version="1\.0"/.test(lad03Xml), 'LAD03 needs PBox and TON');

  const lad04Xml = fs.readFileSync(path.join(LAD_TEST_DIR, 'FB_Conveyor_BatchCounter_LAD.xml'), 'utf8');
  assert.ok(!/Name="CTU"/i.test(lad04Xml), 'LAD04 must NOT use unverified CTU');
  for (const reqPart of ['PBox', 'Add', 'Ge', 'Move']) {
    assert.ok(new RegExp(`<Part Name="${reqPart}"`).test(lad04Xml), `LAD04 missing verified ${reqPart}`);
  }
});

runTest('5. Per-case #instDut_1..N isolation, 1-call-per-scan state machine, TON_WAIT, and scan_cycles codegen', () => {
  withTempDir((outRoot) => {
    const dir01 = path.join(outRoot, 'lad01');
    const meta01 = generateLadHarness({
      dutPath: path.join(LAD_TEST_DIR, 'FB_Motor_DirectStart_LAD.xml'),
      outDir: dir01,
    });
    assert.strictEqual(meta01.timingMode, 'combinational');
    const fb01 = fs.readFileSync(path.join(dir01, '02_FB_Harness_FB_Motor_DirectStart_LAD.scl'), 'utf8');
    for (let i = 1; i <= meta01.totalCases; i += 1) {
      assert.ok(fb01.includes(`instDut_${i} : "FB_Motor_DirectStart_LAD";`), `Missing instDut_${i}`);
      assert.ok(fb01.includes(`#instDut_${i}(`), `Missing call to #instDut_${i}`);
    }
    assert.ok(!/\binstDut\s*:/.test(fb01), 'Must not declare shared #instDut');
    assert.strictEqual((fb01.match(/#instDut_1\(/g) || []).length, 1, 'Each instDut_i must appear at a single call site');
    assert.ok(!fb01.includes('instStepTimer'), 'Combinational harness should not declare unused instStepTimer');

    // Reset & complete status checks
    assert.ok(fb01.includes('"DB_TestSummary".currentCaseIndex := 0;'), 'STATE_IDLE must reset currentCaseIndex');
    assert.ok(fb01.includes('"DB_TestSummary".firstFailActualReal := 0.0;'), 'STATE_IDLE must reset firstFailActualReal');
    assert.ok(fb01.includes('AND (NOT "DB_TestSummary".hasError)'), 'STATE_COMPLETE must gate passed with NOT hasError');
    assert.ok(fb01.includes('IF NOT "DB_TestSummary".hasError THEN'), 'STATE_COMPLETE must preserve error statusCode');

    // LAD03 TON_WAIT & timeScale/marginMs check
    const dir03 = path.join(outRoot, 'lad03');
    const meta03 = generateLadHarness({
      dutPath: path.join(LAD_TEST_DIR, 'FB_Valve_TonDelay_Pulse_LAD.xml'),
      vectorsPath: path.join(LAD_TEST_DIR, 'FB_Valve_TonDelay_Pulse_LAD.vectors.json'),
      outDir: dir03,
      timeScale: 0.2,
      marginMs: 15,
      scanMs: 10,
    });
    assert.strictEqual(meta03.timingMode, 'ton_time');
    const fb03 = fs.readFileSync(path.join(dir03, '02_FB_Harness_FB_Valve_TonDelay_Pulse_LAD.scl'), 'utf8');
    assert.ok(fb03.includes('instStepTimer : TON_TIME;'), 'LAD03 must declare instStepTimer');
    assert.ok(fb03.includes('#STATE_TON_WAIT:'), 'LAD03 must emit STATE_TON_WAIT');
    assert.ok(fb03.includes('#instStepTimer(IN := #tempTimerEn, PT := #tempTimerPt);'), 'LAD03 must drive instStepTimer every scan');
    // 100ms * 0.2 + 15 = 35ms; 550ms * 0.2 + 15 = 125ms; presetDelay T#500ms * 0.2 = T#100ms
    assert.ok(fb03.includes('#statWaitPt := T#35ms;'), 'Expected scaled 100ms -> 35ms wait PT');
    assert.ok(fb03.includes('#statWaitPt := T#125ms;'), 'Expected scaled 550ms -> 125ms wait PT');
    assert.ok(fb03.includes('#in_presetDelay := T#100ms;'), 'Expected scaled presetDelay T#100ms');

    // LAD04 multi-scan cycle check
    const dir04 = path.join(outRoot, 'lad04');
    const meta04 = generateLadHarness({
      dutPath: path.join(LAD_TEST_DIR, 'FB_Conveyor_BatchCounter_LAD.xml'),
      vectorsPath: path.join(LAD_TEST_DIR, 'FB_Conveyor_BatchCounter_LAD.vectors.json'),
      outDir: dir04,
    });
    assert.strictEqual(meta04.timingMode, 'scan_cycles');
    const fb04 = fs.readFileSync(path.join(dir04, '02_FB_Harness_FB_Conveyor_BatchCounter_LAD.scl'), 'utf8');
    assert.ok(fb04.includes('#statTargetScans := DINT#3;'), 'Expected 3 scan cycles step target');
    assert.ok(fb04.includes('INT_TO_DINT(#out_partCount)'), 'Expected explicit INT_TO_DINT conversion');
    assert.ok(!fb04.includes('DINT_TO_DINT'), 'Must never emit DINT_TO_DINT');
  });
});

runTest('6. Type assertions (Real/LReal NaN-safe, Time, 6 Int types, Byte/Word/DWord, firstFailMask) and InOut preservation', () => {
  withTempDir((dir) => {
    const dutPath = path.join(dir, 'FB_AllTypes_Test.xml');
    const vecPath = path.join(dir, 'FB_AllTypes_Test.vectors.json');
    const outDir = path.join(dir, 'out');

    const xml = [
      '\uFEFF<?xml version="1.0" encoding="utf-8"?>',
      '<Document>',
      '  <Engineering version="V20" />',
      '  <SW.Blocks.FB ID="0">',
      '    <AttributeList>',
      '      <Interface>',
      '        <Sections xmlns="http://www.siemens.com/automation/Openness/SW/Interface/v5">',
      '          <Section Name="Input">',
      '            <Member Name="inBool" Datatype="Bool" />',
      '            <Member Name="inSInt" Datatype="SInt" />',
      '            <Member Name="inUSInt" Datatype="USInt" />',
      '            <Member Name="inUInt" Datatype="UInt" />',
      '            <Member Name="inUDInt" Datatype="UDInt" />',
      '          </Section>',
      '          <Section Name="Output">',
      '            <Member Name="outBool" Datatype="Bool" />',
      '            <Member Name="outReal" Datatype="Real" />',
      '            <Member Name="outLReal" Datatype="LReal" />',
      '            <Member Name="outTime" Datatype="Time" />',
      '            <Member Name="outSInt" Datatype="SInt" />',
      '            <Member Name="outInt" Datatype="Int" />',
      '            <Member Name="outUSInt" Datatype="USInt" />',
      '            <Member Name="outUInt" Datatype="UInt" />',
      '            <Member Name="outDInt" Datatype="DInt" />',
      '            <Member Name="outUDInt" Datatype="UDInt" />',
      '            <Member Name="outByte" Datatype="Byte" />',
      '            <Member Name="outWord" Datatype="Word" />',
      '            <Member Name="outDWord" Datatype="DWord" />',
      '          </Section>',
      '          <Section Name="InOut">',
      '            <Member Name="ioCounter" Datatype="Int" />',
      '            <Member Name="ioFlags" Datatype="Word" />',
      '          </Section>',
      '          <Section Name="Static" />',
      '        </Sections>',
      '      </Interface>',
      '      <Name>FB_AllTypes_Test</Name>',
      '      <ProgrammingLanguage>LAD</ProgrammingLanguage>',
      '    </AttributeList>',
      '  </SW.Blocks.FB>',
      '</Document>',
    ].join('\n');
    fs.writeFileSync(dutPath, xml, 'utf8');

    const vectors = {
      blockId: 'LAD_TYPES',
      blockName: 'FB_AllTypes_Test',
      initialState: {
        inouts: { ioCounter: 10, ioFlags: '0x00A5' },
      },
      testCases: [
        {
          caseId: 'TC01_PRESERVE_AND_ASSERT_ALL_TYPES',
          steps: [
            {
              step: 1,
              scanCycleOrDuration: '1 scan cycle',
              inputs: { inBool: true, inSInt: -5, inUSInt: 200, inUInt: 50000, inUDInt: 3000000000 },
              // ioCounter initialized from initialState.inouts (10); ioFlags overridden to 0x00FF
              inouts: { ioFlags: '0x00FF' },
              expectedOutputs: {
                outBool: true,
                outReal: 1.25,
                outLReal: 2.5,
                outTime: 'T#250ms',
                outSInt: -5,
                outInt: -123,
                outUSInt: 200,
                outUInt: 50000,
                outDInt: 100000,
                outUDInt: 3000000000,
                outByte: '0x5A',
                outWord: '16#ABCD',
                outDWord: '0xDEADBEEF',
                ioCounter: 11,
              },
              expectedInOuts: {
                ioFlags: '16#00FF',
              },
            },
            {
              step: 2,
              scanCycleOrDuration: '1 scan cycle',
              inputs: { inBool: false, inSInt: 1, inUSInt: 2, inUInt: 3, inUDInt: 4 },
              // Omit inouts completely on step 2 -> must preserve ioCounter & ioFlags from step 1
              expectedInOuts: {
                ioCounter: 12,
                ioFlags: '16#00FF',
              },
            },
          ],
        },
        {
          caseId: 'TC02_CASE_RESET_INOUT',
          steps: [
            {
              step: 1,
              scanCycleOrDuration: '1 scan cycle',
              inputs: { inBool: false, inSInt: 0, inUSInt: 0, inUInt: 0, inUDInt: 0 },
              // Fresh case re-initializes from initialState.inouts (ioCounter=10, ioFlags=16#00A5)
              expectedOutputs: { ioCounter: 10 },
              expectedInOuts: { ioFlags: '16#00A5' },
            },
          ],
        },
      ],
    };
    fs.writeFileSync(vecPath, JSON.stringify(vectors, null, 2), 'utf8');

    const meta = generateLadHarness({ dutPath, vectorsPath: vecPath, outDir });
    assert.strictEqual(meta.fieldMap.length, 15);

    const fb = fs.readFileSync(path.join(outDir, '02_FB_Harness_FB_AllTypes_Test.scl'), 'utf8');
    const lint = lintSclSource(fb, { requireBom: true, label: 'FB_AllTypes_Test' });
    assert.deepStrictEqual(lint.errors, [], `AllTypes lint errors: ${lint.errors.join('; ')}`);

    // Check InOut declarations, call passing (:=), case initialization, and step-2 preservation
    assert.ok(fb.includes('io_ioCounter : Int := INT#0;'));
    assert.ok(fb.includes('io_ioFlags : Word := 16#0000;'));
    assert.ok(fb.includes('ioCounter := #io_ioCounter, ioFlags := #io_ioFlags'));
    assert.ok(fb.includes('#io_ioCounter := INT#10;'));
    assert.ok(fb.includes('#io_ioFlags := 16#00FF;'));
    assert.ok(fb.includes('#io_ioFlags := 16#00A5;'));

    // Ensure step 2 (planUid 2) does NOT overwrite io_ioCounter / io_ioFlags
    const step2Slice = fb.slice(fb.indexOf('2: // TC01_PRESERVE_AND_ASSERT_ALL_TYPES step 2'), fb.indexOf('3: // TC02_CASE_RESET_INOUT step 1'));
    assert.ok(!step2Slice.includes('#io_ioCounter :='), 'Step 2 must preserve io_ioCounter when omitted');
    assert.ok(!step2Slice.includes('#io_ioFlags :='), 'Step 2 must preserve io_ioFlags when omitted');

    // Check all type assertions & conversions
    assert.ok(fb.includes('NOT (ABS(#out_outReal - 1.25) <= 1.0E-5)'), 'Real NaN-safe check missing');
    assert.ok(fb.includes('NOT (ABS(#out_outLReal - LREAL#2.5) <= LREAL#1.0E-5)'), 'LReal NaN-safe check missing');
    assert.ok(fb.includes('LREAL_TO_REAL(#out_outLReal)'), 'LReal->Real explicit conversion missing');
    assert.ok(fb.includes('#out_outTime <> T#250ms'), 'Time comparison missing');
    assert.ok(fb.includes('TIME_TO_DINT(#out_outTime)'), 'TIME_TO_DINT missing');
    assert.ok(fb.includes('SINT_TO_DINT(#out_outSInt)'), 'SINT_TO_DINT missing');
    assert.ok(fb.includes('INT_TO_DINT(#out_outInt)'), 'INT_TO_DINT missing');
    assert.ok(fb.includes('USINT_TO_DINT(#out_outUSInt)'), 'USINT_TO_DINT missing');
    assert.ok(fb.includes('UINT_TO_DINT(#out_outUInt)'), 'UINT_TO_DINT missing');
    assert.ok(fb.includes('UDINT_TO_DINT(#out_outUDInt)'), 'UDINT_TO_DINT missing');
    assert.ok(fb.includes('BYTE_TO_WORD(#out_outByte)'), 'BYTE_TO_WORD missing');
    assert.ok(fb.includes('#out_outWord <> 16#ABCD'), 'Word normalization missing');
    assert.ok(fb.includes('#out_outDWord <> DWORD#16#DEADBEEF'), 'DWord normalization missing');
    assert.ok(fb.includes('DWORD_TO_DINT(#out_outDWord)'), 'DWORD_TO_DINT missing');
    assert.ok(!/\bDWORD_TO_WORD\b/.test(fb), 'Must not truncate DWord to Word');
    assert.ok(!/\bDINT_TO_DINT\b/.test(fb), 'Must not emit DINT_TO_DINT');
    assert.ok(fb.includes('"DB_TestSummary".firstFailMask := "DB_TestSummary".firstFailMask OR DWORD#16#00000001;'), 'firstFailMask bitmask missing');
  });
});

runTest('7. Vector schema and literal validation rejects unknown pins, missing inputs, conflicts, and bad literals', () => {
  const dutPath = path.join(LAD_TEST_DIR, 'FB_Motor_DirectStart_LAD.xml');
  const baseVec = defaultVectorsForBlock(parseLadInterface(dutPath));

  withTempDir((dir) => {
    const runWithVec = (mutator) => {
      const vec = JSON.parse(JSON.stringify(baseVec));
      mutator(vec);
      const vp = path.join(dir, 'vec.json');
      fs.writeFileSync(vp, JSON.stringify(vec), 'utf8');
      generateLadHarness({ dutPath, vectorsPath: vp, outDir: path.join(dir, 'out'), checkOnly: true });
    };

    assert.throws(() => runWithVec((v) => { v.testCases[0].steps[0].inputs.bogusPin = true; }), /unknown pin 'bogusPin'/i);
    assert.throws(() => runWithVec((v) => { delete v.testCases[0].steps[0].inputs.overloadNC; }), /missing required pin 'overloadNC'/i);
    assert.throws(() => runWithVec((v) => { v.testCases[0].steps[0].inouts = { badIo: 1 }; }), /unknown pin 'badIo'/i);
    assert.throws(() => runWithVec((v) => { v.testCases[0].steps[0].expectedOutputs.badOut = true; }), /unknown pin 'badOut'/i);
    assert.throws(() => runWithVec((v) => { v.testCases[0].steps[0].expectedInOuts = { motor: true }; }), /unknown pin 'motor'/i);
    assert.throws(() => runWithVec((v) => { v.testCases[0].steps[0].inputs.startBtn = 'false'; }), /Invalid Bool literal/i);
    assert.throws(() => runWithVec((v) => { v.testCases[0].steps[0].scanCycleOrDuration = 'bogus'; }), /Invalid scanCycleOrDuration/i);
  });

  // Strict literal checks
  assert.throws(() => formatSclLiteral('Real', NaN), /Invalid Real\/LReal/);
  assert.throws(() => formatSclLiteral('Int', 40000), /Invalid Int/);
  assert.throws(() => formatSclLiteral('SInt', -200), /Invalid SInt/);
  assert.throws(() => formatSclLiteral('USInt', -1), /Invalid USInt/);
  assert.throws(() => formatSclLiteral('UInt', 70000), /Invalid UInt/);
  assert.throws(() => formatSclLiteral('UDInt', -1), /Invalid UDInt/);
  assert.throws(() => formatSclLiteral('Word', '16#ZZZZ'), /Invalid Word/);
  assert.throws(() => formatSclLiteral('Byte', 256), /Invalid Byte/);
  assert.throws(() => formatSclLiteral('DWord', '0x1FFFFFFFF'), /Invalid DWord/);
  assert.throws(() => formatSclLiteral('Time', 'notATime'), /Invalid Time/);

  // Unknown block without vectors throws
  withTempDir((dir) => {
    const unknownXml = path.join(dir, 'FB_Unknown_NoVec.xml');
    fs.writeFileSync(
      unknownXml,
      '<?xml version="1.0" encoding="utf-8"?><Document><SW.Blocks.FB ID="0"><AttributeList><Interface><Sections><Section Name="Input" /></Sections></Interface><Name>FB_Unknown_NoVec</Name></AttributeList></SW.Blocks.FB></Document>',
      'utf8'
    );
    assert.throws(() => generateLadHarness({ dutPath: unknownXml, outDir: path.join(dir, 'out'), checkOnly: true }), /No default vector set/);
  });
});

runTest('8. DB_TestSummary 62-byte layout parity with generate-plc-harness.js', () => {
  const ladDb = emitSummaryDbScl();
  assert.ok(ladDb.includes("{ S7_Optimized_Access := 'FALSE' }"));
  assert.ok(!/[^\r]\n/.test(ladDb), 'emitSummaryDbScl must use CRLF');

  // Compare exact field sequence against generate-plc-harness.js
  const genPlcSrc = fs.readFileSync(path.join(__dirname, 'generate-plc-harness.js'), 'utf8');
  const mGen = genPlcSrc.match(/function generateDbTestSummaryScl\(\)\s*\{\s*return\s*\[([\s\S]*?)\]\.join/);
  assert.ok(mGen, 'Could not locate generateDbTestSummaryScl in generate-plc-harness.js');

  const extractFields = (text) =>
    [...text.matchAll(/^\s*['"]?\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(Bool|Byte|Int|Word|DInt|DWord|Real)\b/gm)].map((m) => ({
      name: m[1],
      type: m[2],
    }));

  const ladFields = extractFields(ladDb);
  const plcFields = extractFields(mGen[1]);
  assert.deepStrictEqual(ladFields, plcFields, 'DB_TestSummary fields diverge from generate-plc-harness.js');
  assert.strictEqual(ladFields.length, 30, 'Expected 30 fields (27 logical + 3 pads) in DB_TestSummary');

  // Compute exact S7 classic DB byte size (with 2-byte word alignment rules)
  const expectedLayout = [
    ['done', 'Bool'], ['passed', 'Bool'], ['running', 'Bool'], ['hasError', 'Bool'],
    ['totalCases', 'Int'], ['executedCases', 'Int'], ['passedCases', 'Int'], ['failedCases', 'Int'], ['skippedCases', 'Int'],
    ['currentCaseIndex', 'Int'], ['currentStepIndex', 'Int'],
    ['firstFailCase', 'Int'], ['firstFailStep', 'Int'], ['firstFailFieldIndex', 'Int'],
    ['firstFailIsHmi', 'Bool'], ['padByte23', 'Byte'],
    ['firstFailMask', 'DWord'], ['statusCode', 'Word'], ['padWord30', 'Word'],
    ['totalStepsExecuted', 'DInt'], ['failedStepsCount', 'DInt'],
    ['firstFailActualReal', 'Real'], ['firstFailExpectedReal', 'Real'],
    ['firstFailActualDInt', 'DInt'], ['firstFailExpectedDInt', 'DInt'],
    ['firstFailActualWord', 'Word'], ['firstFailExpectedWord', 'Word'],
    ['firstFailActualBool', 'Bool'], ['firstFailExpectedBool', 'Bool'], ['padByte61', 'Byte'],
  ];
  assert.deepStrictEqual(
    ladFields.map((f) => [f.name, f.type]),
    expectedLayout
  );

  // Verify exact S7 classic byte offsets total 62 bytes
  const typeSize = { Bool: 1, Byte: 1, Int: 2, Word: 2, DInt: 4, DWord: 4, Real: 4 };
  let byteOffset = 0;
  let bitOffset = 0;
  const fieldOffsets = {};
  for (const { name, type } of ladFields) {
    if (type === 'Bool') {
      fieldOffsets[name] = byteOffset;
      bitOffset += 1;
      if (bitOffset >= 8) {
        byteOffset += 1;
        bitOffset = 0;
      }
    } else {
      if (bitOffset > 0) {
        byteOffset += 1;
        bitOffset = 0;
      }
      if (type !== 'Byte' && byteOffset % 2 !== 0) {
        byteOffset += 1;
      }
      fieldOffsets[name] = byteOffset;
      byteOffset += typeSize[type];
    }
  }
  if (bitOffset > 0) {
    byteOffset += 1;
  }
  if (byteOffset % 2 !== 0) {
    byteOffset += 1;
  }
  assert.strictEqual(fieldOffsets.firstFailMask, 24);
  assert.strictEqual(fieldOffsets.statusCode, 28);
  assert.strictEqual(fieldOffsets.padByte61, 61);
  assert.strictEqual(byteOffset, 62, `Expected 62-byte DB_TestSummary layout, got ${byteOffset}`);
});

runTest('9. S7DCL FC harness generation + CLI --check-only --json pass', () => {
  const fcS7dcl = path.join(COOKBOOK_DIR, 'MCPVerify_FC_LAD.s7dcl');
  withTempDir((dir) => {
    const outDir = path.join(dir, 'fc_harness');
    const fcVecPath = path.join(dir, 'fc.vectors.json');
    fs.writeFileSync(
      fcVecPath,
      JSON.stringify({
        blockId: 'FC_S7DCL_01',
        blockName: 'MCPVerify_FC_LAD',
        blockType: 'FC',
        testCases: [
          {
            id: 1,
            name: 'fc_and_gate',
            steps: [
              {
                inputs: { A: true, B: true, SET: false, RESET: false, V1: 10, V2: 3, VAL: 42 },
                expectedOutputs: { OUT_AND: true, OUT_OR: true, OUT_GT: true, DST: 42, SUM: 13 },
                scanCycleOrDuration: '1 scan cycles',
              },
              {
                inputs: { A: true, B: false, SET: true, RESET: false, V1: 2, V2: 5, VAL: -7 },
                expectedOutputs: { OUT_AND: false, OUT_OR: true, OUT_GT: false, DST: -7, SUM: 7 },
                scanCycleOrDuration: '1 scan cycles',
              },
            ],
          },
        ],
      }),
      'utf8'
    );

    const meta = generateLadHarness({ dutPath: fcS7dcl, vectorsPath: fcVecPath, outDir });
    assert.strictEqual(meta.dutFormat, 's7dcl');
    assert.strictEqual(meta.blockType, 'FC');
    assert.strictEqual(meta.executedCases, 1);

    const fbFile = meta.files.find((f) => f.startsWith('02_FB_'));
    assert.ok(fbFile, `Expected 02_FB_*.scl in meta.files, got ${meta.files.join(', ')}`);
    const fbRaw = fs.readFileSync(path.join(outDir, fbFile));
    assert.strictEqual(fbRaw[0], 0xef);
    assert.strictEqual(fbRaw[1], 0xbb);
    assert.strictEqual(fbRaw[2], 0xbf);
    const fbScl = fbRaw.slice(3).toString('utf8');
    assert.ok(!fbScl.includes('instDut_'), 'FC harness must not declare instDut_* Static FB instances');
    assert.ok(fbScl.includes('"MCPVerify_FC_LAD"('), 'FC harness must call "MCPVerify_FC_LAD"(...) directly');
    assert.ok(fbScl.includes('A := #in_A') && fbScl.includes('OUT_AND => #out_OUT_AND'), 'FC harness must wire A and OUT_AND pins properly');

    for (const file of meta.files) {
      const content = fs.readFileSync(path.join(outDir, file), 'utf8');
      const lint = lintSclSource(content, { requireBom: true, label: file });
      assert.strictEqual(lint.errors.length, 0, `${file} lint errors: ${lint.errors.join('; ')}`);
    }
  });

  // CLI --check-only --json on LAD03 TON+PBox FB
  const lad03Xml = path.join(LAD_TEST_DIR, 'FB_Valve_TonDelay_Pulse_LAD.xml');
  const stdout = execFileSync(
    process.execPath,
    [path.join(__dirname, 'lad-harness.js'), '--dut', lad03Xml, '--check-only', '--json'],
    { encoding: 'utf8' }
  );
  const cliMeta = JSON.parse(stdout);
  assert.strictEqual(cliMeta.blockId, 'LAD03');
  assert.strictEqual(cliMeta.blockName, 'FB_Valve_TonDelay_Pulse_LAD');
  assert.strictEqual(cliMeta.timingMode, 'ton_time');
  assert.strictEqual(cliMeta.dutFormat, 'xml');
  assert.ok(cliMeta.executedCases >= 3);
});

console.log(`\n[test-lad-harness] total=${passed + failed}, passed=${passed}, failed=${failed}`);
process.exit(failed > 0 ? 1 : 0);
