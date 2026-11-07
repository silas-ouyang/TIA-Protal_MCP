# LGF_IsValueInRange (FC / V3.0.1)

- **分类**：Math operations (§4.6.6)
- **中文功能**：根据设定中心值与绝对偏差范围判定输入数值是否在合格区间内
- **英文简述**：The function checks whether a value is within a defined value range. The value range is defined with a set point and a range around this set point. The function calculates the low limit and high limit of the value range.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `value` | `LReal` | `-` | Value to be checked to determine whether it is within the defined |
| `v` | ` | `- |  |
| `setpoint` | `LReal` | `-` | Set point |
| `range` | `LReal` | `-` | Area where the setpoint is in range |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `Bool` | Return: TRUE if the “value” is in the value range (range of the set point) |
| `overHighLimit` | `Bool` | TRUE if the “value” is greater than the upper limit value |
| `belowLowLimit` | `Bool` | TRUE, if the “value” is less than the lower limit value |
| `error` | `Bool` | FALSE: No error TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#0000` | `STATUS_NO_ERROR` | Status: no error occurred |
| `16#8401` | `ERR_RANGE_LIMIT_VALUES` | Error: During calculating of the limit values |

## 功能说明与使用要点
- The `setpoint` and `range` variables define a range of values.
- The function checks whether the `value` is below, in or above the value range. The outputs `belowLowLimit` , `Ret_Val` ,` or `overHighLimit` show where the `value is located.
- Figure: Principle of operation
