# LGF_IsValueInLimits (FC / V3.0.1)

- **分类**：Math operations (§4.6.5)
- **中文功能**：判定输入数值是否落在指定的上下限绝对区间（low~high）以内
- **英文简述**：The function checks whether a value is within a defined value range. The value range is defined with a lower and an upper limit.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `value` | `LReal` | `-` | Value to be checked to determine whether it is within the defined |
| `v` | ` | `- |  |
| `lowLimit` | `LReal` | `-` | Low limit where the value is checked against to begreater |
| `highLimit` | `LReal` | `-` | High limit where the value is checked against to to be less |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `Bool` | Return: TRUE if the “value” is in the value range (range of the set point) |
| `overHighLimit` | `Bool` | TRUE if the “value” isgreater than the upper limit value |
| `belowLowLimit` | `Bool` | TRUE, if the “value” is less than the lower limit value |
| `error` | `Bool` | FALSE: No error TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#0000` | `STATUS_NO_ERROR` |  |
| `16#8401` | `ERR_RANGE_HIGH_BELOW_LOW_LIMIT` | Error:High limit less then low limit |

## 功能说明与使用要点
- The variables `lowLimit` and `highLimit` define a value range.
- The function checks whether the `value` is below, in or above the value range. The outputs `belowLowLimit` , `Ret_Val` ,` or `overHighLimit` show where the `value is located.
- Figure: Principle of operation
