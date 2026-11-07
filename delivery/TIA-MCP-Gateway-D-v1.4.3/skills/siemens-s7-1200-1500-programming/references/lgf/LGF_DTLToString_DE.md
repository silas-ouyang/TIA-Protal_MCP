# LGF_DTLToString_DE (FC / V3.1.1)

- **分类**：Converter operations (§4.9.6)
- **中文功能**：将 DTL 日期时间格式化转换为传统德标日期文本（DD.MM.YYYY）
- **英文简述**：This function converts a date of data type DTL into a character string of data type STRING in the traditional German format (DE) (DD MM YYYYY…).

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `date` | `DTL` | `-` | Date to convert as DTL tag |
| `separator` | `Char` | `-` | Separator between the components of the output date. |
| `separatorDate AndTime` | `Char` | `-` | Separator between the components date and time. |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `String` | Output string according to the traditional German format. |
| `E` |  |  |

## 功能说明与使用要点
- The block reads a date of data type DTL and converts the individual components of the date (year, month, day, hour…) into a character string and outputs it in traditional German format (DE). The se...
- **Traditional German format (DE):**
- **Separator:**
- At the input parameter `separator` , you specify the separator between the components of the date, at `seperatorDateAndTime` you specify the separator between the date and the time.
- **Example:**
- - separatorDate = `-` - outString = `16-03-2016…` (default)
- - separatorDate = `/` - outString = `16/03/2016…`
- - separatorDateAndTime = - outString = `2016-03-16 12:45…` (default)
- - separatorDateAndTime = `T` - outString = `2016-03-16T12:45…`
