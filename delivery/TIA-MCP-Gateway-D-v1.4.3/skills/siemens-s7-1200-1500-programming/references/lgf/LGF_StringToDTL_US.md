# LGF_StringToDTL_US (FC / V1.0.0)

- **分类**：Converter operations (§4.9.18)
- **中文功能**：解析美标格式日期时间文本字符串并重构转换为系统 DTL 变量
- **英文简述**：This function converts a character string in American format (US) with date and time components into the data type DTL.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `date` | `String` | `-` | Date as a character string according to the format. Example: `01-22-2019 14:07:57.696417000`. |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `DTL` |  |
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
- The block reads a date as a character string and converts it to the data type DTL. The individual date components in the character string are separated according to the American format. The separat...
- **American format (US):**
