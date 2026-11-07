# LGF_GetCalendarWeek_ISO (FC / V3.0.1)

- **分类**：Date and timer operations (§4.2.2)
- **中文功能**：按 ISO 8601 标准计算指定日期所属的日历周次与年积日
- **英文简述**：This function uses the specified date to calculate the calendar week and the number of days that have passed since the beginning of the year for ISO 8601 European countries.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `date` | `DTL` | `-` | Date used to calculate the calendar week and days since 1 January |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `DInt` | Number of the calendar week. |
| `calendarDay` | `DInt` | Days past since January1st ongiven date |
| `error` | `Bool` | FALSE: No error / TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB / 16#8000-16#FFFF: Error identification (see following Table) |
| ` | ` |  |
| ` | ` |  |

## 功能说明与使用要点
- **Counting method for European countries in accordance with ISO 8601**
- - Calendar weeks have 7 days, start on a Monday, and they are counted continuously throughout the year
- - Calendar week 1 of a year is the week that contains the first Thursday.
- - Each year has either 52 or 53 calendar weeks.
- - A year has 53 calendar weeks if the following characteristics apply:
- - A common year begins on a Thursday and ends on a Thursday.
- - A leap year begins either on a Wednesday and ends on a Thursday or it begins on a Thursday and ends on a Friday.
- - The 29th, 30th and 31st December can belong to the calendar week 1 of the following year.
- - The 1st, 2nd, and 3rd January can still belong to the last calendar week of the previous year.
