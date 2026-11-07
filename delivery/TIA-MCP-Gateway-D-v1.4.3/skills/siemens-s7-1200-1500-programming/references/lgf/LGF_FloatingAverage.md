# LGF_FloatingAverage (FB / V3.0.2)

- **分类**：Measurement operations (§4.16.10)
- **中文功能**：工业模拟量动态滑动平均滤波块（支持循环/触发采集与滑动窗口）
- **英文简述**：This function calculates a moving arithmetic mean value from REAL values. This method can be used to smooth data series. The values can be read in cyclically or triggered.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `cyclicExecution` | `Bool` | `false` | TRUE: cyclic operation, trigger not in use |
| `trigger` | `Bool` | `FALSE` | Read in `value` with every pulse at input `trigger` |
| `value` | `LReal` | `0.0` | Value/s from which the moving average is to be determined. |
| `windowSize` | `Int` | `100` | Window length for sliding averaging in the range from 1..100. The standard value is 100. |
| `reset` | `Bool` | `FALSE` | TRUE: The block is reset and the calculation starts again. |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `average` | `LReal` | Moving / Floating average |
| `windowSize Reached` | `Bool` | FALSE: Maximum window width not yet reached, TRUE: Maximum window width reached |
| `error` | `Bool` | FALSE: No error TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#0000` | `STATUS_FINISHED_NO_ERROR` | Status: Execution finished without errors |
| `16#8200` | `ERR_WRONG_WINDOW_SIZE` | Error: Incorrect window size/width set.<br>Set a value between 1 and 100. |

## 功能说明与使用要点
- The block `LGF_FloatingAverage` does not query the data type for the input parameter `value` . For data Note types other than REAL, either an implicit conversion is performed automatically or an er...
- The block calculates the (moving) mean value based on the set window width. The window width indicates the maximum number of values read in last. After the maximum number of values has been read, t...
- Two options are available for reading the values. With the input `cyclicExecution` ,` the values are read and calculated cyclically. With the `trigger input, the values are read in and calculat...
