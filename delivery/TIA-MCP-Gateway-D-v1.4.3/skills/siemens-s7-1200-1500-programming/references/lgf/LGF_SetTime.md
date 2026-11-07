# LGF_SetTime (FB / V3.0.3)

- **分类**：Date and timer operations (§4.2.8)
- **中文功能**：综合读取并配置 PLC 系统时间、本地时间及夏令时时区参数
- **英文简述**：This block combines the functions of system time, local time, and set time zone.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `execute` | `Bool` | `FALSE` | Risingedge starts action once |
| `systemTime` | `DTL` | `---` | System time to be set in PLC |
| `isLocalTime` | `Bool` | `FALSE` | TRUE: `systemTime` is local time, FALSE: `systemTime` is UTC time |
| `timeZone` | `Int` | `0` | Timezones HHMM [-1200.. -330.. 0.. 930.. 1200.. 1300] |
| `isDaylight SavingTime utput parameter` | `Bool` | `FALSE` | Daylight saving time changeover, TRUE: activated, FALSE: deactivated (more infos at "Adjusting parameters in the `statTimeZone` variable") |
| `Identifier` | `Data type` | `Descriptio` | n |
| `done` | `Bool` | `TRUE: Co` | mmanded functionalityhas been completed successfully |
| `busy` | `Bool` | `TRUE: FB i` | s active and new output values can be expected |
| `error` | `Bool` | `FALSE: No the FB` | error / TRUE: An error occurred during the execution of |
| `lastSetTimeZone` | `String` | `Time zone` | that was set last by this block |
| `status` | `Word` | `16#0000-1 identificatio` | 6#7FFF: Status of the FB / 16#8000-16#FFFF: Error n (see following Table) |
| `subFunction Status` | `Word` | `Status or re` | turn value of called FB's, FC's and system blocks |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
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
- This block combines the functions of system time, local time, and set time zone.
- The following time zones are possible on the `timeZone` input:
