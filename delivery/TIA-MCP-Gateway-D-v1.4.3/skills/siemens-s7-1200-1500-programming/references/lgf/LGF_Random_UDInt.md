# LGF_Random_UDInt (FC / V3.0.1)

- **分类**：Math operations (§4.6.11)
- **中文功能**：每次调用生成一个均匀分布的 32 位 UDInt 无符号伪随机整数
- **英文简述**：This function generates a random value with each call. The random number has the data type UDInt.

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `UDInt` | Random number in the UDInt range |
| `error` | `Bool` | FALSE: No error TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |
| `subfunction Status` | `Word` | Status or return value of called FB's, FC's and system blocks |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#0000` | `STATUS_FINISHED_NO_ERROR` | Execution finished without errors |
| `16#8600` | `ERR_RD_SYS_T` | Error in `RD_SYS_T` command - check `subFunctionStatus` code |

## 功能说明与使用要点
- The status of called commands is output in `subFunctionStatus` . In this case, the output value in Note `status` indicates which command caused the error. In this case, refer to the TIA Portal Onli...
- The function generates random values in the range:
- **0 ≤𝑅𝑒𝑡𝑢𝑟𝑛𝑉𝑎𝑙≤4294967295.**
- The random value is formed from the nanoseconds of the current system time of the CPU. The byte order of this value is inverted and then converted to UDInt.
