# LGF_DifferenceQuotientFB (FB / V3.0.1)

- **分类**：Measurement operations (§4.16.9)
- **中文功能**：周期触发采样并基于补偿多项式在线实时计算一阶数值导数（差商）
- **英文简述**：This function numerically differentiates a signal sampled equidistantly in time. For example, the velocity can be calculated from a measured locus curve, or the acceleration can be calculated from the measured velocity. In order to minim...

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `enable` | `Bool` | `FALSE` | Activates the block. As long as enable is `TRUE`, the block can accept values on the parameter `value`. |
| `insert` | `Bool` | `FALSE` | Accepts the value at the input `value` at positive edge and outputs a `derivatedValue` if five values have been read in. |
| `value` | `LReal` | `0.0` | Value that must be included in the differentiation. |
| `deltaT` | `LReal` | `0.0` | Equidistant distance between two measured values. (e.g. 1s) |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `derivatedValue` | `LReal` | The differentiated value. |
| `error` | `Bool` | FALSE: No error TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#7000` | `STATUS_NO_CALL` | Status: No call of FB.<br>The block waits for activation through the parameter `enable`. |
| `16#7001` | `STATUS_FIRST_CALL` | Status: First call of FB after enabling |

## 功能说明与使用要点
- To calculate the difference quotient of a scattering signal, a third-degree compensation polynomial is first placed through the measured values. This polynomial is then differentiated. With this me...
- The difference quotient is calculated with the following formula:
- 𝑑𝑒𝑙𝑡𝑎𝑇: equidistant distance between two measured values (e.g. 1s).
- The function (FC) can calculate 𝑁−4 differentiated and smoothed measured values from N measured values. The output array would be assigned with 0 in the index (0,1,N-1,N). However, the following f...
