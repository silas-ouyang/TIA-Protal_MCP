# LGF_GetCalendarDay (FC / V3.0.1)

- **分类**：Date and timer operations (§4.2.1)
- **中文功能**：根据指定 DTL 日期计算自当年1月1日起经过的年积日天数
- **英文简述**：This function uses the specified date to calculate the number of days that have passed since the beginning of the year (1st January). The function is used in the functions “LGF_GetCalendarWeek_ISO” and “LGF_GetCalendarWeek_US”.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `date` | `DTL` | `-` | Date for the calculation of the calendar days since 1 January. |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `DInt` | Days past since January 1st. |
| `error` | `Bool` | FALSE: No error / TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB / 16#8000-16#FFFF: Error identification (see following Table) |
| ` | ` |  |
| ` | ` |  |
