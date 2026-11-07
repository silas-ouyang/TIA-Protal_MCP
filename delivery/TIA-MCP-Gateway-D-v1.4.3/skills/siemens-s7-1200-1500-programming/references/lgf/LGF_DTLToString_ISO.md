# LGF_DTLToString_ISO (FC / V3.1.1)

- **分类**：Converter operations (§4.9.7)
- **中文功能**：将 DTL 日期时间格式化转换为 ISO 8601 标准文本（YYYY-MM-DD）
- **英文简述**：This function converts a date of data type DTL into a character string of data type STRING in international format (ISO) (YYYY MM DD…).

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `date` | `DTL` | `-` | Date to convert as DTL tag |
| `separator` | `Char` | `-` | Separator between the components of the output date. |
| `separatorDate AndTime` | `Char` | `-` | Separator between the components date and time. |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `String` | Output string in accordance with the international format (ISO 8601). Example: `2019-01-22 14:06:51.524621000` |

## 功能说明与使用要点
- The block reads a date of data type DTL and converts the individual components of the date (year, month, day, hour…) into a character string and outputs it in international format (ISO 8601). The s...
- **International format (ISO 8601):**
- **Separator:**
- At the input parameter `separator` , you specify the separator between the components of the date, at `seperatorDateAndTime` you specify the separator between the date and the time.
- **Example:**
- - separator = `-` - outString = `2016-03-16…` (default)
- - separator = `/` - outString = `2016/03/16…`
- - • separatorDateAndTime = - outString = `2016-03-16 12:45…` (default)
- - separatorDateAndTime = `T` - outString = `2016/03/16T12:45…`
