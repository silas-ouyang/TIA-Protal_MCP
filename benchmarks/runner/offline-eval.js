#!/usr/bin/env node
/**
 * P2-2 Phase 1 (路线 3): 15 黄金基准块离线确定性 SCL/状态机评估器
 *
 * 依据 D:\TIA_MCP\benchmarks\golden_library\scl\*.scl 逐行转译的 15 个块确定性语义，
 * 联合 IEC TON_TIME 离散步进仿真、IEEE-754 Real(float32) 运算与 1e-5 浮点容差，
 * 对 test_vectors/*.json 的 135 个 TestCase / 228 个 Step 执行离线评估，
 * 并结合 deviation-manifest.json 显式区分：
 *   - Raw 黑盒实测通过率（严格经由 VAR_INPUT + VAR_IN_OUT 公开接口，零私有态注入）
 *   - Manifest 修正/标注后的判定详情（区分边沿未复位、前驱步依赖、私有 statStep 注入、向量/源码规格偏差）
 *
 * 用法：
 *   node.exe offline-eval.js [--mode raw|manifest] [--block <BlockName>] [--json] [--verbose]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  parseS7TimeToMs,
  parseS7Word,
  parseScanCycleOrDuration,
} = require('./validate-vectors');

const BENCHMARKS_DIR = path.resolve(__dirname, '..');
const VECTORS_DIR = path.join(BENCHMARKS_DIR, 'test_vectors');
const DEFAULT_MANIFEST_PATH = path.join(__dirname, 'deviation-manifest.json');

const f32 = (v) => Math.fround(Number(v));

function clone(obj) {
  return obj == null ? obj : JSON.parse(JSON.stringify(obj));
}

function makeTon() {
  return {
    ptMs: 0,
    etMs: 0,
    q: false,
    running: false,
    call(inBool, ptMs, dtMs) {
      const pt = Math.max(0, Number(ptMs) || 0);
      this.ptMs = pt;
      if (!inBool) {
        this.etMs = 0;
        this.q = false;
        this.running = false;
      } else {
        this.running = true;
        this.etMs = Math.min(pt, this.etMs + Math.max(0, Number(dtMs) || 0));
        this.q = this.etMs >= pt;
      }
      return this.q;
    },
  };
}

function wordStr(n) {
  return `16#${(n & 0xffff).toString(16).toUpperCase().padStart(4, '0')}`;
}

function normVal(v) {
  if (typeof v === 'string' && /^(?:16#|0x)[0-9a-f]+$/i.test(v.trim())) {
    return { kind: 'word', val: parseS7Word(v) };
  }
  if (typeof v === 'string' && /^(?:T|TIME)#/i.test(v.trim())) {
    return { kind: 'time', val: parseS7TimeToMs(v) };
  }
  if (typeof v === 'number') return { kind: 'number', val: v };
  if (typeof v === 'boolean') return { kind: 'bool', val: v };
  return { kind: 'other', val: v };
}

function valuesMatch(actual, expected, tol = 1e-5) {
  const a = normVal(actual);
  const e = normVal(expected);
  if (a.kind === 'word' && e.kind === 'word') return a.val === e.val;
  if (a.kind === 'time' && e.kind === 'time') return a.val === e.val;
  if (a.kind === 'number' && e.kind === 'number') {
    const diff = Math.abs(a.val - e.val);
    return diff <= tol || diff <= tol * Math.max(1, Math.abs(e.val));
  }
  if (a.kind === 'bool' && e.kind === 'bool') return a.val === e.val;
  return actual === expected;
}

function compareSection(actualObj, expectedObj, sectionName, tol) {
  const mismatches = [];
  if (!expectedObj) return mismatches;
  for (const [k, expVal] of Object.entries(expectedObj)) {
    const actVal = actualObj ? actualObj[k] : undefined;
    if (!valuesMatch(actVal, expVal, tol)) {
      mismatches.push({
        field: `${sectionName}.${k}`,
        expected: expVal,
        actual: actVal,
      });
    }
  }
  return mismatches;
}

/**
 * 构建 15 个基准块的精确 SCL 仿真模型工厂。
 */
const BLOCK_MODELS = {
  FC_AnalogScaleAlarm() {
    return {
      stat: {},
      injectPrivate() {},
      step(inputs, ioHmi) {
        const RAW_OVERFLOW = 32511;
        const RAW_UNDERFLOW_UNI = -4864;
        const RAW_UNDERFLOW_BIP = -32512;
        const STATUS_OK = 0x0000;
        const ERR_ZERO_SPAN = 0x8200;
        const ERR_LIMIT_CFG = 0x8201;
        const ERR_WIRE_BREAK = 0x8401;

        let tempScaled = f32(0.0);
        let tempWireFault = false;
        let tempError = false;
        let tempStatus = STATUS_OK;
        let tempHH = false;
        let tempH = false;
        let tempL = false;
        let tempLL = false;

        if (inputs.reset || ioHmi.bResetCmd) ioHmi.bResetCmd = false;

        const rRawMin = f32(ioHmi.rRawMin);
        const rRawMax = f32(ioHmi.rRawMax);
        const rEngMin = f32(ioHmi.rEngMin);
        const rEngMax = f32(ioHmi.rEngMax);
        const tempSpanRaw = f32(rRawMax - rRawMin);

        if (Math.abs(tempSpanRaw) < 1.0e-5 || rEngMin >= rEngMax) {
          tempError = true;
          tempStatus = ERR_ZERO_SPAN;
          tempScaled = f32(0.0);
        } else if (
          !(
            f32(ioHmi.rLimitLL) <= f32(ioHmi.rLimitL) &&
            f32(ioHmi.rLimitL) <= f32(ioHmi.rLimitH) &&
            f32(ioHmi.rLimitH) <= f32(ioHmi.rLimitHH)
          )
        ) {
          tempError = true;
          tempStatus = ERR_LIMIT_CFG;
          tempScaled = f32(0.0);
        } else if (
          inputs.rawInput > RAW_OVERFLOW ||
          (!inputs.bipolar && inputs.rawInput < RAW_UNDERFLOW_UNI) ||
          (inputs.bipolar && inputs.rawInput < RAW_UNDERFLOW_BIP)
        ) {
          tempWireFault = true;
          tempError = true;
          tempStatus = ERR_WIRE_BREAK;
          tempScaled = f32(0.0);
        } else {
          tempWireFault = false;
          if (ioHmi.bManualOverride) {
            tempScaled = f32(ioHmi.rManualValue);
          } else {
            const tempRawReal = f32(inputs.rawInput);
            tempScaled = f32(
              rEngMin + f32(f32(f32(tempRawReal - rRawMin) / tempSpanRaw) * f32(rEngMax - rEngMin))
            );
            if (tempScaled > rEngMax) tempScaled = rEngMax;
            else if (tempScaled < rEngMin) tempScaled = rEngMin;
          }

          if (tempScaled >= f32(ioHmi.rLimitHH)) {
            tempHH = true;
            tempH = true;
          } else if (tempScaled >= f32(ioHmi.rLimitH)) {
            tempH = true;
          }
          if (tempScaled <= f32(ioHmi.rLimitLL)) {
            tempLL = true;
            tempL = true;
          } else if (tempScaled <= f32(ioHmi.rLimitL)) {
            tempL = true;
          }
          tempStatus = STATUS_OK;
          tempError = false;
        }

        ioHmi.rScaledValue = tempScaled;
        ioHmi.bAlarmHH = tempHH;
        ioHmi.bAlarmH = tempH;
        ioHmi.bAlarmL = tempL;
        ioHmi.bAlarmLL = tempLL;
        ioHmi.bWireBreak = tempWireFault;
        ioHmi.wStatus = wordStr(tempStatus);

        return {
          scaledValue: tempScaled,
          alarmHH: tempHH,
          alarmH: tempH,
          alarmL: tempL,
          alarmLL: tempLL,
          error: tempError,
          status: wordStr(tempStatus),
        };
      },
    };
  },

  FB_LowPassFilter() {
    const stat = { statPrevOut: f32(0.0), statInitialized: false };
    return {
      stat,
      injectPrivate(p) {
        if ('statPrevOut' in p) stat.statPrevOut = f32(p.statPrevOut);
        if ('statInitialized' in p) stat.statInitialized = Boolean(p.statInitialized);
      },
      step(inputs, ioHmi) {
        const STATUS_OK = 0x0000;
        const STATUS_NO_CALL = 0x7000;
        const ERR_ALPHA_RANGE = 0x8200;
        const rawValue = f32(inputs.rawValue);

        if (!inputs.enable) {
          stat.statInitialized = false;
          stat.statPrevOut = rawValue;
          ioHmi.rRawInput = rawValue;
          ioHmi.rFilteredOutput = rawValue;
          ioHmi.bInitialized = false;
          ioHmi.bError = false;
          ioHmi.wStatus = wordStr(STATUS_NO_CALL);
          return {
            filteredValue: rawValue,
            valid: false,
            error: false,
            status: wordStr(STATUS_NO_CALL),
          };
        }

        let tempEffAlpha = f32(ioHmi.rAlpha) > 0.0 ? f32(ioHmi.rAlpha) : f32(inputs.alpha);
        let tempError = false;
        let tempStatus = STATUS_OK;
        if (tempEffAlpha <= 0.0 || tempEffAlpha > 1.0) {
          tempError = true;
          tempStatus = ERR_ALPHA_RANGE;
          tempEffAlpha = f32(1.0);
        }

        if (inputs.reset || ioHmi.bResetCmd || !stat.statInitialized) {
          stat.statPrevOut = rawValue;
          stat.statInitialized = true;
        } else if (ioHmi.bBypassFilter) {
          stat.statPrevOut = rawValue;
        } else {
          let tempDiff = f32(rawValue - stat.statPrevOut);
          const maxDelta = f32(ioHmi.rMaxDeltaPerScan);
          if (maxDelta > 0.0) {
            if (tempDiff > maxDelta) tempDiff = maxDelta;
            else if (tempDiff < -maxDelta) tempDiff = -maxDelta;
          }
          stat.statPrevOut = f32(stat.statPrevOut + f32(tempEffAlpha * tempDiff));
        }

        if (ioHmi.bResetCmd) ioHmi.bResetCmd = false;

        ioHmi.rRawInput = rawValue;
        ioHmi.rFilteredOutput = stat.statPrevOut;
        ioHmi.bInitialized = stat.statInitialized;
        ioHmi.bError = tempError;
        ioHmi.wStatus = wordStr(tempStatus);

        return {
          filteredValue: stat.statPrevOut,
          valid: true,
          error: tempError,
          status: wordStr(tempStatus),
        };
      },
    };
  },

  FB_CylinderCtrl() {
    const stat = {
      statTargetExtend: false,
      statError: false,
      statStatus: 0x0000,
      instExtendTimeout: makeTon(),
      instRetractTimeout: makeTon(),
      instSensorBothTon: makeTon(),
    };
    return {
      stat,
      injectPrivate(p) {
        if ('statTargetExtend' in p) stat.statTargetExtend = Boolean(p.statTargetExtend);
        if ('statError' in p) stat.statError = Boolean(p.statError);
        if ('statStatus' in p) stat.statStatus = parseS7Word(p.statStatus) ?? 0;
      },
      step(inputs, ioHmi, dtMs) {
        const STATUS_OK = 0x0000;
        const ERR_EXTEND_TIMEOUT = 0x8401;
        const ERR_RETRACT_TIMEOUT = 0x8402;
        const ERR_SENSOR_CONFLICT = 0x8403;
        const ERR_ESTOP = 0x8404;

        const hmiSv = parseS7TimeToMs(ioHmi.tTimeoutSV) ?? 0;
        const inSv = parseS7TimeToMs(inputs.timeout) ?? 0;
        const tempEffTimeout = hmiSv > 0 ? hmiSv : inSv > 0 ? inSv : 3000;

        const tempReset = Boolean(inputs.reset || ioHmi.bResetCmd);
        if (ioHmi.bResetCmd) ioHmi.bResetCmd = false;
        if (tempReset) {
          stat.statError = false;
          stat.statStatus = STATUS_OK;
        }

        stat.instSensorBothTon.call(Boolean(inputs.sensorExtended && inputs.sensorRetracted), 200, dtMs);
        if (stat.instSensorBothTon.q) {
          stat.statError = true;
          stat.statStatus = ERR_SENSOR_CONFLICT;
        }

        let tempReqExtend = false;
        let tempReqRetract = false;
        if (ioHmi.bManualMode || !inputs.autoMode) {
          tempReqExtend = Boolean(ioHmi.bManualExtendCmd);
          tempReqRetract = Boolean(ioHmi.bManualRetractCmd);
        } else {
          tempReqExtend = Boolean(inputs.autoExtendCmd);
          tempReqRetract = Boolean(inputs.autoRetractCmd);
        }

        if (!stat.statError && inputs.eStopOk) {
          if (tempReqRetract) stat.statTargetExtend = false;
          else if (tempReqExtend && inputs.interlockOk) stat.statTargetExtend = true;
        }

        stat.instExtendTimeout.call(
          Boolean(stat.statTargetExtend && !inputs.sensorExtended && !stat.statError && inputs.eStopOk),
          tempEffTimeout,
          dtMs
        );
        if (stat.instExtendTimeout.q) {
          stat.statError = true;
          stat.statStatus = ERR_EXTEND_TIMEOUT;
        }

        stat.instRetractTimeout.call(
          Boolean(!stat.statTargetExtend && !inputs.sensorRetracted && !stat.statError && inputs.eStopOk),
          tempEffTimeout,
          dtMs
        );
        if (stat.instRetractTimeout.q) {
          stat.statError = true;
          stat.statStatus = ERR_RETRACT_TIMEOUT;
        }

        if (!inputs.eStopOk) {
          stat.statTargetExtend = false;
          stat.statError = true;
          stat.statStatus = ERR_ESTOP;
        }

        let tempCoilExt = false;
        let tempCoilRet = false;
        if (!stat.statError && inputs.eStopOk) {
          if (!inputs.doubleSolenoid) {
            tempCoilExt = stat.statTargetExtend;
            tempCoilRet = false;
          } else {
            tempCoilExt = Boolean(stat.statTargetExtend && !inputs.sensorExtended);
            tempCoilRet = Boolean(!stat.statTargetExtend && !inputs.sensorRetracted);
          }
        }
        if (tempCoilExt && tempCoilRet) {
          tempCoilExt = false;
          tempCoilRet = false;
        }

        const tempInExt = Boolean(inputs.sensorExtended && !stat.instSensorBothTon.q);
        const tempInRet = Boolean(inputs.sensorRetracted && !stat.instSensorBothTon.q);

        ioHmi.bIsExtended = tempInExt;
        ioHmi.bIsRetracted = tempInRet;
        ioHmi.bValveExtendOut = tempCoilExt;
        ioHmi.bValveRetractOut = tempCoilRet;
        ioHmi.bFault = stat.statError;
        ioHmi.wStatus = wordStr(stat.statStatus);

        return {
          coilExtend: tempCoilExt,
          coilRetract: tempCoilRet,
          inExtendedPos: tempInExt,
          inRetractedPos: tempInRet,
          error: stat.statError,
          status: wordStr(stat.statStatus),
        };
      },
    };
  },

  FB_MotorRevCtrl() {
    const stat = {
      statState: 0,
      statTargetDir: 0,
      statError: false,
      statStatus: 0x0000,
      instDeadbandTimer: makeTon(),
      instFbkTimer: makeTon(),
    };
    return {
      stat,
      injectPrivate(p) {
        if ('statState' in p) stat.statState = Number(p.statState);
        if ('statTargetDir' in p) stat.statTargetDir = Number(p.statTargetDir);
        if ('statError' in p) stat.statError = Boolean(p.statError);
        if ('statStatus' in p) stat.statStatus = parseS7Word(p.statStatus) ?? 0;
      },
      step(inputs, ioHmi, dtMs) {
        const STATE_IDLE = 0;
        const STATE_FWD = 10;
        const STATE_REV = 20;
        const STATE_DEADBAND = 30;
        const STATE_FAULT = 99;
        const STATUS_OK = 0x0000;
        const ERR_THERMAL = 0x8401;
        const ERR_FBK_TIMEOUT = 0x8402;
        const ERR_ESTOP = 0x8403;

        const dbMs = parseS7TimeToMs(ioHmi.tReverseDeadband) ?? 0;
        const tempDeadbandTime = dbMs > 0 ? dbMs : 1000;
        const fbMs = parseS7TimeToMs(ioHmi.tFeedbackTimeout) ?? 0;
        const tempFbkTime = fbMs > 0 ? fbMs : 2000;

        if (inputs.reset || ioHmi.bResetCmd) {
          ioHmi.bResetCmd = false;
          if (stat.statState === STATE_FAULT && inputs.eStopOk && inputs.thermalOk) {
            stat.statState = STATE_IDLE;
            stat.statError = false;
            stat.statStatus = STATUS_OK;
          }
        }

        if (!inputs.eStopOk) {
          stat.statState = STATE_FAULT;
          stat.statError = true;
          stat.statStatus = ERR_ESTOP;
        } else if (!inputs.thermalOk) {
          stat.statState = STATE_FAULT;
          stat.statError = true;
          stat.statStatus = ERR_THERMAL;
        }

        let tempReqFwd = false;
        let tempReqRev = false;
        if (ioHmi.bManualMode || !inputs.autoMode) {
          if (ioHmi.bManualStopCmd) {
            ioHmi.bManualStopCmd = false;
          } else {
            tempReqFwd = Boolean(ioHmi.bManualFwdCmd);
            tempReqRev = Boolean(ioHmi.bManualRevCmd);
          }
        } else {
          tempReqFwd = Boolean(inputs.autoFwdCmd);
          tempReqRev = Boolean(inputs.autoRevCmd);
        }
        if (tempReqFwd && tempReqRev) {
          tempReqFwd = false;
          tempReqRev = false;
        }

        let tempOutFwd = false;
        let tempOutRev = false;
        switch (stat.statState) {
          case STATE_IDLE:
            stat.instDeadbandTimer.call(false, tempDeadbandTime, dtMs);
            if (inputs.interlockOk) {
              if (tempReqFwd && !tempReqRev) stat.statState = STATE_FWD;
              else if (tempReqRev && !tempReqFwd) stat.statState = STATE_REV;
            }
            break;
          case STATE_FWD:
            if (!inputs.interlockOk) {
              stat.statTargetDir = 0;
              stat.statState = STATE_DEADBAND;
            } else if (tempReqRev) {
              stat.statTargetDir = 2;
              stat.statState = STATE_DEADBAND;
            } else if (!tempReqFwd) {
              stat.statTargetDir = 0;
              stat.statState = STATE_DEADBAND;
            } else {
              tempOutFwd = true;
            }
            break;
          case STATE_REV:
            if (!inputs.interlockOk) {
              stat.statTargetDir = 0;
              stat.statState = STATE_DEADBAND;
            } else if (tempReqFwd) {
              stat.statTargetDir = 1;
              stat.statState = STATE_DEADBAND;
            } else if (!tempReqRev) {
              stat.statTargetDir = 0;
              stat.statState = STATE_DEADBAND;
            } else {
              tempOutRev = true;
            }
            break;
          case STATE_DEADBAND:
            if (tempReqFwd && !tempReqRev) stat.statTargetDir = 1;
            else if (tempReqRev && !tempReqFwd) stat.statTargetDir = 2;
            stat.instDeadbandTimer.call(true, tempDeadbandTime, dtMs);
            if (stat.instDeadbandTimer.q) {
              stat.instDeadbandTimer.call(false, tempDeadbandTime, dtMs);
              if (!inputs.useFeedback || (!inputs.fbkFwd && !inputs.fbkRev)) {
                if (stat.statTargetDir === 1 && tempReqFwd && inputs.interlockOk) stat.statState = STATE_FWD;
                else if (stat.statTargetDir === 2 && tempReqRev && inputs.interlockOk) stat.statState = STATE_REV;
                else stat.statState = STATE_IDLE;
              }
            }
            break;
          case STATE_FAULT:
            stat.instDeadbandTimer.call(false, tempDeadbandTime, dtMs);
            break;
          default:
            stat.statState = STATE_IDLE;
            stat.instDeadbandTimer.call(false, tempDeadbandTime, dtMs);
            break;
        }

        const tempFbkMismatch = tempOutFwd !== Boolean(inputs.fbkFwd) || tempOutRev !== Boolean(inputs.fbkRev);
        if (inputs.useFeedback && stat.statState !== STATE_FAULT) {
          stat.instFbkTimer.call(tempFbkMismatch, tempFbkTime, dtMs);
          if (stat.instFbkTimer.q) {
            stat.statState = STATE_FAULT;
            stat.statError = true;
            stat.statStatus = ERR_FBK_TIMEOUT;
            tempOutFwd = false;
            tempOutRev = false;
          }
        } else {
          stat.instFbkTimer.call(false, tempFbkTime, dtMs);
        }

        if (!stat.statError) stat.statStatus = STATUS_OK;

        if (!stat.statError && inputs.eStopOk && inputs.thermalOk) {
          if (tempOutFwd && tempOutRev) {
            tempOutFwd = false;
            tempOutRev = false;
          }
        } else {
          tempOutFwd = false;
          tempOutRev = false;
        }

        ioHmi.bRunningFwd = tempOutFwd;
        ioHmi.bRunningRev = tempOutRev;
        ioHmi.bFault = stat.statError;
        ioHmi.wStatus = wordStr(stat.statStatus);

        return {
          contactorFwd: tempOutFwd,
          contactorRev: tempOutRev,
          running: tempOutFwd || tempOutRev,
          error: stat.statError,
          status: wordStr(stat.statStatus),
        };
      },
    };
  },

  FB_RingFifo() {
    const stat = {
      statBuffer: new Array(32).fill(0),
      statHead: 0,
      statTail: 0,
      statCount: 0,
      statLastOut: 0,
      statEnqOld: false,
      statDeqOld: false,
    };
    return {
      stat,
      injectPrivate(p) {
        if ('statHead' in p) stat.statHead = Number(p.statHead);
        if ('statTail' in p) stat.statTail = Number(p.statTail);
        if ('statCount' in p) stat.statCount = Number(p.statCount);
        if ('statLastOut' in p) stat.statLastOut = Number(p.statLastOut);
        if ('statEnqOld' in p) stat.statEnqOld = Boolean(p.statEnqOld);
        if ('statDeqOld' in p) stat.statDeqOld = Boolean(p.statDeqOld);
        if (Array.isArray(p.statBuffer)) {
          for (let i = 0; i < 32 && i < p.statBuffer.length; i++) stat.statBuffer[i] = Number(p.statBuffer[i]);
        }
      },
      step(inputs, ioHmi) {
        const CAPACITY = 32;
        const STATUS_OK = 0x0000;
        const ERR_QUEUE_FULL = 0x8001;
        const ERR_QUEUE_EMPTY = 0x8002;
        let tempError = false;
        let tempStatus = STATUS_OK;

        const tempClearActive = Boolean(inputs.clear || ioHmi.bClearCmd);
        if (tempClearActive) {
          stat.statHead = 0;
          stat.statTail = 0;
          stat.statCount = 0;
          stat.statLastOut = 0;
          ioHmi.bClearCmd = false;
        }

        const tempEnqReq = Boolean(inputs.enqueue || ioHmi.bManualEnqueue);
        const tempEnqRise = !tempClearActive && tempEnqReq && !stat.statEnqOld;
        stat.statEnqOld = tempEnqReq;

        const tempDeqReq = Boolean(inputs.dequeue || ioHmi.bManualDequeue);
        const tempDeqRise = !tempClearActive && tempDeqReq && !stat.statDeqOld;
        stat.statDeqOld = tempDeqReq;

        const tempDataIn = ioHmi.bManualEnqueue ? Number(ioHmi.diManualItemIn) : Number(inputs.itemIn);
        if (ioHmi.bManualEnqueue) ioHmi.bManualEnqueue = false;
        if (ioHmi.bManualDequeue) ioHmi.bManualDequeue = false;

        if (tempEnqRise) {
          if (stat.statCount >= CAPACITY) {
            tempError = true;
            tempStatus = ERR_QUEUE_FULL;
          } else {
            stat.statBuffer[stat.statHead] = tempDataIn;
            stat.statHead = (stat.statHead + 1) % CAPACITY;
            stat.statCount += 1;
            tempError = false;
            tempStatus = STATUS_OK;
          }
        }

        if (tempDeqRise) {
          if (stat.statCount <= 0) {
            tempError = true;
            tempStatus = ERR_QUEUE_EMPTY;
          } else {
            stat.statLastOut = stat.statBuffer[stat.statTail];
            stat.statTail = (stat.statTail + 1) % CAPACITY;
            stat.statCount -= 1;
            tempError = false;
            tempStatus = STATUS_OK;
          }
        }

        ioHmi.diHeadPreview = stat.statCount > 0 ? stat.statBuffer[stat.statTail] : 0;
        ioHmi.diLastItemOut = stat.statLastOut;
        ioHmi.iCount = stat.statCount;
        ioHmi.bIsEmpty = stat.statCount === 0;
        ioHmi.bIsFull = stat.statCount >= CAPACITY;
        ioHmi.bError = tempError;
        ioHmi.wStatus = wordStr(tempStatus);

        return {
          itemOut: stat.statLastOut,
          count: stat.statCount,
          isEmpty: stat.statCount === 0,
          isFull: stat.statCount >= CAPACITY,
          error: tempError,
          status: wordStr(tempStatus),
        };
      },
    };
  },

  FC_ButtonDebounceToggle() {
    return {
      stat: {},
      injectPrivate() {},
      step(inputs, ioHmi) {
        const DEFAULT_DEBOUNCE_MS = 50;
        const STATUS_OK = 0x0000;
        const ERR_ESTOP = 0x8401;

        const tempStepMs = inputs.scanCycleMs <= 0 ? 10 : Number(inputs.scanCycleMs);
        const debMs = parseS7TimeToMs(ioHmi.tDebounceTime) ?? 0;
        const tempTargetMs = debMs > 0 ? debMs : DEFAULT_DEBOUNCE_MS;

        if (Boolean(inputs.rawButton) !== Boolean(ioHmi.bDebouncedState)) {
          ioHmi.tElapsedMs = Number(ioHmi.tElapsedMs) + tempStepMs;
          if (ioHmi.tElapsedMs >= tempTargetMs) {
            ioHmi.bDebouncedState = Boolean(inputs.rawButton);
            ioHmi.tElapsedMs = 0;
          }
        } else {
          ioHmi.tElapsedMs = 0;
        }

        const tempRise = Boolean(ioHmi.bDebouncedState) && !Boolean(ioHmi.bPrevDebounced);
        const tempFall = !Boolean(ioHmi.bDebouncedState) && Boolean(ioHmi.bPrevDebounced);
        ioHmi.bPrevDebounced = Boolean(ioHmi.bDebouncedState);

        if (!inputs.eStopOk || inputs.reset || ioHmi.bHmiForceOff) {
          ioHmi.bToggleOut = false;
          ioHmi.wStatus = wordStr(!inputs.eStopOk ? ERR_ESTOP : STATUS_OK);
        } else if (ioHmi.bHmiForceOn) {
          ioHmi.bToggleOut = true;
          ioHmi.wStatus = wordStr(STATUS_OK);
        } else if (tempRise || ioHmi.bHmiToggleCmd) {
          ioHmi.bToggleOut = !ioHmi.bToggleOut;
          ioHmi.wStatus = wordStr(STATUS_OK);
        } else if (inputs.eStopOk) {
          ioHmi.wStatus = wordStr(STATUS_OK);
        }

        ioHmi.bHmiToggleCmd = false;
        ioHmi.bHmiForceOn = false;
        ioHmi.bHmiForceOff = false;

        return {
          debouncedOut: Boolean(ioHmi.bDebouncedState),
          risingPulse: tempRise,
          fallingPulse: tempFall,
          toggleState: Boolean(ioHmi.bToggleOut),
          status: ioHmi.wStatus,
        };
      },
    };
  },

  FB_ModbusPoller() {
    const stat = {
      statState: 0,
      statStationIdx: 0,
      statRetryCnt: 0,
      statLastFailedStation: 0,
      statError: false,
      statStatus: 0x0000,
      instTimeoutTimer: makeTon(),
      instGapTimer: makeTon(),
    };
    return {
      stat,
      injectPrivate(p) {
        if ('statState' in p) stat.statState = Number(p.statState);
        if ('statStationIdx' in p) stat.statStationIdx = Number(p.statStationIdx);
        if ('statRetryCnt' in p) stat.statRetryCnt = Number(p.statRetryCnt);
        if ('statError' in p) stat.statError = Boolean(p.statError);
        if ('statStatus' in p) stat.statStatus = parseS7Word(p.statStatus) ?? 0;
      },
      step(inputs, ioHmi, dtMs) {
        const STATE_IDLE = 0;
        const STATE_SEND_REQ = 10;
        const STATE_WAIT_RESP = 20;
        const STATE_RETRY = 30;
        const STATE_GAP_WAIT = 40;
        const STATUS_FINISHED = 0x0000;
        const STATUS_NO_CALL = 0x7000;
        const STATUS_BUSY = 0x7002;
        const ERR_STATION_TIMEOUT = 0x8401;

        const tempMaxStations =
          ioHmi.iMaxStationCount >= 1 && ioHmi.iMaxStationCount <= 8 ? ioHmi.iMaxStationCount : 4;
        const tempMaxRetries =
          ioHmi.iMaxRetryCount >= 0 && ioHmi.iMaxRetryCount <= 5 ? ioHmi.iMaxRetryCount : 3;
        const rtMs = parseS7TimeToMs(ioHmi.tReplyTimeout) ?? 0;
        const tempTimeout = rtMs > 0 ? rtMs : 1000;
        const gpMs = parseS7TimeToMs(ioHmi.tInterFrameDelay) ?? 0;
        const tempGapTime = gpMs > 0 ? gpMs : 50;

        if (inputs.reset || ioHmi.bResetStats) {
          stat.statState = STATE_IDLE;
          stat.statStationIdx = 1;
          stat.statRetryCnt = 0;
          ioHmi.diSuccessCount = 0;
          ioHmi.diErrorCount = 0;
          ioHmi.bAnyStationFault = false;
          stat.statLastFailedStation = 0;
          stat.statError = false;
          stat.statStatus = STATUS_NO_CALL;
          ioHmi.bResetStats = false;
        }

        let tempMbReq = false;
        if (!(inputs.enable && ioHmi.bEnablePoll)) {
          stat.statState = STATE_IDLE;
          stat.statStationIdx = 1;
          stat.statRetryCnt = 0;
          stat.instTimeoutTimer.call(false, tempTimeout, dtMs);
          stat.instGapTimer.call(false, tempGapTime, dtMs);
          stat.statStatus = STATUS_NO_CALL;
        } else {
          if (stat.statStationIdx < 1 || stat.statStationIdx > tempMaxStations) stat.statStationIdx = 1;
          switch (stat.statState) {
            case STATE_IDLE:
              stat.statRetryCnt = 0;
              stat.instTimeoutTimer.call(false, tempTimeout, dtMs);
              stat.instGapTimer.call(false, tempGapTime, dtMs);
              stat.statStatus = STATUS_BUSY;
              stat.statState = STATE_SEND_REQ;
              break;
            case STATE_SEND_REQ:
              tempMbReq = true;
              stat.statStatus = STATUS_BUSY;
              stat.instTimeoutTimer.call(false, tempTimeout, dtMs);
              stat.statState = STATE_WAIT_RESP;
              break;
            case STATE_WAIT_RESP:
              stat.statStatus = STATUS_BUSY;
              stat.instTimeoutTimer.call(true, tempTimeout, dtMs);
              if (inputs.reqError || stat.instTimeoutTimer.q) {
                stat.instTimeoutTimer.call(false, tempTimeout, dtMs);
                stat.statState = STATE_RETRY;
              } else if (inputs.reqDone) {
                stat.instTimeoutTimer.call(false, tempTimeout, dtMs);
                ioHmi.diSuccessCount += 1;
                stat.statRetryCnt = 0;
                stat.statState = STATE_GAP_WAIT;
              }
              break;
            case STATE_RETRY:
              stat.statStatus = STATUS_BUSY;
              if (stat.statRetryCnt < tempMaxRetries) {
                stat.statRetryCnt += 1;
                stat.statState = STATE_SEND_REQ;
              } else {
                ioHmi.diErrorCount += 1;
                ioHmi.bAnyStationFault = true;
                stat.statLastFailedStation = stat.statStationIdx;
                stat.statError = true;
                stat.statStatus = ERR_STATION_TIMEOUT;
                stat.statRetryCnt = 0;
                stat.statState = STATE_GAP_WAIT;
              }
              break;
            case STATE_GAP_WAIT:
              stat.instGapTimer.call(true, tempGapTime, dtMs);
              if (stat.instGapTimer.q) {
                stat.instGapTimer.call(false, tempGapTime, dtMs);
                if (stat.statStationIdx >= tempMaxStations) {
                  stat.statStationIdx = 1;
                  if (!stat.statError) stat.statStatus = STATUS_FINISHED;
                } else {
                  stat.statStationIdx += 1;
                }
                stat.statState = STATE_SEND_REQ;
              }
              break;
            default:
              stat.statState = STATE_IDLE;
              stat.instTimeoutTimer.call(false, tempTimeout, dtMs);
              stat.instGapTimer.call(false, tempGapTime, dtMs);
              break;
          }
        }

        ioHmi.iActiveStationIdx = stat.statStationIdx;
        ioHmi.wStatus = wordStr(stat.statStatus);

        return {
          mbReq: tempMbReq,
          currentStation: stat.statStationIdx,
          busy: stat.statState !== STATE_IDLE,
          error: stat.statError,
          status: wordStr(stat.statStatus),
        };
      },
    };
  },

  FB_DualEStopInterlock() {
    const stat = {
      statSafetyLatched: false,
      statDiscrepancyFault: false,
      statWaitBothZero: false,
      statResetOld: false,
      instDiscTimer: makeTon(),
    };
    return {
      stat,
      injectPrivate(p) {
        if ('statSafetyLatched' in p) stat.statSafetyLatched = Boolean(p.statSafetyLatched);
        if ('statDiscrepancyFault' in p) stat.statDiscrepancyFault = Boolean(p.statDiscrepancyFault);
        if ('statWaitBothZero' in p) stat.statWaitBothZero = Boolean(p.statWaitBothZero);
        if ('statResetOld' in p) stat.statResetOld = Boolean(p.statResetOld);
      },
      step(inputs, ioHmi, dtMs) {
        const STATUS_SAFE_ACTIVE = 0x0000;
        const STATUS_WAIT_RESET = 0x7001;
        const ERR_ESTOP_PRESSED = 0x8401;
        const ERR_GATE_OPEN = 0x8402;
        const ERR_DISCREPANCY = 0x8403;

        const dtDisc = parseS7TimeToMs(ioHmi.tDiscrepancyTime) ?? 0;
        const tempDiscTime = dtDisc > 0 ? dtDisc : 200;

        const tempChannelsBothOk = Boolean(inputs.eStopCh1 && inputs.eStopCh2);
        const tempChannelsXor = Boolean(inputs.eStopCh1) !== Boolean(inputs.eStopCh2);

        if (!inputs.eStopCh1 || !inputs.eStopCh2 || !inputs.safetyGateOk) {
          stat.statSafetyLatched = false;
        }

        stat.instDiscTimer.call(tempChannelsXor, tempDiscTime, dtMs);
        if (stat.instDiscTimer.q) {
          stat.statDiscrepancyFault = true;
          stat.statWaitBothZero = true;
          stat.statSafetyLatched = false;
        }

        if (stat.statWaitBothZero && !inputs.eStopCh1 && !inputs.eStopCh2) {
          stat.statWaitBothZero = false;
        }

        const tempResetCmd = Boolean(inputs.resetButton || ioHmi.bHmiResetCmd);
        const tempResetEdge = tempResetCmd && !stat.statResetOld;
        stat.statResetOld = tempResetCmd;
        if (ioHmi.bHmiResetCmd) ioHmi.bHmiResetCmd = false;

        if (tempChannelsBothOk && !stat.statWaitBothZero && tempResetEdge) {
          stat.statDiscrepancyFault = false;
        }
        if (
          tempChannelsBothOk &&
          inputs.safetyGateOk &&
          inputs.feedbackLoopOk &&
          !stat.statDiscrepancyFault &&
          !stat.statWaitBothZero &&
          tempResetEdge
        ) {
          stat.statSafetyLatched = true;
        }

        let tempStatus = STATUS_SAFE_ACTIVE;
        if (stat.statDiscrepancyFault || stat.instDiscTimer.q) tempStatus = ERR_DISCREPANCY;
        else if (!inputs.eStopCh1 || !inputs.eStopCh2) tempStatus = ERR_ESTOP_PRESSED;
        else if (!inputs.safetyGateOk) tempStatus = ERR_GATE_OPEN;
        else if (!stat.statSafetyLatched) tempStatus = STATUS_WAIT_RESET;

        const waitReset = Boolean(
          !stat.statSafetyLatched &&
            !stat.statDiscrepancyFault &&
            tempChannelsBothOk &&
            inputs.safetyGateOk &&
            inputs.feedbackLoopOk
        );

        ioHmi.bSafeToRun = stat.statSafetyLatched;
        ioHmi.bCh1State = Boolean(inputs.eStopCh1);
        ioHmi.bCh2State = Boolean(inputs.eStopCh2);
        ioHmi.bDiscrepancyFault = stat.statDiscrepancyFault;
        ioHmi.bWaitReset = waitReset;
        ioHmi.wStatus = wordStr(tempStatus);

        return {
          safetyEnableOut: stat.statSafetyLatched,
          resetRequired: waitReset,
          discrepancyError: stat.statDiscrepancyFault,
          error: Boolean(
            stat.statDiscrepancyFault ||
              stat.instDiscTimer.q ||
              !inputs.eStopCh1 ||
              !inputs.eStopCh2 ||
              !inputs.safetyGateOk
          ),
          status: wordStr(tempStatus),
        };
      },
    };
  },

  FB_FIO_SortingByHeight() {
    const stat = {
      statStep: 0,
      statRunning: false,
      statStopReq: false,
      statPartType: 0,
      statStartOld: false,
      statResetOld: false,
      instStepTimer: makeTon(),
      instPushTimer: makeTon(),
    };
    return {
      stat,
      injectPrivate(p) {
        if ('statStep' in p) stat.statStep = Number(p.statStep);
        if ('statRunning' in p) stat.statRunning = Boolean(p.statRunning);
        if ('statStopReq' in p) stat.statStopReq = Boolean(p.statStopReq);
        if ('statPartType' in p) stat.statPartType = Number(p.statPartType);
      },
      step(inputs, ioHmi, dtMs) {
        const STEP_IDLE = 0,
          STEP_FEED_DETECT = 10,
          STEP_WAIT_EXIT = 20,
          STEP_PUSH_HIGH = 30,
          STEP_PUSH_LOW = 40,
          STEP_FAULT = 99;
        const STATUS_OK = 0x0000,
          STATUS_IDLE = 0x7000,
          ERR_TIMEOUT = 0x8401,
          ERR_ESTOP = 0x8402;

        const tt = parseS7TimeToMs(ioHmi.tTransferTimeout) ?? 0;
        const tempTimeout = tt > 0 ? tt : 8000;
        const ph = parseS7TimeToMs(ioHmi.tPusherHoldTime) ?? 0;
        const tempHoldTime = ph > 0 ? ph : 800;

        const startIn = Boolean(inputs.startBtn || ioHmi.bStartCmd);
        const tempStartRise = startIn && !stat.statStartOld;
        stat.statStartOld = startIn;
        if (ioHmi.bStartCmd) ioHmi.bStartCmd = false;

        const resetIn = Boolean(inputs.resetBtn || ioHmi.bResetCmd);
        const tempResetRise = resetIn && !stat.statResetOld;
        stat.statResetOld = resetIn;
        if (ioHmi.bResetCmd) ioHmi.bResetCmd = false;

        const tempStopActive = !inputs.stopBtn || Boolean(ioHmi.bStopCmd);
        if (ioHmi.bStopCmd) ioHmi.bStopCmd = false;
        if (tempStopActive) stat.statStopReq = true;

        if (tempResetRise && stat.statStep === STEP_FAULT && inputs.eStopOk) {
          stat.statStep = STEP_IDLE;
          stat.statRunning = false;
          stat.statStopReq = false;
        }
        if (!inputs.eStopOk) {
          stat.statStep = STEP_FAULT;
          stat.statRunning = false;
        }

        let tempConvEntry = false,
          tempConvExit = false,
          tempLoadRoller = false,
          tempPushHigh = false,
          tempPushLow = false;

        if (ioHmi.bManualMode) {
          stat.statRunning = false;
          stat.statStep = STEP_IDLE;
          tempConvEntry = Boolean(ioHmi.bManualEntryConv);
          tempConvExit = Boolean(ioHmi.bManualExitConv);
          tempPushHigh = Boolean(ioHmi.bManualPusherHigh);
          tempPushLow = Boolean(ioHmi.bManualPusherLow);
        } else {
          switch (stat.statStep) {
            case STEP_IDLE:
              stat.statRunning = false;
              stat.instStepTimer.call(false, tempTimeout, dtMs);
              stat.instPushTimer.call(false, tempHoldTime, dtMs);
              if (tempStartRise && inputs.eStopOk) {
                stat.statRunning = true;
                stat.statStopReq = false;
                stat.statStep = STEP_FEED_DETECT;
              }
              break;
            case STEP_FEED_DETECT:
              tempConvEntry = true;
              tempConvExit = true;
              tempLoadRoller = true;
              stat.statRunning = true;
              if (stat.statStopReq && !inputs.palletSensor) {
                stat.statStep = STEP_IDLE;
                stat.statRunning = false;
                stat.statStopReq = false;
              } else if (inputs.palletSensor) {
                if (inputs.highSensor && inputs.lowSensor) {
                  stat.statPartType = 2;
                  stat.statStep = STEP_WAIT_EXIT;
                } else if (inputs.lowSensor) {
                  stat.statPartType = 1;
                  stat.statStep = STEP_WAIT_EXIT;
                }
              }
              break;
            case STEP_WAIT_EXIT:
              tempConvExit = true;
              tempLoadRoller = true;
              stat.statRunning = true;
              stat.instStepTimer.call(true, tempTimeout, dtMs);
              if (stat.instStepTimer.q) {
                stat.instStepTimer.call(false, tempTimeout, dtMs);
                stat.statStep = STEP_FAULT;
              } else if (stat.statPartType === 2 && inputs.atHighExit) {
                stat.instStepTimer.call(false, tempTimeout, dtMs);
                stat.statStep = STEP_PUSH_HIGH;
              } else if (stat.statPartType === 1 && inputs.atLowExit) {
                stat.instStepTimer.call(false, tempTimeout, dtMs);
                stat.statStep = STEP_PUSH_LOW;
              }
              break;
            case STEP_PUSH_HIGH:
              tempPushHigh = true;
              stat.statRunning = true;
              stat.instPushTimer.call(true, tempHoldTime, dtMs);
              if (stat.instPushTimer.q) {
                stat.instPushTimer.call(false, tempHoldTime, dtMs);
                ioHmi.diHighSortedCount += 1;
                if (stat.statStopReq) {
                  stat.statStep = STEP_IDLE;
                  stat.statRunning = false;
                  stat.statStopReq = false;
                } else {
                  stat.statStep = STEP_FEED_DETECT;
                }
              }
              break;
            case STEP_PUSH_LOW:
              tempPushLow = true;
              stat.statRunning = true;
              stat.instPushTimer.call(true, tempHoldTime, dtMs);
              if (stat.instPushTimer.q) {
                stat.instPushTimer.call(false, tempHoldTime, dtMs);
                ioHmi.diLowSortedCount += 1;
                if (stat.statStopReq) {
                  stat.statStep = STEP_IDLE;
                  stat.statRunning = false;
                  stat.statStopReq = false;
                } else {
                  stat.statStep = STEP_FEED_DETECT;
                }
              }
              break;
            case STEP_FAULT:
              stat.statRunning = false;
              stat.instStepTimer.call(false, tempTimeout, dtMs);
              stat.instPushTimer.call(false, tempHoldTime, dtMs);
              break;
            default:
              stat.statStep = STEP_IDLE;
              stat.statRunning = false;
              break;
          }
        }

        if (!inputs.eStopOk) {
          tempConvEntry = tempConvExit = tempLoadRoller = tempPushHigh = tempPushLow = false;
        }

        const wStatus = !inputs.eStopOk
          ? ERR_ESTOP
          : stat.statStep === STEP_FAULT
          ? ERR_TIMEOUT
          : stat.statRunning
          ? STATUS_OK
          : STATUS_IDLE;
        ioHmi.wStatus = wordStr(wStatus);
        ioHmi.iCurrentStep = stat.statStep;
        ioHmi.bRunning = stat.statRunning;
        ioHmi.bFault = stat.statStep === STEP_FAULT || !inputs.eStopOk;

        return {
          conveyorEntry: tempConvEntry && inputs.eStopOk,
          conveyorExit: tempConvExit && inputs.eStopOk,
          loadRoller: tempLoadRoller && inputs.eStopOk,
          pusherHigh: tempPushHigh && inputs.eStopOk,
          pusherLow: tempPushLow && inputs.eStopOk,
          startLight: stat.statRunning && inputs.eStopOk,
          faultLight: stat.statStep === STEP_FAULT || !inputs.eStopOk,
          error: stat.statStep === STEP_FAULT || !inputs.eStopOk,
          status: ioHmi.wStatus,
        };
      },
    };
  },

  FB_FIO_PickAndPlace() {
    const stat = {
      statStep: 0,
      statRunning: false,
      statStopReq: false,
      statStartOld: false,
      statResetOld: false,
      instActionTimer: makeTon(),
      instWatchdog: makeTon(),
    };
    return {
      stat,
      injectPrivate(p) {
        if ('statStep' in p) stat.statStep = Number(p.statStep);
        if ('statRunning' in p) stat.statRunning = Boolean(p.statRunning);
        if ('statStopReq' in p) stat.statStopReq = Boolean(p.statStopReq);
      },
      step(inputs, ioHmi, dtMs) {
        const STEP_IDLE = 0,
          STEP_FEED = 10,
          STEP_Z_DOWN_PICK = 20,
          STEP_GRAB = 30,
          STEP_Z_UP_PICK = 40,
          STEP_X_FWD = 50,
          STEP_Z_DOWN_PLACE = 60,
          STEP_RELEASE = 70,
          STEP_Z_UP_PLACE = 80,
          STEP_X_HOME = 90,
          STEP_FAULT = 99;
        const STATUS_OK = 0x0000,
          STATUS_IDLE = 0x7000,
          ERR_STEP_TIMEOUT = 0x8401,
          ERR_ESTOP = 0x8402;

        const mt = parseS7TimeToMs(ioHmi.tAxisMoveTime) ?? 0;
        const tempMoveTime = mt > 0 ? mt : 600;
        const to = parseS7TimeToMs(ioHmi.tStepTimeout) ?? 0;
        const tempTimeout = to > 0 ? to : 4000;

        const startIn = Boolean(inputs.startBtn || ioHmi.bStartCmd);
        const tempStartRise = startIn && !stat.statStartOld;
        stat.statStartOld = startIn;
        if (ioHmi.bStartCmd) ioHmi.bStartCmd = false;

        const resetIn = Boolean(inputs.resetBtn || ioHmi.bResetCmd);
        const tempResetRise = resetIn && !stat.statResetOld;
        stat.statResetOld = resetIn;
        if (ioHmi.bResetCmd) ioHmi.bResetCmd = false;

        if (!inputs.stopBtn || ioHmi.bStopCmd) stat.statStopReq = true;
        if (ioHmi.bStopCmd) ioHmi.bStopCmd = false;

        if (tempResetRise && stat.statStep === STEP_FAULT && inputs.eStopOk) {
          stat.statStep = STEP_IDLE;
          stat.statRunning = false;
          stat.statStopReq = false;
        }
        if (!inputs.eStopOk) {
          stat.statStep = STEP_FAULT;
          stat.statRunning = false;
        }

        let tempEntryConv = false,
          tempExitConv = false,
          tempMoveX = false,
          tempMoveZ = false,
          tempGrab = false;

        const runTimedStep = (actionIn, nextStep) => {
          stat.instActionTimer.call(Boolean(actionIn), tempMoveTime, dtMs);
          stat.instWatchdog.call(true, tempTimeout, dtMs);
          if (stat.instWatchdog.q) {
            stat.instActionTimer.call(false, tempMoveTime, dtMs);
            stat.instWatchdog.call(false, tempTimeout, dtMs);
            stat.statStep = STEP_FAULT;
          } else if (stat.instActionTimer.q) {
            stat.instActionTimer.call(false, tempMoveTime, dtMs);
            stat.instWatchdog.call(false, tempTimeout, dtMs);
            stat.statStep = nextStep;
          }
        };

        if (ioHmi.bManualMode) {
          stat.statRunning = false;
          stat.statStep = STEP_IDLE;
          tempMoveZ = Boolean(ioHmi.bManualMoveZ);
          tempMoveX = !tempMoveZ && !inputs.movingZ ? Boolean(ioHmi.bManualMoveX) : false;
          tempGrab = Boolean(ioHmi.bManualGrab);
        } else {
          switch (stat.statStep) {
            case STEP_IDLE:
              stat.statRunning = false;
              stat.instActionTimer.call(false, tempMoveTime, dtMs);
              stat.instWatchdog.call(false, tempTimeout, dtMs);
              if (tempStartRise && inputs.eStopOk) {
                stat.statRunning = true;
                stat.statStopReq = false;
                stat.statStep = STEP_FEED;
              }
              break;
            case STEP_FEED:
              tempEntryConv = true;
              tempExitConv = true;
              stat.statRunning = true;
              if (stat.statStopReq && !inputs.itemAtEntry) {
                stat.statStep = STEP_IDLE;
                stat.statRunning = false;
                stat.statStopReq = false;
              } else if (inputs.itemAtEntry) {
                stat.statStep = STEP_Z_DOWN_PICK;
              }
              break;
            case STEP_Z_DOWN_PICK:
              tempExitConv = true;
              tempMoveZ = true;
              stat.statRunning = true;
              runTimedStep(!inputs.movingZ, STEP_GRAB);
              break;
            case STEP_GRAB:
              tempExitConv = true;
              tempMoveZ = true;
              tempGrab = true;
              stat.statRunning = true;
              runTimedStep(inputs.itemDetected, STEP_Z_UP_PICK);
              break;
            case STEP_Z_UP_PICK:
              tempExitConv = true;
              tempGrab = true;
              stat.statRunning = true;
              if (!inputs.itemDetected) stat.statStep = STEP_FAULT;
              else runTimedStep(!inputs.movingZ, STEP_X_FWD);
              break;
            case STEP_X_FWD:
              tempExitConv = true;
              tempMoveX = true;
              tempGrab = true;
              stat.statRunning = true;
              if (!inputs.itemDetected) stat.statStep = STEP_FAULT;
              else runTimedStep(!inputs.movingX, STEP_Z_DOWN_PLACE);
              break;
            case STEP_Z_DOWN_PLACE:
              tempExitConv = true;
              tempMoveX = true;
              tempMoveZ = true;
              tempGrab = true;
              stat.statRunning = true;
              if (!inputs.itemDetected) stat.statStep = STEP_FAULT;
              else runTimedStep(!inputs.movingZ, STEP_RELEASE);
              break;
            case STEP_RELEASE:
              tempExitConv = true;
              tempMoveX = true;
              tempMoveZ = true;
              stat.statRunning = true;
              runTimedStep(!inputs.itemDetected, STEP_Z_UP_PLACE);
              break;
            case STEP_Z_UP_PLACE:
              tempExitConv = true;
              tempMoveX = true;
              stat.statRunning = true;
              runTimedStep(!inputs.movingZ, STEP_X_HOME);
              break;
            case STEP_X_HOME:
              tempExitConv = true;
              stat.statRunning = true;
              stat.instActionTimer.call(!inputs.movingX, tempMoveTime, dtMs);
              stat.instWatchdog.call(true, tempTimeout, dtMs);
              if (stat.instWatchdog.q) {
                stat.instActionTimer.call(false, tempMoveTime, dtMs);
                stat.instWatchdog.call(false, tempTimeout, dtMs);
                stat.statStep = STEP_FAULT;
              } else if (stat.instActionTimer.q) {
                stat.instActionTimer.call(false, tempMoveTime, dtMs);
                stat.instWatchdog.call(false, tempTimeout, dtMs);
                ioHmi.diPickedCount += 1;
                if (stat.statStopReq) {
                  stat.statStep = STEP_IDLE;
                  stat.statRunning = false;
                  stat.statStopReq = false;
                } else {
                  stat.statStep = STEP_FEED;
                }
              }
              break;
            case STEP_FAULT:
              stat.statRunning = false;
              stat.instActionTimer.call(false, tempMoveTime, dtMs);
              stat.instWatchdog.call(false, tempTimeout, dtMs);
              break;
            default:
              stat.statStep = STEP_IDLE;
              stat.statRunning = false;
              break;
          }
        }

        if (!inputs.eStopOk) tempEntryConv = tempExitConv = tempMoveX = tempMoveZ = tempGrab = false;

        const wStatus = !inputs.eStopOk
          ? ERR_ESTOP
          : stat.statStep === STEP_FAULT
          ? ERR_STEP_TIMEOUT
          : stat.statRunning
          ? STATUS_OK
          : STATUS_IDLE;
        ioHmi.wStatus = wordStr(wStatus);
        ioHmi.iCurrentStep = stat.statStep;
        ioHmi.bRunning = stat.statRunning;
        ioHmi.bFault = stat.statStep === STEP_FAULT || !inputs.eStopOk;

        return {
          entryConveyor: tempEntryConv && inputs.eStopOk,
          exitConveyor: tempExitConv && inputs.eStopOk,
          moveX: tempMoveX && inputs.eStopOk,
          moveZ: tempMoveZ && inputs.eStopOk,
          grab: tempGrab && inputs.eStopOk,
          error: stat.statStep === STEP_FAULT || !inputs.eStopOk,
          status: ioHmi.wStatus,
        };
      },
    };
  },

  FB_FIO_BufferConveyor() {
    const stat = {
      statRunning: false,
      statJamError: false,
      statStartOld: false,
      statResetOld: false,
      instJamTimer1: makeTon(),
      instJamTimer2: makeTon(),
      instJamTimer3: makeTon(),
    };
    return {
      stat,
      injectPrivate(p) {
        if ('statRunning' in p) stat.statRunning = Boolean(p.statRunning);
        if ('statJamError' in p) stat.statJamError = Boolean(p.statJamError);
      },
      step(inputs, ioHmi, dtMs) {
        const STATUS_OK = 0x0000,
          STATUS_IDLE = 0x7000,
          ERR_JAM = 0x8401,
          ERR_ESTOP = 0x8402;
        const jt = parseS7TimeToMs(ioHmi.tJamTimeout) ?? 0;
        const tempJamTime = jt > 0 ? jt : 6000;

        const startIn = Boolean(inputs.startBtn || ioHmi.bStartCmd);
        const tempStartRise = startIn && !stat.statStartOld;
        stat.statStartOld = startIn;
        if (ioHmi.bStartCmd) ioHmi.bStartCmd = false;

        const resetIn = Boolean(inputs.resetBtn || ioHmi.bResetCmd);
        const tempResetRise = resetIn && !stat.statResetOld;
        stat.statResetOld = resetIn;
        if (ioHmi.bResetCmd) ioHmi.bResetCmd = false;

        if (tempStartRise && inputs.eStopOk && !stat.statJamError) stat.statRunning = true;
        if (!inputs.stopBtn || ioHmi.bStopCmd) stat.statRunning = false;
        if (ioHmi.bStopCmd) ioHmi.bStopCmd = false;
        if (tempResetRise && inputs.eStopOk) stat.statJamError = false;
        if (!inputs.eStopOk) stat.statRunning = false;

        let tempOccupied = 0;
        if (inputs.sensorZ1) tempOccupied += 1;
        if (inputs.sensorZ2) tempOccupied += 1;
        if (inputs.sensorZ3) tempOccupied += 1;

        let tempConv1 = false,
          tempConv2 = false,
          tempConv3 = false,
          tempZ1Hold = false,
          tempZ2Hold = false,
          tempZ3Hold = false;
        if (ioHmi.bManualMode) {
          tempConv1 = Boolean(ioHmi.bManualConv1);
          tempConv2 = Boolean(ioHmi.bManualConv2);
          tempConv3 = Boolean(ioHmi.bManualConv3);
        } else if (stat.statRunning && !stat.statJamError && inputs.eStopOk) {
          tempZ3Hold = Boolean(inputs.sensorZ3 && !inputs.downstreamReady);
          tempZ2Hold = Boolean(inputs.sensorZ2 && tempZ3Hold);
          tempZ1Hold = Boolean(inputs.sensorZ1 && tempZ2Hold);
          tempConv3 = !tempZ3Hold;
          tempConv2 = !tempZ2Hold;
          tempConv1 = !tempZ1Hold;
        }

        stat.instJamTimer1.call(Boolean(tempConv1 && inputs.sensorZ1 && inputs.eStopOk), tempJamTime, dtMs);
        stat.instJamTimer2.call(Boolean(tempConv2 && inputs.sensorZ2 && inputs.eStopOk), tempJamTime, dtMs);
        stat.instJamTimer3.call(Boolean(tempConv3 && inputs.sensorZ3 && inputs.eStopOk), tempJamTime, dtMs);
        if (stat.instJamTimer1.q || stat.instJamTimer2.q || stat.instJamTimer3.q) {
          stat.statJamError = true;
          stat.statRunning = false;
        }

        if (!inputs.eStopOk) {
          tempConv1 = tempConv2 = tempConv3 = tempZ1Hold = tempZ2Hold = false;
        }

        const wStatus = !inputs.eStopOk
          ? ERR_ESTOP
          : stat.statJamError
          ? ERR_JAM
          : stat.statRunning
          ? STATUS_OK
          : STATUS_IDLE;
        ioHmi.wStatus = wordStr(wStatus);
        ioHmi.iOccupiedZones = tempOccupied;
        ioHmi.bBufferFull = tempOccupied >= 3;
        ioHmi.bJamFault = stat.statJamError;

        return {
          conv1: tempConv1 && inputs.eStopOk,
          conv2: tempConv2 && inputs.eStopOk,
          conv3: tempConv3 && inputs.eStopOk,
          stopBlade1: tempZ1Hold && inputs.eStopOk,
          stopBlade2: tempZ2Hold && inputs.eStopOk,
          upstreamReady: Boolean(stat.statRunning && !tempZ1Hold && !stat.statJamError && inputs.eStopOk),
          bufferFull: tempOccupied >= 3,
          error: stat.statJamError || !inputs.eStopOk,
          status: ioHmi.wStatus,
        };
      },
    };
  },

  FB_FIO_Turntable() {
    const stat = {
      statStep: 0,
      statRunning: false,
      statStopReq: false,
      statStartOld: false,
      statResetOld: false,
      instStepWatchdog: makeTon(),
    };
    return {
      stat,
      injectPrivate(p) {
        if ('statStep' in p) stat.statStep = Number(p.statStep);
        if ('statRunning' in p) stat.statRunning = Boolean(p.statRunning);
        if ('statStopReq' in p) stat.statStopReq = Boolean(p.statStopReq);
      },
      step(inputs, ioHmi, dtMs) {
        const STEP_IDLE = 0,
          STEP_HOME_0 = 10,
          STEP_WAIT_ENTRY = 20,
          STEP_LOAD_ROLL = 30,
          STEP_ROTATE_90 = 40,
          STEP_UNLOAD_0 = 50,
          STEP_UNLOAD_90 = 60,
          STEP_RETURN_0 = 70,
          STEP_FAULT = 99;
        const STATUS_OK = 0x0000,
          STATUS_IDLE = 0x7000,
          ERR_TIMEOUT = 0x8401,
          ERR_ESTOP = 0x8402;

        const to = parseS7TimeToMs(ioHmi.tActionTimeout) ?? 0;
        const tempTimeout = to > 0 ? to : 5000;
        const tempRoute90 = Boolean(inputs.routeSelect90 || ioHmi.bRouteTo90Deg);

        const startIn = Boolean(inputs.startBtn || ioHmi.bStartCmd);
        const tempStartRise = startIn && !stat.statStartOld;
        stat.statStartOld = startIn;
        if (ioHmi.bStartCmd) ioHmi.bStartCmd = false;

        const resetIn = Boolean(inputs.resetBtn || ioHmi.bResetCmd);
        const tempResetRise = resetIn && !stat.statResetOld;
        stat.statResetOld = resetIn;
        if (ioHmi.bResetCmd) ioHmi.bResetCmd = false;

        if (!inputs.stopBtn || ioHmi.bStopCmd) stat.statStopReq = true;
        if (ioHmi.bStopCmd) ioHmi.bStopCmd = false;

        if (tempResetRise && stat.statStep === STEP_FAULT && inputs.eStopOk) {
          stat.statStep = STEP_IDLE;
          stat.statRunning = false;
          stat.statStopReq = false;
        }
        if (!inputs.eStopOk || (inputs.limit0 && inputs.limit90)) {
          stat.statStep = STEP_FAULT;
          stat.statRunning = false;
        }

        let tempEntryConv = false,
          tempExit0 = false,
          tempExit90 = false,
          tempTurn = false,
          tempRollP = false,
          tempRollM = false;

        if (ioHmi.bManualMode) {
          stat.statRunning = false;
          stat.statStep = STEP_IDLE;
          tempTurn = Boolean(ioHmi.bManualTurn);
          tempRollP = inputs.limit0 || inputs.limit90 ? Boolean(ioHmi.bManualRollPlus) : false;
        } else {
          switch (stat.statStep) {
            case STEP_IDLE:
              stat.statRunning = false;
              stat.instStepWatchdog.call(false, tempTimeout, dtMs);
              if (tempStartRise && inputs.eStopOk) {
                stat.statRunning = true;
                stat.statStopReq = false;
                stat.statStep = STEP_HOME_0;
              }
              break;
            case STEP_HOME_0:
              stat.statRunning = true;
              stat.instStepWatchdog.call(!inputs.limit0, tempTimeout, dtMs);
              if (stat.instStepWatchdog.q) {
                stat.instStepWatchdog.call(false, tempTimeout, dtMs);
                stat.statStep = STEP_FAULT;
              } else if (inputs.limit0) {
                stat.instStepWatchdog.call(false, tempTimeout, dtMs);
                stat.statStep = STEP_WAIT_ENTRY;
              }
              break;
            case STEP_WAIT_ENTRY:
              tempEntryConv = !stat.statStopReq;
              stat.statRunning = true;
              if (stat.statStopReq && !inputs.atEntry) {
                tempEntryConv = false;
                stat.statStep = STEP_IDLE;
                stat.statRunning = false;
                stat.statStopReq = false;
              } else if (inputs.atEntry) {
                stat.statStep = STEP_LOAD_ROLL;
              }
              break;
            case STEP_LOAD_ROLL:
              tempEntryConv = true;
              tempRollP = true;
              stat.statRunning = true;
              stat.instStepWatchdog.call(true, tempTimeout, dtMs);
              if (stat.instStepWatchdog.q) {
                stat.instStepWatchdog.call(false, tempTimeout, dtMs);
                stat.statStep = STEP_FAULT;
              } else if (inputs.frontLimit) {
                stat.instStepWatchdog.call(false, tempTimeout, dtMs);
                stat.statStep = tempRoute90 ? STEP_ROTATE_90 : STEP_UNLOAD_0;
              }
              break;
            case STEP_ROTATE_90:
              tempTurn = true;
              stat.statRunning = true;
              stat.instStepWatchdog.call(!inputs.limit90, tempTimeout, dtMs);
              if (stat.instStepWatchdog.q) {
                stat.instStepWatchdog.call(false, tempTimeout, dtMs);
                stat.statStep = STEP_FAULT;
              } else if (inputs.limit90) {
                stat.instStepWatchdog.call(false, tempTimeout, dtMs);
                stat.statStep = STEP_UNLOAD_90;
              }
              break;
            case STEP_UNLOAD_0:
              tempExit0 = true;
              tempRollP = true;
              stat.statRunning = true;
              stat.instStepWatchdog.call(true, tempTimeout, dtMs);
              if (stat.instStepWatchdog.q) {
                stat.instStepWatchdog.call(false, tempTimeout, dtMs);
                stat.statStep = STEP_FAULT;
              } else if (inputs.atExit0 && !inputs.frontLimit && !inputs.backLimit) {
                stat.instStepWatchdog.call(false, tempTimeout, dtMs);
                ioHmi.diRoutedCount += 1;
                if (stat.statStopReq) {
                  stat.statStep = STEP_IDLE;
                  stat.statRunning = false;
                  stat.statStopReq = false;
                } else {
                  stat.statStep = STEP_WAIT_ENTRY;
                }
              }
              break;
            case STEP_UNLOAD_90:
              tempExit90 = true;
              tempTurn = true;
              tempRollP = true;
              stat.statRunning = true;
              stat.instStepWatchdog.call(true, tempTimeout, dtMs);
              if (stat.instStepWatchdog.q) {
                stat.instStepWatchdog.call(false, tempTimeout, dtMs);
                stat.statStep = STEP_FAULT;
              } else if (inputs.atExit90 && !inputs.frontLimit && !inputs.backLimit) {
                stat.instStepWatchdog.call(false, tempTimeout, dtMs);
                ioHmi.diRoutedCount += 1;
                stat.statStep = STEP_RETURN_0;
              }
              break;
            case STEP_RETURN_0:
              stat.statRunning = true;
              stat.instStepWatchdog.call(!inputs.limit0, tempTimeout, dtMs);
              if (stat.instStepWatchdog.q) {
                stat.instStepWatchdog.call(false, tempTimeout, dtMs);
                stat.statStep = STEP_FAULT;
              } else if (inputs.limit0) {
                stat.instStepWatchdog.call(false, tempTimeout, dtMs);
                if (stat.statStopReq) {
                  stat.statStep = STEP_IDLE;
                  stat.statRunning = false;
                  stat.statStopReq = false;
                } else {
                  stat.statStep = STEP_WAIT_ENTRY;
                }
              }
              break;
            case STEP_FAULT:
              stat.statRunning = false;
              stat.instStepWatchdog.call(false, tempTimeout, dtMs);
              break;
            default:
              stat.statStep = STEP_IDLE;
              stat.statRunning = false;
              break;
          }
        }

        if (!inputs.limit0 && !inputs.limit90) {
          tempRollP = false;
          tempRollM = false;
        }
        if (!inputs.eStopOk) {
          tempEntryConv = tempExit0 = tempExit90 = tempTurn = tempRollP = tempRollM = false;
        }

        const wStatus = !inputs.eStopOk
          ? ERR_ESTOP
          : stat.statStep === STEP_FAULT
          ? ERR_TIMEOUT
          : stat.statRunning
          ? STATUS_OK
          : STATUS_IDLE;
        ioHmi.wStatus = wordStr(wStatus);
        ioHmi.iCurrentStep = stat.statStep;
        ioHmi.bFault = stat.statStep === STEP_FAULT || !inputs.eStopOk;

        return {
          entryConveyor: tempEntryConv && inputs.eStopOk,
          exitConveyor0: tempExit0 && inputs.eStopOk,
          exitConveyor90: tempExit90 && inputs.eStopOk,
          turnTable: tempTurn && inputs.eStopOk,
          rollPlus: tempRollP && inputs.eStopOk,
          rollMinus: tempRollM && inputs.eStopOk,
          error: stat.statStep === STEP_FAULT || !inputs.eStopOk,
          status: ioHmi.wStatus,
        };
      },
    };
  },

  FB_FIO_AutomatedWarehouse() {
    const stat = {
      statStep: 0,
      statCell: 0,
      statIsRetrieve: false,
      statExecOld: false,
      statStatus: 0x7000,
      instSettleTimer: makeTon(),
      instMoveWatchdog: makeTon(),
    };
    return {
      stat,
      injectPrivate(p) {
        if ('statStep' in p) stat.statStep = Number(p.statStep);
        if ('statCell' in p) stat.statCell = Number(p.statCell);
        if ('statIsRetrieve' in p) stat.statIsRetrieve = Boolean(p.statIsRetrieve);
        if ('statStatus' in p) stat.statStatus = parseS7Word(p.statStatus) ?? 0x7000;
      },
      step(inputs, ioHmi, dtMs) {
        const POS_IO_STATION = 55,
          MIN_CELL = 1,
          MAX_CELL = 54;
        const STEP_IDLE = 0,
          STEP_MOVE_SRC = 10,
          STEP_FORK_EXT_PICK = 20,
          STEP_LIFT_UP = 30,
          STEP_FORK_RET_PICK = 40,
          STEP_MOVE_DST = 50,
          STEP_FORK_EXT_PLACE = 60,
          STEP_LIFT_DOWN = 70,
          STEP_FORK_RET_PLACE = 80,
          STEP_DONE = 90,
          STEP_FAULT = 99;
        const STATUS_FINISHED = 0x0000,
          STATUS_NO_CALL = 0x7000,
          STATUS_BUSY = 0x7002,
          ERR_CELL_RANGE = 0x8200,
          ERR_TIMEOUT = 0x8401,
          ERR_ESTOP = 0x8402;

        let settleMs = parseS7TimeToMs(ioHmi.tAxisSettleTime) ?? 0;
        if (settleMs <= 0) {
          settleMs = 800;
          ioHmi.tAxisSettleTime = 'T#800ms';
        }
        let moveTimeoutMs = parseS7TimeToMs(ioHmi.tMoveTimeout) ?? 0;
        if (moveTimeoutMs <= 0) {
          moveTimeoutMs = 10000;
          ioHmi.tMoveTimeout = 'T#10s';
        }

        const tempAxisStill = !inputs.movingX && !inputs.movingZ;
        const tempExecReq = Boolean(inputs.execute || ioHmi.bExecuteCmd);
        const tempExecRise = tempExecReq && !stat.statExecOld;
        stat.statExecOld = tempExecReq;

        const tempCell = ioHmi.iTargetCell > 0 ? ioHmi.iTargetCell : inputs.targetCell;
        const tempRetrieve = Boolean(inputs.modeRetrieve || ioHmi.bModeRetrieve);
        if (ioHmi.bExecuteCmd) ioHmi.bExecuteCmd = false;

        if (inputs.reset || ioHmi.bResetCmd) {
          ioHmi.bResetCmd = false;
          if (stat.statStep === STEP_FAULT && inputs.eStopOk) {
            stat.statStep = STEP_IDLE;
            stat.statStatus = STATUS_NO_CALL;
          }
        }
        if (!inputs.eStopOk) {
          stat.statStep = STEP_FAULT;
          stat.statStatus = ERR_ESTOP;
        }

        let tempTargetPos = ioHmi.iActiveTargetPos;
        let tempForkL = false,
          tempForkR = false,
          tempLift = false;

        switch (stat.statStep) {
          case STEP_IDLE:
            stat.instSettleTimer.call(false, settleMs, dtMs);
            stat.instMoveWatchdog.call(false, moveTimeoutMs, dtMs);
            if (tempExecRise && inputs.eStopOk) {
              if (tempCell < MIN_CELL || tempCell > MAX_CELL) {
                stat.statStatus = ERR_CELL_RANGE;
                stat.statStep = STEP_FAULT;
              } else {
                stat.statCell = tempCell;
                stat.statIsRetrieve = tempRetrieve;
                stat.statStep = STEP_MOVE_SRC;
                stat.statStatus = STATUS_BUSY;
              }
            }
            break;
          case STEP_MOVE_SRC:
            tempTargetPos = stat.statIsRetrieve ? stat.statCell : POS_IO_STATION;
            stat.instMoveWatchdog.call(true, moveTimeoutMs, dtMs);
            if (stat.instMoveWatchdog.q) {
              stat.instMoveWatchdog.call(false, moveTimeoutMs, dtMs);
              stat.statStatus = ERR_TIMEOUT;
              stat.statStep = STEP_FAULT;
            } else if (tempAxisStill && inputs.atMiddle && (stat.statIsRetrieve || inputs.atEntry)) {
              stat.instSettleTimer.call(true, settleMs, dtMs);
              if (stat.instSettleTimer.q) {
                stat.instSettleTimer.call(false, settleMs, dtMs);
                stat.instMoveWatchdog.call(false, moveTimeoutMs, dtMs);
                stat.statStep = STEP_FORK_EXT_PICK;
              }
            } else {
              stat.instSettleTimer.call(false, settleMs, dtMs);
            }
            break;
          case STEP_FORK_EXT_PICK:
            if (stat.statIsRetrieve) {
              tempTargetPos = stat.statCell;
              tempForkR = true;
            } else {
              tempTargetPos = POS_IO_STATION;
              tempForkL = true;
            }
            stat.instMoveWatchdog.call(true, moveTimeoutMs, dtMs);
            if (stat.instMoveWatchdog.q) {
              stat.instMoveWatchdog.call(false, moveTimeoutMs, dtMs);
              stat.statStatus = ERR_TIMEOUT;
              stat.statStep = STEP_FAULT;
            } else if ((stat.statIsRetrieve && inputs.atRight) || (!stat.statIsRetrieve && inputs.atLeft)) {
              stat.instMoveWatchdog.call(false, moveTimeoutMs, dtMs);
              stat.statStep = STEP_LIFT_UP;
            }
            break;
          case STEP_LIFT_UP:
            if (stat.statIsRetrieve) {
              tempTargetPos = stat.statCell;
              tempForkR = true;
            } else {
              tempTargetPos = POS_IO_STATION;
              tempForkL = true;
            }
            tempLift = true;
            stat.instSettleTimer.call(true, settleMs, dtMs);
            if (stat.instSettleTimer.q) {
              stat.instSettleTimer.call(false, settleMs, dtMs);
              stat.statStep = STEP_FORK_RET_PICK;
            }
            break;
          case STEP_FORK_RET_PICK:
            tempTargetPos = stat.statIsRetrieve ? stat.statCell : POS_IO_STATION;
            tempLift = true;
            stat.instMoveWatchdog.call(true, moveTimeoutMs, dtMs);
            if (stat.instMoveWatchdog.q) {
              stat.instMoveWatchdog.call(false, moveTimeoutMs, dtMs);
              stat.statStatus = ERR_TIMEOUT;
              stat.statStep = STEP_FAULT;
            } else if (inputs.atMiddle) {
              stat.instMoveWatchdog.call(false, moveTimeoutMs, dtMs);
              stat.statStep = STEP_MOVE_DST;
            }
            break;
          case STEP_MOVE_DST:
            tempTargetPos = stat.statIsRetrieve ? POS_IO_STATION : stat.statCell;
            tempLift = true;
            stat.instMoveWatchdog.call(true, moveTimeoutMs, dtMs);
            if (stat.instMoveWatchdog.q) {
              stat.instMoveWatchdog.call(false, moveTimeoutMs, dtMs);
              stat.statStatus = ERR_TIMEOUT;
              stat.statStep = STEP_FAULT;
            } else if (tempAxisStill && inputs.atMiddle && (!stat.statIsRetrieve || !inputs.atExit)) {
              stat.instSettleTimer.call(true, settleMs, dtMs);
              if (stat.instSettleTimer.q) {
                stat.instSettleTimer.call(false, settleMs, dtMs);
                stat.instMoveWatchdog.call(false, moveTimeoutMs, dtMs);
                stat.statStep = STEP_FORK_EXT_PLACE;
              }
            } else {
              stat.instSettleTimer.call(false, settleMs, dtMs);
            }
            break;
          case STEP_FORK_EXT_PLACE:
            tempTargetPos = stat.statIsRetrieve ? POS_IO_STATION : stat.statCell;
            tempForkR = true;
            tempLift = true;
            stat.instMoveWatchdog.call(true, moveTimeoutMs, dtMs);
            if (stat.instMoveWatchdog.q) {
              stat.instMoveWatchdog.call(false, moveTimeoutMs, dtMs);
              stat.statStatus = ERR_TIMEOUT;
              stat.statStep = STEP_FAULT;
            } else if (inputs.atRight) {
              stat.instMoveWatchdog.call(false, moveTimeoutMs, dtMs);
              stat.statStep = STEP_LIFT_DOWN;
            }
            break;
          case STEP_LIFT_DOWN:
            tempTargetPos = stat.statIsRetrieve ? POS_IO_STATION : stat.statCell;
            tempForkR = true;
            stat.instSettleTimer.call(true, settleMs, dtMs);
            if (stat.instSettleTimer.q) {
              stat.instSettleTimer.call(false, settleMs, dtMs);
              stat.statStep = STEP_FORK_RET_PLACE;
            }
            break;
          case STEP_FORK_RET_PLACE:
            tempTargetPos = stat.statIsRetrieve ? POS_IO_STATION : stat.statCell;
            stat.instMoveWatchdog.call(true, moveTimeoutMs, dtMs);
            if (stat.instMoveWatchdog.q) {
              stat.instMoveWatchdog.call(false, moveTimeoutMs, dtMs);
              stat.statStatus = ERR_TIMEOUT;
              stat.statStep = STEP_FAULT;
            } else if (inputs.atMiddle) {
              stat.instMoveWatchdog.call(false, moveTimeoutMs, dtMs);
              if (stat.statIsRetrieve) ioHmi.diRetrievedCount += 1;
              else ioHmi.diStoredCount += 1;
              stat.statStatus = STATUS_FINISHED;
              stat.statStep = STEP_DONE;
            }
            break;
          case STEP_DONE:
            stat.statStatus = STATUS_FINISHED;
            if (!tempExecReq) {
              stat.statStep = STEP_IDLE;
              stat.statStatus = STATUS_NO_CALL;
            }
            break;
          case STEP_FAULT:
            stat.instSettleTimer.call(false, settleMs, dtMs);
            stat.instMoveWatchdog.call(false, moveTimeoutMs, dtMs);
            break;
          default:
            stat.statStep = STEP_IDLE;
            break;
        }

        if (inputs.atMiddle && !tempForkL && !tempForkR) {
          ioHmi.iActiveTargetPos = tempTargetPos;
        }
        if (!inputs.eStopOk) tempForkL = tempForkR = tempLift = false;

        const busy = stat.statStep !== STEP_IDLE && stat.statStep !== STEP_DONE && stat.statStep !== STEP_FAULT;
        const done = stat.statStep === STEP_DONE;
        ioHmi.iCurrentStep = stat.statStep;
        ioHmi.bBusy = busy;
        ioHmi.bDone = done;
        ioHmi.bFault = stat.statStep === STEP_FAULT || !inputs.eStopOk;
        ioHmi.wStatus = wordStr(stat.statStatus);

        return {
          targetPosition: ioHmi.iActiveTargetPos,
          forksLeft: tempForkL && inputs.eStopOk,
          forksRight: tempForkR && inputs.eStopOk,
          lift: tempLift && inputs.eStopOk,
          done,
          busy,
          error: stat.statStep === STEP_FAULT || !inputs.eStopOk,
          status: wordStr(stat.statStatus),
        };
      },
    };
  },

  FB_FIO_TankLevelPID() {
    const stat = { statIntegral: f32(0.0), statPrevError: f32(0.0), statManualOld: false };
    return {
      stat,
      injectPrivate(p) {
        if ('statIntegral' in p) stat.statIntegral = f32(p.statIntegral);
        if ('statPrevError' in p) stat.statPrevError = f32(p.statPrevError);
        if ('statManualOld' in p) stat.statManualOld = Boolean(p.statManualOld);
      },
      step(inputs, ioHmi) {
        const MAX_LEVEL_CM = f32(300.0);
        const HIGH_ALARM_CM = f32(285.0);
        const LOW_ALARM_CM = f32(10.0);
        const MAX_VALVE_V = f32(10.0);
        const STATUS_OK = 0x0000,
          STATUS_IDLE = 0x7000,
          ERR_DT_INVALID = 0x8200,
          ERR_OVERFLOW_PROT = 0x8401,
          ERR_ESTOP = 0x8402;

        let tempLevelCm = f32(f32(inputs.levelMeterV) * f32(30.0));
        if (tempLevelCm < 0.0) tempLevelCm = f32(0.0);
        else if (tempLevelCm > MAX_LEVEL_CM) tempLevelCm = MAX_LEVEL_CM;

        const tempHighAlm = tempLevelCm >= HIGH_ALARM_CM;
        const tempLowAlm = tempLevelCm <= LOW_ALARM_CM;

        if (inputs.reset || ioHmi.bResetCmd) {
          stat.statIntegral = f32(0.0);
          stat.statPrevError = f32(0.0);
          ioHmi.bResetCmd = false;
        }

        let tempFillV = f32(0.0),
          tempDischV = f32(0.0),
          tempErr = f32(0.0),
          wStatus = STATUS_OK;
        const dtSec = f32(inputs.dtSec);

        if (!inputs.eStopOk) {
          stat.statIntegral = f32(0.0);
          stat.statPrevError = f32(0.0);
          wStatus = ERR_ESTOP;
        } else if (!inputs.enable) {
          stat.statIntegral = f32(0.0);
          stat.statPrevError = f32(0.0);
          wStatus = STATUS_IDLE;
        } else if (dtSec <= 0.0) {
          wStatus = ERR_DT_INVALID;
        } else {
          const tempSpCm =
            f32(ioHmi.rSetpoint) > 0.0
              ? f32(ioHmi.rSetpoint)
              : f32(inputs.setpointCm) > 0.0
              ? f32(inputs.setpointCm)
              : f32(150.0);
          const tempKp = f32(ioHmi.rKp) !== 0.0 ? f32(ioHmi.rKp) : f32(2.0);
          const tempKi = f32(ioHmi.rKi) >= 0.0 ? f32(ioHmi.rKi) : f32(0.2);
          const tempKd = f32(ioHmi.rKd) >= 0.0 ? f32(ioHmi.rKd) : f32(0.05);

          tempErr = f32(tempSpCm - tempLevelCm);
          if (Math.abs(tempErr) <= f32(ioHmi.rDeadband)) tempErr = f32(0.0);

          if (stat.statManualOld && !ioHmi.bManualMode) {
            stat.statIntegral = f32(f32(ioHmi.rManualFillValve) - f32(ioHmi.rManualDischargeValve));
            if (stat.statIntegral > 10.0) stat.statIntegral = f32(10.0);
            if (stat.statIntegral < -10.0) stat.statIntegral = f32(-10.0);
            stat.statPrevError = tempErr;
          }
          stat.statManualOld = Boolean(ioHmi.bManualMode);

          if (ioHmi.bManualMode) {
            tempFillV = f32(ioHmi.rManualFillValve);
            tempDischV = f32(ioHmi.rManualDischargeValve);
            wStatus = STATUS_OK;
          } else {
            const tempDeriv = f32(f32(tempErr - stat.statPrevError) / dtSec);
            stat.statPrevError = tempErr;
            stat.statIntegral = f32(stat.statIntegral + f32(f32(tempKi * tempErr) * dtSec));
            if (stat.statIntegral > 10.0) stat.statIntegral = f32(10.0);
            if (stat.statIntegral < -10.0) stat.statIntegral = f32(-10.0);
            let tempPidOut = f32(
              f32(tempKp * tempErr) + stat.statIntegral + f32(tempKd * tempDeriv)
            );
            if (tempPidOut > 10.0) tempPidOut = f32(10.0);
            if (tempPidOut < -10.0) tempPidOut = f32(-10.0);
            if (tempPidOut > 0.0) {
              tempFillV = tempPidOut;
              tempDischV = f32(0.0);
            } else {
              tempFillV = f32(0.0);
              tempDischV = f32(-tempPidOut);
            }
            wStatus = STATUS_OK;
          }
        }

        if (tempHighAlm) {
          tempFillV = f32(0.0);
          if (inputs.eStopOk && inputs.enable && dtSec > 0.0) wStatus = ERR_OVERFLOW_PROT;
        }
        if (!inputs.eStopOk) {
          tempFillV = f32(0.0);
          tempDischV = f32(0.0);
          wStatus = ERR_ESTOP;
        }

        if (tempFillV > MAX_VALVE_V) tempFillV = MAX_VALVE_V;
        if (tempFillV < 0.0) tempFillV = f32(0.0);
        if (tempDischV > MAX_VALVE_V) tempDischV = MAX_VALVE_V;
        if (tempDischV < 0.0) tempDischV = f32(0.0);

        ioHmi.wStatus = wordStr(wStatus);
        ioHmi.rCurrentLevel = tempLevelCm;
        ioHmi.rControlError = tempErr;
        ioHmi.rFillValveOut = tempFillV;
        ioHmi.rDischargeValveOut = tempDischV;
        ioHmi.bHighLevelAlarm = tempHighAlm;
        ioHmi.bLowLevelAlarm = tempLowAlm;

        return {
          fillValveV: tempFillV,
          dischargeValveV: tempDischV,
          levelCm: tempLevelCm,
          highLevelAlarm: tempHighAlm,
          lowLevelAlarm: tempLowAlm,
          error: !inputs.eStopOk || tempHighAlm || dtSec <= 0.0,
          status: ioHmi.wStatus,
        };
      },
    };
  },

  FB_FIO_Assembler() {
    const stat = {
      statStep: 0,
      statRunning: false,
      statStopReq: false,
      statStartOld: false,
      statResetOld: false,
      instDelayTimer: makeTon(),
      instWatchdog: makeTon(),
    };
    return {
      stat,
      injectPrivate(p) {
        if ('statStep' in p) stat.statStep = Number(p.statStep);
        if ('statRunning' in p) stat.statRunning = Boolean(p.statRunning);
        if ('statStopReq' in p) stat.statStopReq = Boolean(p.statStopReq);
      },
      step(inputs, ioHmi, dtMs) {
        const STEP_IDLE = 0,
          STEP_FEED_BOTH = 10,
          STEP_CLAMP_BOTH = 20,
          STEP_Z_DOWN_LID = 30,
          STEP_GRAB_LID = 40,
          STEP_Z_UP_LID = 50,
          STEP_X_TO_BASE = 60,
          STEP_Z_DOWN_ASSY = 70,
          STEP_RELEASE_ASSY = 80,
          STEP_EJECT = 90,
          STEP_FAULT = 99;
        const STATUS_OK = 0x0000,
          STATUS_IDLE = 0x7000,
          ERR_TIMEOUT = 0x8401,
          ERR_ESTOP = 0x8402;

        const ad = parseS7TimeToMs(ioHmi.tActionDelay) ?? 0;
        const tempDelay = ad > 0 ? ad : 500;
        const to = parseS7TimeToMs(ioHmi.tStepTimeout) ?? 0;
        const tempTimeout = to > 0 ? to : 6000;

        const startIn = Boolean(inputs.startBtn || ioHmi.bStartCmd);
        const tempStartRise = startIn && !stat.statStartOld;
        stat.statStartOld = startIn;
        if (ioHmi.bStartCmd) ioHmi.bStartCmd = false;

        const resetIn = Boolean(inputs.resetBtn || ioHmi.bResetCmd);
        const tempResetRise = resetIn && !stat.statResetOld;
        stat.statResetOld = resetIn;
        if (ioHmi.bResetCmd) ioHmi.bResetCmd = false;

        if (!inputs.stopBtn || ioHmi.bStopCmd) stat.statStopReq = true;
        if (ioHmi.bStopCmd) ioHmi.bStopCmd = false;

        if (tempResetRise && stat.statStep === STEP_FAULT && inputs.eStopOk) {
          stat.statStep = STEP_IDLE;
          stat.statRunning = false;
          stat.statStopReq = false;
        }
        if (!inputs.eStopOk) {
          stat.statStep = STEP_FAULT;
          stat.statRunning = false;
        }

        let tempConvLids = false,
          tempConvBases = false,
          tempClampLid = false,
          tempClampBase = false,
          tempPosRaise = false,
          tempMoveX = false,
          tempMoveZ = false,
          tempGrab = false;

        const runDelayWatchdog = (cond, nextStep) => {
          stat.instWatchdog.call(true, tempTimeout, dtMs);
          if (stat.instWatchdog.q) {
            stat.instWatchdog.call(false, tempTimeout, dtMs);
            stat.statStep = STEP_FAULT;
          } else if (cond) {
            stat.instDelayTimer.call(true, tempDelay, dtMs);
            if (stat.instDelayTimer.q) {
              stat.instDelayTimer.call(false, tempDelay, dtMs);
              stat.instWatchdog.call(false, tempTimeout, dtMs);
              stat.statStep = nextStep;
            }
          } else {
            stat.instDelayTimer.call(false, tempDelay, dtMs);
          }
        };

        if (ioHmi.bManualMode) {
          stat.statRunning = false;
          stat.statStep = STEP_IDLE;
        } else {
          switch (stat.statStep) {
            case STEP_IDLE:
              stat.statRunning = false;
              stat.instDelayTimer.call(false, tempDelay, dtMs);
              stat.instWatchdog.call(false, tempTimeout, dtMs);
              if (tempStartRise && inputs.eStopOk) {
                stat.statRunning = true;
                stat.statStopReq = false;
                stat.statStep = STEP_FEED_BOTH;
              }
              break;
            case STEP_FEED_BOTH:
              tempConvLids = !inputs.lidAtPlace;
              tempConvBases = !inputs.baseAtPlace;
              stat.statRunning = true;
              if (stat.statStopReq && !inputs.lidAtPlace && !inputs.baseAtPlace) {
                stat.instWatchdog.call(false, tempTimeout, dtMs);
                stat.statStep = STEP_IDLE;
                stat.statRunning = false;
                stat.statStopReq = false;
              } else {
                stat.instWatchdog.call(true, tempTimeout, dtMs);
                if (stat.instWatchdog.q) {
                  stat.instWatchdog.call(false, tempTimeout, dtMs);
                  stat.statStep = STEP_FAULT;
                  stat.statRunning = false;
                  tempConvLids = false;
                  tempConvBases = false;
                } else if (inputs.lidAtPlace && inputs.baseAtPlace) {
                  stat.instWatchdog.call(false, tempTimeout, dtMs);
                  stat.statStep = STEP_CLAMP_BOTH;
                }
              }
              break;
            case STEP_CLAMP_BOTH:
              tempClampLid = true;
              tempClampBase = true;
              stat.statRunning = true;
              runDelayWatchdog(inputs.lidClamped && inputs.baseClamped, STEP_Z_DOWN_LID);
              break;
            case STEP_Z_DOWN_LID:
              tempClampLid = true;
              tempClampBase = true;
              tempMoveZ = true;
              stat.statRunning = true;
              runDelayWatchdog(!inputs.movingZ, STEP_GRAB_LID);
              break;
            case STEP_GRAB_LID:
              tempClampBase = true;
              tempMoveZ = true;
              tempGrab = true;
              stat.statRunning = true;
              runDelayWatchdog(inputs.itemDetected, STEP_Z_UP_LID);
              break;
            case STEP_Z_UP_LID:
              tempClampBase = true;
              tempGrab = true;
              stat.statRunning = true;
              if (!inputs.itemDetected) stat.statStep = STEP_FAULT;
              else runDelayWatchdog(!inputs.movingZ, STEP_X_TO_BASE);
              break;
            case STEP_X_TO_BASE:
              tempClampBase = true;
              tempMoveX = !inputs.movingZ;
              tempGrab = true;
              stat.statRunning = true;
              if (!inputs.itemDetected) stat.statStep = STEP_FAULT;
              else runDelayWatchdog(!inputs.movingX && !inputs.movingZ, STEP_Z_DOWN_ASSY);
              break;
            case STEP_Z_DOWN_ASSY:
              tempClampBase = true;
              tempMoveX = true;
              tempMoveZ = true;
              tempGrab = true;
              stat.statRunning = true;
              runDelayWatchdog(!inputs.movingZ, STEP_RELEASE_ASSY);
              break;
            case STEP_RELEASE_ASSY:
              tempClampBase = true;
              tempMoveX = true;
              tempMoveZ = true;
              stat.statRunning = true;
              runDelayWatchdog(!inputs.itemDetected, STEP_EJECT);
              break;
            case STEP_EJECT:
              tempConvBases = Boolean(inputs.posAtLimit && !inputs.movingZ);
              tempPosRaise = true;
              tempMoveX = Boolean(inputs.movingZ);
              stat.statRunning = true;
              stat.instWatchdog.call(true, tempTimeout, dtMs);
              if (stat.instWatchdog.q) {
                stat.instWatchdog.call(false, tempTimeout, dtMs);
                stat.statStep = STEP_FAULT;
              } else if (inputs.partLeaving) {
                stat.instWatchdog.call(false, tempTimeout, dtMs);
                ioHmi.diAssembledCount += 1;
                if (stat.statStopReq) {
                  stat.statStep = STEP_IDLE;
                  stat.statRunning = false;
                  stat.statStopReq = false;
                } else {
                  stat.statStep = STEP_FEED_BOTH;
                }
              }
              break;
            case STEP_FAULT:
              stat.statRunning = false;
              stat.instDelayTimer.call(false, tempDelay, dtMs);
              stat.instWatchdog.call(false, tempTimeout, dtMs);
              break;
            default:
              stat.statStep = STEP_IDLE;
              stat.statRunning = false;
              break;
          }
        }

        if (!inputs.eStopOk) {
          tempConvLids = tempConvBases = tempClampLid = tempClampBase = tempPosRaise = tempMoveX = tempMoveZ = tempGrab = false;
        }

        const wStatus = !inputs.eStopOk
          ? ERR_ESTOP
          : stat.statStep === STEP_FAULT
          ? ERR_TIMEOUT
          : stat.statRunning
          ? STATUS_OK
          : STATUS_IDLE;
        ioHmi.wStatus = wordStr(wStatus);
        ioHmi.iCurrentStep = stat.statStep;
        ioHmi.bRunning = stat.statRunning;
        ioHmi.bFault = stat.statStep === STEP_FAULT || !inputs.eStopOk;

        return {
          convLids: tempConvLids && inputs.eStopOk,
          convBases: tempConvBases && inputs.eStopOk,
          clampLid: tempClampLid && inputs.eStopOk,
          clampBase: tempClampBase && inputs.eStopOk,
          posRaise: tempPosRaise && inputs.eStopOk,
          moveX: tempMoveX && inputs.eStopOk,
          moveZ: tempMoveZ && inputs.eStopOk,
          grab: tempGrab && inputs.eStopOk,
          error: stat.statStep === STEP_FAULT || !inputs.eStopOk,
          status: ioHmi.wStatus,
        };
      },
    };
  },
};

