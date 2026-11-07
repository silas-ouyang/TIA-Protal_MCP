# LGF_StringToDTL_ISO (FC / V3.1.0)

- **分类**：Converter operations (§4.9.17)
- **中文功能**：解析 ISO 8601 标准日期时间文本字符串并重构转换为 DTL 变量
- **英文简述**：This function converts a character string in international format (ISO 8601) with date and time components into the data type DTL.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `date` | `String` | `-` | Date as a character string according to the format. Example: `2019-01-22 14:07:57.696417000`. |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `DTL` | The converted date and time in the format DTL |
| `error` | `Bool` | FALSE: No error TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |

## 功能说明与使用要点
- The block reads a date as a character string and converts it to the data type DTL. The individual date components in the character string are separated according to the international format (ISO 86...
- **International format (ISO 8601):**
