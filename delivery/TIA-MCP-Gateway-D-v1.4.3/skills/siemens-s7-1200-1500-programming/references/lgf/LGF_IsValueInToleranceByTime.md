# LGF_IsValueInToleranceByTime (FB / V1.0.0)

- **分类**：Math operations (§4.6.22)
- **中文功能**：过程值超公差带时间监控器（带设定值变更屏蔽与超差延时报警）
- **英文简述**：Checks if a given value is within a specified tolerance in percent of a given set point. The block has a configurable timing for set point change hiding, lower limit and as well for upper limit violation hiding.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `value` | `Real` | `0.0` | Value to check if in range of setpoint |
| `setpoint` | `Real` | `0.0` | Setpoint |
| `lowerMinimum` | `Real` | `0.0` | [% or ABS] Lower limit/tolerance of the setpoint in percent or absolut |
| `upperMaximum` | `Real` | `0.0` | [% or ABS] Upper limit/tolerance of the setpoint in percent or absolut |
| `reset` | `Bool` | `FALSE` | Reset Block |
| `configuration` | `LGF_typeIsValueI n ToleranceByTime Configuration` | `---` | Module related configuration parameters |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `overHighLimit` | `Bool` | TRUE: if value is above high limit |
| `belowLowLimit` | `Bool` | TRUE: if value is below low limit |
| `inLimits` | `Bool` | TRUE: if value is in between the limits |
| `setpointChange` | `Bool` | TRUE: when a setpoint change has been detected |
| `error` | `Bool` | Error occured |
| `status` | `Word` | Status of the function |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |

## 功能说明与使用要点
- The `setpoint` ,` `lowerMinimum` and `upperMaximum variables define a value range.
- The function checks whether the `value` is below, in or above the value range. The outputs `belowLowLimit` , `inLimits` ,` or `overHighLimit` show where the `value is located.
- By the configuration it is possible to define whether the borders are given as absolute values or in percentage from set point.
- The timing could be adjusted for set point changes and as well for hiding the violating of the lower or upper limit in case of peaks.
- Figure: Principle of operation