const INTRINSIC_TIMING_MODE = {
  FC_AnalogScaleAlarm: 'combinational',
  FB_LowPassFilter: 'combinational',
  FB_CylinderCtrl: 'ton_time',
  FB_MotorRevCtrl: 'ton_time',
  FB_RingFifo: 'combinational',
  FC_ButtonDebounceToggle: 'scan_cycle_param',
  FB_ModbusPoller: 'ton_time',
  FB_DualEStopInterlock: 'ton_time',
  FB_FIO_SortingByHeight: 'ton_time',
  FB_FIO_PickAndPlace: 'ton_time',
  FB_FIO_BufferConveyor: 'ton_time',
  FB_FIO_Turntable: 'ton_time',
  FB_FIO_AutomatedWarehouse: 'ton_time',
  FB_FIO_TankLevelPID: 'dt_sec_param',
  FB_FIO_Assembler: 'ton_time',
};

function resolveCyclePlan(blockName, stepObj, policy, stepOverride, stepDev) {
  const parsed = parseScanCycleOrDuration(stepObj.scanCycleOrDuration);
  const defaultScanMs = policy.defaultScanMs || 10;
  const timingMode = policy.timingMode || INTRINSIC_TIMING_MODE[blockName] || 'ton_time';

  if (stepOverride && stepOverride.scanCount) {
    return {
      scanCount: stepOverride.scanCount,
      scanDtMs: stepOverride.scanDtMs || defaultScanMs,
      timingAdapted: true,
    };
  }
  if (stepDev && stepDev.overrideScanCount) {
    return {
      scanCount: stepDev.overrideScanCount,
      scanDtMs: stepDev.overrideScanDtMs || defaultScanMs,
      timingAdapted: true,
    };
  }
  if (!parsed) return { scanCount: 1, scanDtMs: defaultScanMs, timingAdapted: false };
  if (parsed.kind === 'scan_cycles') {
    return { scanCount: parsed.cycles, scanDtMs: defaultScanMs, timingAdapted: false };
  }
  // duration_ms:
  if (timingMode === 'combinational' || timingMode === 'dt_sec_param') {
    return { scanCount: 1, scanDtMs: parsed.ms || defaultScanMs, timingAdapted: false };
  }
  if (timingMode === 'scan_cycle_param') {
    const pinMs =
      stepObj.inputs && typeof stepObj.inputs.scanCycleMs === 'number' && stepObj.inputs.scanCycleMs > 0
        ? stepObj.inputs.scanCycleMs
        : defaultScanMs;
    const count = Math.max(1, Math.round(parsed.ms / pinMs));
    return { scanCount: count, scanDtMs: pinMs, timingAdapted: false };
  }
  // ton_time
  const count = Math.max(1, Math.round(parsed.ms / defaultScanMs));
  return { scanCount: count, scanDtMs: defaultScanMs, timingAdapted: false };
}

