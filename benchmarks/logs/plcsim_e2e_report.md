# PLCSIM Advanced V7.0 E2E Verification Report

- **Timestamp**: 2026-11-13T02:57:28.005Z
- **PLCSIM Instance**: `TIA_E2E_SIM_22980` (mode=`TCPIPSingleAdapter`, ip=`192.168.250.10`)
- **CPU**: `6ES7 513-1AM03-0AB0` (V3.1)
- **Summary**: **19/19 blocks passed** (0 failed) | 138/138 test cases passed | Elapsed: 1572.4s

| ID | Block | Type | Timing | Compile | DB# | Cases (Pass/Exec/Plan) | Steps | Channel | Status | Time (s) |
|---|---|---|---|---|---|---|---|---|---|---|
| A01 | FC_AnalogScaleAlarm | FC (scl) | combinational | 0E/0W | 1 | 9/9/9 | 14 | sharp7-s7-102 | PASS | 80.0 |
| A02 | FB_LowPassFilter | FB (scl) | combinational | 0E/0W | 1 | 9/9/9 | 13 | sharp7-s7-102 | PASS | 29.9 |
| A03 | FB_CylinderCtrl | FB (scl) | ton_time | 0E/0W | 1 | 9/9/9 | 13 | sharp7-s7-102 | PASS | 35.9 |
| A04 | FB_MotorRevCtrl | FB (scl) | ton_time | 0E/0W | 1 | 9/9/9 | 13 | sharp7-s7-102 | PASS | 33.1 |
| A05 | FB_RingFifo | FB (scl) | combinational | 0E/0W | 1 | 7/7/7 | 12 | sharp7-s7-102 | PASS | 29.2 |
| A06 | FC_ButtonDebounceToggle | FC (scl) | scan_cycle_param | 0E/0W | 1 | 9/9/9 | 14 | sharp7-s7-102 | PASS | 28.4 |
| A07 | FB_ModbusPoller | FB (scl) | ton_time | 0E/0W | 1 | 7/7/7 | 10 | sharp7-s7-102 | PASS | 26.4 |
| A08 | FB_DualEStopInterlock | FB (scl) | ton_time | 0E/0W | 1 | 8/8/8 | 12 | sharp7-s7-102 | PASS | 99.5 |
| B01 | FB_FIO_SortingByHeight | FB (scl) | ton_time | 0E/0W | 1 | 7/7/7 | 16 | sharp7-s7-102 | PASS | 42.3 |
| B02 | FB_FIO_PickAndPlace | FB (scl) | ton_time | 0E/0W | 1 | 6/6/6 | 18 | sharp7-s7-102 | PASS | 46.1 |
| B03 | FB_FIO_BufferConveyor | FB (scl) | ton_time | 0E/0W | 1 | 7/7/7 | 14 | sharp7-s7-102 | PASS | 35.7 |
| B04 | FB_FIO_Turntable | FB (scl) | ton_time | 0E/0W | 1 | 7/7/7 | 17 | sharp7-s7-102 | PASS | 40.4 |
| B05 | FB_FIO_AutomatedWarehouse | FB (scl) | ton_time | 0E/0W | 1 | 7/7/7 | 17 | sharp7-s7-102 | PASS | 127.9 |
| B06 | FB_FIO_TankLevelPID | FB (scl) | dt_sec_param | 0E/0W | 1 | 9/9/9 | 14 | sharp7-s7-102 | PASS | 23.4 |
| B07 | FB_FIO_Assembler | FB (scl) | ton_time | 0E/0W | 1 | 7/7/7 | 19 | sharp7-s7-102 | PASS | 37.9 |
| LAD04 | FB_Conveyor_BatchCounter_LAD | FB (xml) | scan_cycles | 0E/0W | 1 | 5/5/5 | 19 | sharp7-s7-102 | PASS | 18.0 |
| LAD01 | FB_Motor_DirectStart_LAD | FB (xml) | combinational | 0E/0W | 1 | 5/5/5 | 10 | sharp7-s7-102 | PASS | 13.4 |
| LAD02 | FB_Motor_SealIn_FaultLatch_LAD | FB (xml) | combinational | 0E/0W | 1 | 6/6/6 | 18 | sharp7-s7-102 | PASS | 13.8 |
| LAD03 | FB_Valve_TonDelay_Pulse_LAD | FB (xml) | ton_time | 0E/0W | 1 | 5/5/5 | 12 | sharp7-s7-102 | PASS | 15.3 |
