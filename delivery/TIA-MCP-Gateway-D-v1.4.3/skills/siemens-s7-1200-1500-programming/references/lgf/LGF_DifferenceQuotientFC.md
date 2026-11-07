# LGF_DifferenceQuotientFC (FC / V3.0.1)

- **分类**：Measurement operations (§4.16.2)
- **中文功能**：基于拟合多项式对等距采样数组进行非周期差商求导（速度/加速度）
- **英文简述**：This function numerically differentiates a signal sampled equidistantly in time. For example, the velocity can be calculated from a measured locus curve, or the acceleration can be calculated from the measured velocity. In order to minim...

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `deltaT` | `LReal` | `-` | Equidistant distance between two measured values. (e.g. 1s) |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `Void` | Void - Function has no return value |
| `error` | `Bool` | FALSE: No error TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |

## 输入/输出参数 (In/Out)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `values` | `Array[*] of LReal` | Values that will be included in the differentiation. |
| `derivatedValues` | `Array[*] of LReal` | The differentiated value range. |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#0000` | `STATUS_FINISHED_NO_ERROR` | Status: Execution finished without errors |
| `16#8200` | `ERR_DELTA_T` |  |

## 功能说明与使用要点
- To calculate the difference quotient of a scattering signal, a third-degree compensation polynomial is first placed through the measured values. This polynomial is then differentiated. With this me...
- The difference quotient is calculated with the following formula:
- 𝑑𝑒𝑙𝑡𝑎𝑇: equidistant distance between two measured values (e.g. 1s).
- The function (FC) can calculate 𝑁−4 differentiated and smoothed measured values from N measured values. The output array would be assigned with 0 in the index (0,1,N-1,N). However, the following f...
- 𝑦<sup>′</sup> (𝑛−2) =<sup>−125(𝑦(𝑛−2) + 136𝑦(𝑛−1) + 48𝑦(𝑛) −88𝑦(𝑛+ 1) + 29𝑦(𝑛+ 2)</sup> 84 ⋅𝑑𝑒𝑙𝑡𝑎𝑇 𝑦<sup>′</sup> (𝑛−1) =<sup>−38(𝑦(𝑛−2) −2𝑦(𝑛−1) + 24𝑦(𝑛) + 26𝑦(𝑛+ 1) −10...
