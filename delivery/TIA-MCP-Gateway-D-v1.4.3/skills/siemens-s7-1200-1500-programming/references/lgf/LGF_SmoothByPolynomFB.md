# LGF_SmoothByPolynomFB (FB / V3.0.1)

- **分类**：Measurement operations (§4.16.15)
- **中文功能**：周期触发五点三次多项式在线动态平滑滤波（实时拟合滤波降噪）
- **英文简述**：This function calculates the smoothed values by polynomial cyclically. For smoothing, a 3rd degree polynomial is placed through five value points. The error squares of the distances between polynomial and real value are minimized. The sm...

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `enable` | `Bool` | `FALSE` | Activates the block. As long as enable is `TRUE`, the block can accept values on the parameter `value`. |
| `insert` | `Bool` | `FALSE` | Accepts the value at the input `value` at positive edge and outputs a `smoothedValue` if five values have been read in. |
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
- The 3rd degree compensation polynomial is calculated as follows:
- 𝑁−4 smoothed measured values can thus be calculated from the N measured values. The output array contains the value 0 in the index (0.1, N-1, N).
- These “missing” values are calculated with the following formalisms:
