# LGF_MeasureCpuLoad (FB / V1.1.1)

- **分类**：System operations (§4.17.5)
- **中文功能**：§4.17.5
- **英文简述**：Measurement and calculation of PLC CPU load for different OB types

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `enable` | `Bool` | `FALSE` | TRUE: Enable functionality of FB |
| `reset` | `Bool` | `FALSE` | Rising edge: Reset all internal values and as well PLC CPU timing statistic |
| `loadCascade` | `Real` | `0.0` | Percentage Load Value from another `LGF_MeasureCpuLoad` [%] (Connect `cpuLoad` from predecessor instance call) |
| `configuration` | `LGF_typeMeasure CpuLoad_ Configuration` | `---` | This UDT belongs to the Module `LGF_MeasureCpuLoad` and lists all possible parameter to configure its behavior. |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `valid` | `Bool` | TRUE: Valid set of output values available at the FB |
| `busy` | `Bool` | TRUE: FB is not finished, and new output values can be expected |
| `error` | `Bool` | TRUE: An error occurred duringthe execution of the FB |
| `status` | `Word` | 16#0000 - 16#7FFF: Status of the FB, 16#8000 - 16#FFFF: Error identification |
| `averagingActive` | `Bool` | TRUE: Averaging of actual values active |
| `loadCascade Active` | `Bool` | TRUE: Load calculation cascade active |
| `cycleTimeMin` | `LTime` | Minimum cycle time [ms] |
| `cycleTimeActual` | `LTime` | Actual cycle time [ms] |
| `cycleTimeMax` | `LTime` | Maximum cycle time [ms] |
| `cycleTimeMax Configured` | `LTime` | Configured maximum cycle time [ms] (in plc hardware configuration) |
| `runtime` | `LReal` | Actual cycle time incl. interrupts [ms] |
| `cpuLoad` | `Real` | Actual PLC CPU load [%] |
| `comLoad` | `Real` | Actual communication load [%] |
| `comLoad Configured` | `Real` | Configured communication load [%] |
| `limitWarning` | `Bool` | Load more than configured threshold value 'configuration.limitWarning' |
| `limitAlarm` | `Bool` | Load more than configured threshold value 'configuration.limitAlarm' |
| `resultsCyclic` | `Array[0..#LAST_ CYCLIC_BLOCK_ INDEX] of LGF _typeMeasureCpu Load_ResultBlock` | Results of Cyclic OB read outs |
| `results` | `Array[0..#LAST_ BLOCK_INDEX] of LGF_typeMeasure CpuLoad_Result Block` | Results of NON-Cyclic OB read outs |
| `diagnostics` | `LGF_type Diagnostics` | Diagnostic structure to store and transfer diagnostic information from blocks through the interface. |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#7000` | `STATUS_NO_CALL` | No job being currently processed |
| `16#7001` | `STATUS_FIRST_CALL` | First call after incoming new job (rising edge 'enable') |
| `16#7002` | `STATUS_SUBSEQUENT_CALL` | Subsequent call during active processing without further details |
| `16#8600` | `ERR_UNDEFINED_STATE` | Error: Due to an undefined state in state machine |
| `16#8601` | `ERROR_RTINFO_CONFIGURED_MAX_CYCLETIME` | Error: RT INFO read configured MAX cycle time Information |
| `16#8602` | `ERROR_RTINFO_CONFIGURED_COM_LOAD` | Error: RT INFO read configured COM Load Information |
| `16#8610` | `ERROR_RTINFO_ACTUAL_CYCLETIME` | Error: RT INFO read actual cycle time Information |
| `16#8611` | `ERROR_RTINFO_ACTUAL_MIN_CYCLETIME` | Error: RT INFO read MIN cycle time Information |
| `16#8612` | `ERROR_RTINFO_ACTUAL_MAX_CYCLETIME` | Error: RT INFO read MAX cycle time Information |
| `16#8620` | `ERROR_RTINFO_ACTUAL_COM_LOAD` | Error: RT INFO read actual COM Load Information |
| `16#8630` | `ERROR_RTINFO_RESET_STATISTICS` | Error: RT INFO reset statistic information |
| `16#9000` | `ERROR_RTINFO_RUNTIME_OB_CYCLIC` | Error: Read RT INFO cycle time Information OB + index of OB in array |
| `16#9100` | `ERROR_RTINFO_RUNTIME_OB` | Error: Read RT INFO cycle time Information OB + index of OB in array |

## 功能说明与使用要点
- This function can be used to read out the various runtimes of organizational blocks (OB) and calculate the PLC CPU load based on the results.
- The OBs to be considered are specified and activated in the configuration; please note that cyclical and acyclically OBs must be configured in separate structures.
- It is also possible to
- - Average/smooth the measured values
- - Specify limit values for a warning and an alarm
- - Specify the communication load as a simulated value
- - Automatically increment the OB numbers for CFC
