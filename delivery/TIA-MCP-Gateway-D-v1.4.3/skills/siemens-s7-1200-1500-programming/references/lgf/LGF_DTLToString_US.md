# LGF_DTLToString_US (FC / V1.0.1)

- **分类**：Converter operations (§4.9.8)
- **中文功能**：将 DTL 日期时间格式化转换为美标格式日期文本（MM/DD/YYYY）
- **英文简述**：This function converts a date of data type DTL into a character string of data type STRING in American format (US) (MM DD YYYY…).

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `date` | `DTL` | `-` | Date to convert as DTL tag |
| `separator` | `Char` | `-` | Separator between the components of the output date. |
| `separatorDate AndTime` | `Char` | `-` | Separator between the components date and time. |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `String` | Output string in accordance with the American format (US). |
| `E` |  |  |

## 功能说明与使用要点
- The block reads a date of data type DTL and converts the individual components of the date (year, month, day, hour…) into a character string and outputs it in American format (US). The separator be...
- **American format (US):**
- **Separator:**
- At the input parameter `separator` , you specify the separator between the components of the date, at `seperatorDateAndTime` you specify the separator between the date and the time.
- **Example:**
- - separatorDate = `-` - outString = `06-20-2025…` (default)
- - separatorDate = `/` - outString = `06/20/2025…`
- - separatorDateAndTime = - outString = `06-20-2025 12:45…` (default)
- - separatorDateAndTime = `T` - outString = `06-20-2025T12:45…`