function checkKnownMismatchesForAdapt(mismatches, stepOverride, stepDev) {
  const knownOut = new Set(
    (stepOverride && stepOverride.knownOutputsMismatch) ||
      (stepDev && stepDev.knownOutputsMismatch) ||
      []
  );
  const knownHmi = new Set(
    (stepOverride && stepOverride.knownHmiMismatch) ||
      (stepDev && stepDev.knownHmiMismatch) ||
      []
  );
  const isKnownField = (field) => {
    if (field.startsWith('expectedOutputs.')) return knownOut.has(field.slice('expectedOutputs.'.length));
    if (field.startsWith('expectedHmi_out.')) return knownHmi.has(field.slice('expectedHmi_out.'.length));
    return false;
  };
  const unexpected = mismatches.filter((m) => !isKnownField(m.field));
  const matchedKnown = new Set(mismatches.filter((m) => isKnownField(m.field)).map((m) => m.field));
  for (const f of knownOut) {
    if (!matchedKnown.has(`expectedOutputs.${f}`)) {
      unexpected.push({
        field: `manifest.expectedOutputs.${f}`,
        expected: 'MISMATCH',
        actual: 'MATCHED_UNEXPECTEDLY',
      });
    }
  }
  for (const f of knownHmi) {
    if (!matchedKnown.has(`expectedHmi_out.${f}`)) {
      unexpected.push({
        field: `manifest.expectedHmi_out.${f}`,
        expected: 'MISMATCH',
        actual: 'MATCHED_UNEXPECTEDLY',
      });
    }
  }
  return { unexpected, hasKnown: matchedKnown.size > 0 };
}

