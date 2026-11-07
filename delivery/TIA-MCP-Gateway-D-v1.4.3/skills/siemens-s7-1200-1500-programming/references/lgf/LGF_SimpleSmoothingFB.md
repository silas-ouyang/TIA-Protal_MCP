# LGF_SimpleSmoothingFB (FB / V3.0.1)

- **分类**：Measurement operations (§4.16.14)
- **中文功能**：周期触发三点线性移动平均平滑滤波块（滤除瞬态高频尖峰脉冲）
- **英文简述**：The function calculates the linear mean value cyclically. The simplest form of smoothing a sequence of measured values is to calculate the linear mean value by three points. The function reads-in a value with each positive edge on the ...

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `enable` | `Bool` | `FALSE` | Activates the block. As long as enable is `TRUE`, the |
| `b` | ` | `- |  |
| `insert` | `Bool` | `FALSE` | Accepts the value at the input `value` at positive edge and outputs a `smoothedValue` if three values have been read in. |
| `value` | `LReal` | `0.0` | Value that is to be included in the smoothing. |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `smoothedValue` | `LReal` | The smoothed value. |
| `error` | `Bool` | FALSE: No error TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |

## 功能说明与使用要点
- The function calculates the smoothed values using the following formula:
- The calculated value is output or the calculated values are output at output `smoothedValue` .
- Based on this formula, the function cannot calculate values for the elements 0 and N.
