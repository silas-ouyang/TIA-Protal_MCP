# LGF_SimpleSmoothingFC (FC / V3.0.1)

- **分类**：Measurement operations (§4.16.4)
- **中文功能**：非周期调用三点滑动均值算法对给定数组离散采样数据整体平滑
- **英文简述**：The function calculates the linear mean value acyclically. The simplest form of smoothing a sequence of measured values is to calculate the linear mean value by three points. The function reads an array that is smoothed. 𝑁−2 smoothed me...

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `Void` | Void - Function has no return value |
| `error` | `Bool` | FALSE: No error TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |

## 输入/输出参数 (In/Out)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `values` | `Array[*] of LReal` | Values that are to be included in the smoothing. |
| `smoothedValues` | `Array[*] of LReal` | The smoothed values. |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |

## 功能说明与使用要点
- The function calculates the smoothed values using the following formula:
- The calculated value is output or the calculated values are output at output `smoothedValue` .
- Based on this formula, the function cannot calculate values for the elements 0 and N.
