# LGF_DTLToJulianDate (FC / V0.0.1)

- **分类**：Converter operations (§4.9.5)
- **中文功能**：将 DTL 日期时间转换为天文儒略日（Julian Date）及修正儒略日
- **英文简述**：This function converts the date and time of data type DTL to the Julian date and as well the modified Julian Date to data type LReal (Double). The timestamp is calculated based on UTC. This means that the time zone is not considered. Onl...

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `timeDTL` | `DTL` | `-` | Date and time as DTL to convert to Julian Date |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `Void` | --- |
| `julianDate` | `LReal` | Converted Julian date |
| `modifiedJulian Date` | `LReal` | Converted modified Julian date |
| `error` | `Bool` | FALSE: No error TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#0000` | `STATUS_EXECUTION_FINISHED_NO_ERROR` | Execution finished without errors |
| `16#8000` | `ERR_DTL_INPUT_VALUE_INVALID` | Error: Input timestamp value not valid.<br>The data type contains implausible data. |
| `16#8001` | `ERR_TIME_BEFORE_1990` | Error: Input time is before 01/01/1990. The function does not support this conversion, because<br>of internal used datatype |
