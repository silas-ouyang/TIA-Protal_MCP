# LGF_RandomRange_DInt (FC / V3.0.1)

- **分类**：Math operations (§4.6.12)
- **中文功能**：在指定的最小值与最大值区间范围内生成一个 DInt 伪随机整数
- **英文简述**：This function generates a random value in defined limits with each call. The random number has the data type DInt in the specified range.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `minValue` | `DInt` | `-` | Minimum value of the range of the random number - lower border |
| `maxValue` | `DInt` | `-` | Maximum value of the range of the random number - upper border |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `DInt` | Random Real number in the predefined range |
| `error` | `Bool` | FALSE: No error TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |
| `subfunction Status` | `Word` | Status or return value of called FB's, FC's and system blocks |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#0000` | `STATUS_FINISHED_NO_ERROR` | Execution finished without errors |
| `16#8200` | `ERR_MAX_LESS_MIN` | Error: The ranges specified are wrong:<br>`minValue` is greater than `maxValue` |
| `16#8600` | `ERR_RD_SYS_T` | Error in `RD_SYS_T` command - check `subFunctionStatus` code |

## 功能说明与使用要点
- The status of called commands is output in `subFunctionStatus` . In this case, the output value in Note `status` indicates which command caused the error. In this case, refer to the TIA Portal Onli...
- The block generates random values that are between the specified `minValue` and the `maxValue` . This random value is output via the `Ret_Val` .
- The random value is formed from the nanoseconds of the current system time of the CPU. The byte order of this value is inverted and then converted to a DInt.
