# LGF_UnixTimeToDTL (FC / V3.0.1)

- **分类**：Converter operations (§4.9.24)
- **中文功能**：将 32 位 Unix 时间戳整数秒还原转换为 UTC 标准 DTL 日期时间
- **英文简述**：This function converts the Unix time of data type DInt to a date and time of data type DTL. The timestamp is calculated in UTC. This means that the time zone is not considered. Only times after 01/01/1990 are permitted.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `timeUnix` | `DInt` | `-` | UNIX time to convert |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `DTL` | Converted time (Date and time). In case of Error: 0 (error = true) |
| `error` | `Bool` | FALSE: No error TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#0000` | `STATUS_NO_ERRROR` | Status: Execution finished without errors |
| `16#6001` | `WARN_CONVERSION_LIMIT` | Warning: UNIX time(timeUnix)is exactlyat the lower limit of 01.01.1990. |
| `16#8000` | `ERR_TIME_BEFORE_1990` | Error: UNIX time (timeUnix) is before 01/01/1990.<br>The function does not support this conversion. |
