# LGF_Integration (FB / V3.1.0)

- **分类**：Math operations (§4.6.21)
- **中文功能**：连续模拟量时间梯形数值积分器（以秒为基准，用于流量/位移累积）
- **英文简述**：The function approximately calculates the area under a function curve (the integral). The function curve is transferred as an analog `value` (LReal) which varies over time. The integral value is output on `integral` . The implementat...

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `enable` | `Bool` | `FALSE` | Enables integral calculation If this input is set to the value `FALSE`, the integral calculation is stopped and the `integral` output shows the last calculated value. |
| `value` | `LReal` | `0.0` | Analog value of the continuous function curve, based on [s], (e.g. [volume flow/s]) |
| `reset` | `Bool` | `FALSE` | Sets the output “integral” to “0.0”. |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `integral` | `LReal` | Integral value |
| `error` | `Bool` | FALSE: No error TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |
| `subfunction Status` | `Word` | Status or return value of called FB's, FC's and system blocks |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#0000` | `STATUS_EXECUTION_FINISHED_NO_ERROR` | Status: No error in the function during execution |
| `16#8600` | `ERR_READ_SYS_TIME` | Error: System time FC `RD_SYS_T` returned an error when excuting - check<br>`subFunctionStatus` code |

## 功能说明与使用要点
- The status of called commands is output in `subFunctionStatus` . In this case, the output value in Note `status` indicates which command caused the error. In this case, refer to the TIA Portal Onli...
- The integral calculation includes the summation of those trapezoidal areas that span between the last two function values on the `value` input and the time. The elapsed time is calculated via the...
- The calculation takes [s] as time base. So the analoge value hase to use the same time base, e.g. speed Note [m/s].
- Figure: Principle of operation
- Start the integral calculation for the inputvalue at the parameter `value` :
- - Set the parameter `enable` to the value `TRUE`
- - Set the parameter `reset` to the value `FALSE`
- If the parameter `enable` is set to the value `FALSE` ,` the integral calculation is stopped and the output `integral outputs the last calculated value.
- If the parameter `reset` is set to the value `TRUE` ,` the output `integral` is reset to `0.0