function checkAffectedFieldsForMismatch(mismatches, stepDev) {
  if (mismatches.length === 0) {
    return [{ field: 'manifest.affectedFields', expected: 'MISMATCH', actual: 'PASS_UNEXPECTEDLY' }];
  }
  const affected = Array.isArray(stepDev.affectedFields) ? stepDev.affectedFields : [];
  if (affected.length === 0) return [];
  return mismatches.filter(
    (m) => !affected.some((af) => m.field === af || m.field.startsWith(`${af}.`))
  );
}

function runBlockEval(vecJson, manifest, mode) {
  const blockName = vecJson.blockName;
  const tol = (manifest.tolerances && manifest.tolerances.realAbs) || 1e-5;
  const policy =
    mode === 'raw'
      ? { timingMode: INTRINSIC_TIMING_MODE[blockName] || 'ton_time', defaultScanMs: 10, caseIsolation: 'per_case_reset' }
      : (manifest.blockPolicies && manifest.blockPolicies[blockName]) || {
          timingMode: INTRINSIC_TIMING_MODE[blockName] || 'ton_time',
          defaultScanMs: 10,
        };
  const allDevs = mode === 'manifest' ? (manifest.deviations || []).filter((d) => d.blockName === blockName) : [];

  let fb = BLOCK_MODELS[blockName]();
  const caseResults = [];

  for (let tcIdx = 0; tcIdx < vecJson.testCases.length; tcIdx += 1) {
    const tc = vecJson.testCases[tcIdx];
    const tcDevs = allDevs.filter((d) => d.caseId === tc.caseId);
    const caseAction = tcDevs.find((d) => d.step == null) || null;

    if (mode === 'raw' || policy.caseIsolation !== 'cumulative') {
      fb = BLOCK_MODELS[blockName]();
    }
    let casePrivateInjected = false;
    if (mode === 'manifest' && caseAction && caseAction.offlineEvalAction === 'inject_private_var' && caseAction.privateInit) {
      fb.injectPrivate(caseAction.privateInit);
      casePrivateInjected = true;
    }

    const stepResults = [];
    let prevInputs = null;
    for (const st of tc.steps) {
      const stepSpecificDev = mode === 'manifest' ? tcDevs.find((d) => d.step === st.step) || null : null;
      const stepDev =
        stepSpecificDev ||
        (mode === 'manifest' && caseAction && caseAction.stepOverrides ? caseAction : null) ||
        (casePrivateInjected && st.step === 1 ? caseAction : null);
      const stepOverride =
        stepDev && stepDev.stepOverrides ? stepDev.stepOverrides[String(st.step)] || null : null;

      if (stepDev && stepDev.offlineEvalAction === 'skip_known_mismatch') {
        stepResults.push({
          step: st.step,
          status: 'KNOWN_VECTOR_MISMATCH',
          deviationId: stepDev.id,
          mismatches: [],
        });
        prevInputs = clone(st.inputs);
        continue;
      }

      const ioHmi = clone(st.ioHmi_in || st.ioHmi);
      const inputs = clone(st.inputs);
      let edgeResetInserted = false;

      if (
        mode === 'manifest' &&
        stepDev &&
        stepDev.offlineEvalAction === 'insert_edge_reset_cycle' &&
        Array.isArray(stepDev.edgePinsToPulse) &&
        prevInputs
      ) {
        const resetInputs = clone(inputs);
        for (const pin of stepDev.edgePinsToPulse) {
          if (pin in resetInputs) resetInputs[pin] = false;
        }
        const resetHmi = clone(ioHmi);
        if ('bResetCmd' in resetHmi) resetHmi.bResetCmd = false;
        if ('bHmiResetCmd' in resetHmi) resetHmi.bHmiResetCmd = false;
        fb.step(resetInputs, resetHmi, policy.defaultScanMs || 10);
        edgeResetInserted = true;
      }

      let stepPrivateInjected = casePrivateInjected && st.step === 1;
      if (
        mode === 'manifest' &&
        stepDev &&
        stepDev.privateInit &&
        stepDev.step != null
      ) {
        fb.injectPrivate(stepDev.privateInit);
        stepPrivateInjected = true;
      }

      const { scanCount, scanDtMs, timingAdapted } = resolveCyclePlan(
        blockName,
        st,
        policy,
        stepOverride,
        stepDev
      );

      let pulsedTrueBefore = false;
      if (mode === 'manifest' && stepOverride && Array.isArray(stepOverride.pulseTrueBefore)) {
        const pulseInputs = clone(inputs);
        for (const pin of stepOverride.pulseTrueBefore) {
          if (pin in pulseInputs) pulseInputs[pin] = true;
        }
        fb.step(pulseInputs, ioHmi, scanDtMs);
        pulsedTrueBefore = true;
      }

      let actualOutputs = null;
      for (let c = 0; c < scanCount; c += 1) {
        actualOutputs = fb.step(inputs, ioHmi, scanDtMs);
      }
      prevInputs = clone(st.inputs);

      const expectedOut = st.expectedOutputs;
      const expectedHmi = st.expectedHmi_out || st.expectedHmi;
      const rawMismatches = [
        ...compareSection(actualOutputs, expectedOut, 'expectedOutputs', tol),
        ...compareSection(ioHmi, expectedHmi, 'expectedHmi_out', tol),
      ];

      let status = 'FAIL';
      let reportedMismatches = rawMismatches;

      if (mode === 'raw' || !stepDev) {
        status = rawMismatches.length === 0 ? 'PASS' : 'FAIL';
      } else {
        const act = stepDev.offlineEvalAction;
        if (act === 'inject_private_var') {
          status = rawMismatches.length === 0 ? (stepPrivateInjected ? 'PASS_WITH_PRIVATE_INIT' : 'PASS') : 'FAIL';
        } else if (act === 'insert_edge_reset_cycle') {
          status = rawMismatches.length === 0 ? (edgeResetInserted ? 'PASS_WITH_ADAPTED_TIMING' : 'PASS') : 'FAIL';
        } else if (act === 'adapt_cycles' || act === 'adapt_step_timing') {
          if (rawMismatches.length === 0) {
            status = timingAdapted || pulsedTrueBefore ? 'PASS_WITH_ADAPTED_TIMING' : 'PASS';
          } else {
            status = 'FAIL';
          }
        } else if (act === 'adapt_step_timing_and_check_known') {
          const { unexpected, hasKnown } = checkKnownMismatchesForAdapt(rawMismatches, stepOverride, stepDev);
          if (unexpected.length > 0) {
            status = 'FAIL';
            reportedMismatches = unexpected;
          } else if (hasKnown) {
            status = 'KNOWN_VECTOR_MISMATCH';
          } else {
            status = timingAdapted || pulsedTrueBefore ? 'PASS_WITH_ADAPTED_TIMING' : 'PASS';
          }
        } else if (act === 'report_vector_spec_mismatch' || act === 'allow_known_deviation') {
          const uncataloged = checkAffectedFieldsForMismatch(rawMismatches, stepDev);
          if (uncataloged.length > 0) {
            status = 'FAIL';
            reportedMismatches = uncataloged;
          } else {
            status = 'KNOWN_VECTOR_MISMATCH';
          }
        } else {
          status = rawMismatches.length === 0 ? 'PASS' : 'FAIL';
        }
      }

      stepResults.push({
        step: st.step,
        status,
        scanCount,
        scanDtMs,
        deviationId: stepDev ? stepDev.id : null,
        mismatches: reportedMismatches,
      });
    }

    const failedSteps = stepResults.filter((s) => s.status === 'FAIL');
    const knownDevSteps = stepResults.filter((s) => s.status === 'KNOWN_VECTOR_MISMATCH');
    caseResults.push({
      caseId: tc.caseId,
      category: tc.category,
      passed: failedSteps.length === 0,
      hasKnownDeviation: knownDevSteps.length > 0,
      steps: stepResults,
    });
  }

  const countStatus = (target) =>
    caseResults.reduce((acc, c) => acc + c.steps.filter((s) => s.status === target).length, 0);

  const stepsPassDirect = countStatus('PASS');
  const stepsPassAdapted = countStatus('PASS_WITH_ADAPTED_TIMING');
  const stepsPassPrivateInit = countStatus('PASS_WITH_PRIVATE_INIT');
  const stepsKnownVectorMismatch = countStatus('KNOWN_VECTOR_MISMATCH');
  const uncatalogedFail = countStatus('FAIL');

  return {
    blockId: vecJson.blockId,
    blockName,
    casesTotal: caseResults.length,
    casesPassed: caseResults.filter((c) => c.passed).length,
    stepsTotal: caseResults.reduce((acc, c) => acc + c.steps.length, 0),
    stepsPassed: stepsPassDirect + stepsPassAdapted + stepsPassPrivateInit,
    stepsPassDirect,
    stepsPassAdapted,
    stepsPassPrivateInit,
    stepsKnownVectorMismatch,
    uncatalogedFail,
    cases: caseResults,
  };
}

function evaluateAll(options = {}) {
  const mode = options.mode || 'manifest';
  const filterBlock = options.block || null;
  const manifestPath = options.manifestPath || DEFAULT_MANIFEST_PATH;
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''))
    : { tolerances: { realAbs: 1e-5 }, blockPolicies: {}, deviations: [] };

  const files = fs.readdirSync(VECTORS_DIR).filter((f) => f.endsWith('.json')).sort();
  const blockReports = [];
  for (const f of files) {
    const vecJson = JSON.parse(fs.readFileSync(path.join(VECTORS_DIR, f), 'utf8').replace(/^\uFEFF/, ''));
    if (filterBlock && vecJson.blockName !== filterBlock && vecJson.blockId !== filterBlock) continue;
    if (!BLOCK_MODELS[vecJson.blockName]) {
      throw new Error(`未实现块模型: ${vecJson.blockName}`);
    }
    blockReports.push(runBlockEval(vecJson, manifest, mode));
  }

  blockReports.sort((a, b) => a.blockId.localeCompare(b.blockId));

  const sumField = (key) => blockReports.reduce((s, b) => s + b[key], 0);
  const totals = {
    mode,
    blocks: blockReports.length,
    casesTotal: sumField('casesTotal'),
    casesPassed: sumField('casesPassed'),
    stepsTotal: sumField('stepsTotal'),
    stepsPassed: sumField('stepsPassed'),
    stepsPassDirect: sumField('stepsPassDirect'),
    stepsPassAdapted: sumField('stepsPassAdapted'),
    stepsPassPrivateInit: sumField('stepsPassPrivateInit'),
    stepsKnownVectorMismatch: sumField('stepsKnownVectorMismatch'),
    uncatalogedFail: sumField('uncatalogedFail'),
  };

  return { totals, blocks: blockReports };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let mode = 'manifest';
  let block = null;
  let asJson = false;
  let verbose = false;
  let manifestPath = DEFAULT_MANIFEST_PATH;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--mode' && args[i + 1]) mode = args[++i];
    else if (args[i] === '--block' && args[i + 1]) block = args[++i];
    else if (args[i] === '--json') asJson = true;
    else if (args[i] === '--verbose') verbose = true;
    else if (args[i] === '--manifest' && args[i + 1]) manifestPath = args[++i];
  }
  const result = evaluateAll({ mode, block, manifestPath });
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const t = result.totals;
    console.log(
      `[offline-eval mode=${t.mode}] blocks=${t.blocks}, cases=${t.casesPassed}/${t.casesTotal}, steps=${t.stepsTotal} (direct=${t.stepsPassDirect}, adapted=${t.stepsPassAdapted}, privInit=${t.stepsPassPrivateInit}, knownVecMismatch=${t.stepsKnownVectorMismatch}, uncatalogedFail=${t.uncatalogedFail})`
    );
    for (const b of result.blocks) {
      console.log(
        `  ${b.blockId} ${b.blockName.padEnd(26)} cases=${b.casesPassed}/${b.casesTotal} steps=${b.stepsTotal} (direct=${b.stepsPassDirect}, adapted=${b.stepsPassAdapted}, privInit=${b.stepsPassPrivateInit}, knownVec=${b.stepsKnownVectorMismatch}, fail=${b.uncatalogedFail})`
      );
      for (const c of b.cases) {
        const show = c.steps.filter((s) => s.status === 'FAIL' || (verbose && s.status !== 'PASS'));
        if (show.length === 0) continue;
        for (const s of show) {
          console.log(`    [${s.status}] ${c.caseId} step ${s.step}${s.deviationId ? ` (${s.deviationId})` : ''}`);
          for (const m of s.mismatches) {
            console.log(
              `      ${m.field}: expected=${JSON.stringify(m.expected)} actual=${JSON.stringify(m.actual)}`
            );
          }
        }
      }
    }
  }
  process.exit(result.totals.uncatalogedFail > 0 ? 1 : 0);
}

module.exports = { BLOCK_MODELS, INTRINSIC_TIMING_MODE, evaluateAll };
