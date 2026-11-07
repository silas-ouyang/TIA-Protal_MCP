# LGF_SmoothByPolynomFC (FC / V3.0.1)

- **分类**：Measurement operations (§4.16.5)
- **中文功能**：采用五点三次多项式最小二乘拟合算法对数组采样数据降噪滤波
- **英文简述**：This function calculates the smoothed values by polynomial acyclically. For smoothing, a 3rd degree polynomial is placed through five value points. The error squares of the distances between polynomial and real value are minimized. The s...

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

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#0000` | `STATUS_FINISHED_NO_ERROR` | Status: Execution finished without errors |
| `16#8400` | `ERR_ARRAYS_DIFFERENT` | Error: The Array sizes are not equal.<br>The arrays `values` and `smoothedValues` must have the same size. |
| `16#8401` | `ERR_NOT_ENOUGH_VALUES` | Error: Not enough values.<br>The block requires five (5) values to calculate a smoothed value. Increase the size of the array<br>at the input parameter `values`. Adapt the array on the output parameter `smoothedValues` to<br>the new size. |

## 功能说明与使用要点
- The 3rd degree compensation polynomial is calculated as follows:
- 𝑁−4 smoothed measured values can thus be calculated from the N measured values. The output array contains the value 0 in the index (0.1, N-1, N).
- These “missing” values are calculated with the following formalisms:
