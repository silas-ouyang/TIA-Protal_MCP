# LGF_DTLToUnixTime (FC / V3.0.2)

- **分类**：Converter operations (§4.9.9)
- **中文功能**：将 DTL 格式 UTC 日期时间换算转换为 32 位 Unix 秒级时间戳
- **英文简述**：This function converts the date and time of data type DTL to the UNIX time of data type DInt. The timestamp is calculated in UTC. This means that the time zone is not considered. Only times after 01/01/1990 are permitted.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `timeDTL` | `DTL` | `-` | Date and time as DTL to convert to UNIX time |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `DInt` | Converted UNIX time |
| `error` | `Bool` | FALSE: No error TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
