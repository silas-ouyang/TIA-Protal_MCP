# LGF_GetCalendarWeek_US (FC / V3.0.1)

- **分类**：Date and timer operations (§4.2.3)
- **中文功能**：按美洲标准（周日为首日）计算指定日期的日历周次与年积日
- **英文简述**：This function uses the specified date to calculate the calendar week and the number of days that have passed since the beginning of the year for the USA and many other countries.

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
