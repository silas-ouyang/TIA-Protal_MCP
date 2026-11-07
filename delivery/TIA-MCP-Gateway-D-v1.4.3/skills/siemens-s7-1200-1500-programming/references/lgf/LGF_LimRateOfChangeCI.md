# LGF_LimRateOfChangeCI (FB / V3.0.1)

- **分类**：Technology operations (§4.15.2)
- **中文功能**：循环中断中限制变量变化速率，将阶跃输入平滑过渡为斜坡输出
- **英文简述**：This function limits the rate of change of an input variable. A jump function becomes a ramp function.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `value` | `LReal` | `0.0` | Signal to be processed and limited in its rate of change |
| `setChangeRate` | `LReal` | `0.0` | Rate of change of ramp function (1/second) |
| `defaultOutValue` | `LReal` | `0.0` | Value for pre-assignment of the output variable (`outputValue` = `defaultOutValue`) |
| `enDefaultOut Value` | `Bool` | `FALSE` | Assign default output value (`outputValue` = `defaultOutValue`) |
| `callOB` | `OB_CYCLIC` | `---` | Calling wake-alarm interrupt OB (cyclic interrupt OB) |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `delayedValue` | `LReal` | Output variable |
| `error` | `Bool` | FALSE: No error TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |
| `subfunction Status` | `Word` | Status or return value of called FB's, FC's and system blocks |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#0000` | `STATUS_FINISHED_NO_ERROR` | Status: Execution finished without errors |
| `16#8200` | `ERR_NEG_RATE_LIM` | Error: Negative rate of change.<br>The parameter for the change rate must not be negative. |
| `16#8600` | `ERR_QRY_CINT` | Error in `QRY_CINT` command - check `subFunctionStatus` code |

## 功能说明与使用要点
- The status of called commands is output in `subFunctionStatus` . In this case, the output value in Note `status` indicates which command caused the error. In this case, refer to the TIA Portal Onli...
- The ramp is a limit line and refers to a rate of change per second; if, for example, `setChangeRate = 10.0` is parameterized at a sampling time of 1s/100ms/10ms for every block call, then if va...
- The limitation of the rate of change applies to both positive and negative values for the rise and fall.
- The output `delayedValue` can be preset or initialized.
- The time interval of the calling cyclic interrupt OB is determined by interconnecting the calling cyclic interrupt OB at the input parameter `callOB` .
- The Figure below shows the ramp function sequence:
