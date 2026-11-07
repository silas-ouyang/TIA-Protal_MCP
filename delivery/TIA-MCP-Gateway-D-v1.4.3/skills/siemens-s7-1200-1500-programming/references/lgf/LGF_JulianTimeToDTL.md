# LGF_JulianTimeToDTL (FC / V0.0.1)

- **分类**：Converter operations (§4.9.15)
- **中文功能**：将天文儒略日（或修正儒略日）浮点数值还原换算为 DTL 日期时间
- **英文简述**：This function converts a given Julian Date (regular or modified) of data type LReal (Double) to a date and time of data type DTL. The timestamp is calculated based on UTC. This means that the time zone is not considered. Only times after...

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `julianDate` | `LReal` | `-` | Julian date to convert (standard or modified, depends on `isModifiedDate`) |
| `isModifiedDate` | `Bool` | `-` | TRUE: `julianDate` is the modified Julian date FALSE: `julianDate` is the regular Julian date |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `DTL` | Converted time (Date and time). In case of Error DTL default value |
| `error` | `Bool` | FALSE: No error TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
