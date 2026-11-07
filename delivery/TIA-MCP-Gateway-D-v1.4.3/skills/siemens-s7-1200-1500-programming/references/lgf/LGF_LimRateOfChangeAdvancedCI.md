# LGF_LimRateOfChangeAdvancedCI (FB / V3.0.1)

- **分类**：Technology operations (§4.15.1)
- **中文功能**：高级变化率限制器（支持多工况模式、加速度上下限与阶跃平滑）
- **英文简述**：The function `LGF_LimRateOfChangeAdvanced` limits the rate of change of an input variable. Jump functions become ramp functions. In addition, the block has various operating modes.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `autoValue` | `LReal` | `0.0` | Signal to be processed and limited in its rate of change |
| `manualValue` | `LReal` | `0.0` | Manually controlled output value (`outputValue` = `manualValue`) |
| `setPosUpRateLim` | `LReal` | `0.0` | Rate of change per second for the rising ramp in the positive value range (1/second) |
| `setPosDownRate Lim` | `LReal` | `0.0` | Rate of change per second for the falling ramp in the positive value range (1/second) |
| `setNegUpRateLim` | `LReal` | `0.0` | Rate of change per second for the rising ramp in the negative value range (1/second) |
| `setNegDownRate Lim` | `LReal` | `0.0` | Rate of change per second for the falling ramp in the negative value range (1/second) |
| `setHighLim` | `LReal` | `0.0` | High limit value |
| `setLowLim` | `LReal` | `0.0` | Low limit value |
| `defaultOutValue` | `LReal` | `0.0` | Value for pre-assignment of the output variable (`outputValue` = `defaultOutValue`) |
| `enDefaultOut Value` | `Bool` | `FALSE` | Assign default output value (`outputValue` = `defaultOutValue`) |
| `track` | `Bool` | `FALSE` | Follow / tracking of Input variable (`outputValue` = `autoValue`) |
| `manOp` | `Bool` | `FALSE` | Manual mode on (`outputValue` = `manualValue`) |
| `reset` | `Bool` | `FALSE` | Complete restart of function |
| `callOB` | `OB_CYCLIC` | `---` | Calling wake-alarm interrupt OB (cyclic interrupt OB) |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `outputValue` | `LReal` | Output variable |
| `posUpRateLim` | `Bool` | Rise limitation in positive range tripped |
| `posDownRateLim` | `Bool` | Down rate limit in positive range reached |
| `negUpRateLim` | `Bool` | Up rate limit in negative range reached |
| `negDownRateLim` | `Bool` | Down rate limit in negative range reached |
| `highLim` | `Bool` | High limit reached |
| `lowLim` | `Bool` | Low limit reached |
| `error` | `Bool` | FALSE: No error TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |
| `subfunction Status` | `Word` | Status or return value of called FB's, FC's and system blocks |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#0000` | `STATUS_FINISHED_NO_ERROR` | Status: Execution finished without errors |
| `16#8200` | `ERR_NEG_RATE_LIM` | Error: High limit lower than low limit.<br>The high limit `setHighLim` must begreater than the low limit `setLowLim`. |
| `16#8202` | `ERR_NEG_RATE_OF_CHANGE` | Error: Negative rate of change.<br>The parameter for the change rate must not be negative. |
| `16#8600` | `ERR_QRY_CINT` | Error in `QRY_CINT` command - check `subFunctionStatus` code |

## 功能说明与使用要点
- The status of called commands is output in `subFunctionStatus` . In this case, the output value in Note `status` indicates which command caused the error. In this case, refer to the TIA Portal Onli...
- For the positive/negative value range, two rates of change in each case for the ramp (rising and falling values) can be parameterized. The following operating modes can be selected via control inputs:
- - Restart
- - Pre-assigning an output
- - Normal operation (automatic)
- - Switch through controlled variable (manual)
- - Tracking
- The output variable can be limited through two parametrize able limits. An active limitation of the rate of change of a ramp, as well as an active limitation of the output variable are reported via...
- The time interval of the calling cyclic interrupt OB is determined by interconnecting the calling cyclic interrupt OB at the input parameter `callOB` .
