# LGF_TimerSwitch (FB / V3.1.0)

- **分类**：Date and timer operations (§4.2.9)
- **中文功能**：多模式日历定时开关（支持按日、周、月、年及工作日定时启闭）
- **英文简述**：This block is a timer. It is possible to define daily, weekly, monthly, yearly time switch points and time switch points for working days or weekend days. Mode: Permanently off: 0, Daily: 1, Weekly: 2, Monthly: 3, Yearly: 4, Workday: 5, ...

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `onMonth` | `USInt` | `0` | Month, in which the signal shall be set. |
| `onDay` | `USInt` | `0` | Day, at which the signal shall be set. |
| `onWeekday` | `USInt` | `0` | Day of the week on which the signal will be set; Sunday: 1, Monday: 2, Tuesday: 3, ... |
| `onHour` | `USInt` | `0` | Hour, at which the signal shall be set. |
| `onMinute` | `USInt` | `0` | Minute, at which the signal shall be set. |
| `offMonth` | `USInt` | `0` | Month, in which the signal shall be reset. |
| `offDay` | `USInt` | `0` | Day, at which the signal shall be reset. |
| `offWeekday` | `USInt` | `0` | Day of the week on which the signal will be reset; Sunday: 1, Monday: 2, Tuesday: 3, ... |
| `offHour` | `USInt` | `0` | Hour, at which the signal shall be reset. |
| `offMinute` | `USInt` | `0` | Minute, at which the signal shall be reset. |
| `mode` | `USInt` | `0` | Specifies the mode (see Principle of operation); Permanently off: 0, Daily: 1, Weekly: 2, Monthly: 3, Yearly: 4, Workday: 5, Weekend: 6, Permanently on: 10 |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `signal` | `Bool` | Output signal |
| `actLocalTime` | `DTL` | Current local time |
| `error` | `Bool` | FALSE: No error / TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB / 16#8000-16#FFFF: Error identification (see following Table) |
| `subFunction Status` | `Word` | Sub function status code |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |

## 功能说明与使用要点
- The status of called commands is output in `subFunctionStatus` . In this case, the output value in Note `status` indicates which command caused the error. In this case, refer to the TIA Portal Onli...
- `The function uses internally the system function` `RD_LOC_T` to read the local time of the CPU, for the Note correct function it is therefore necessary that the local time of the CPU is set corr...
- The block offers various timer types, which are determined in the `mode` parameter:
- - Permanently off (mode = 0)
- - Daily timer (mode = 1)
- - Weekly timer (mode = 2)
- - Monthly timer (mode = 3)
- - Yearly timer (mode = 4)
- - Weekdays, Monday to Friday (mode = 5)
- - Weekend, Saturday and Sunday (mode = 6)
- - Permanently on (mode = 10)
- The time value is always compared with the local time of the PLC, therefore the time value specified at the On and Off parameters must be specified as local time.
- Depending on the mode, the following formal parameters must be interconnected:
- If the set start time equals the current local time of the controller, the output `signal` is set to `TRUE` .` If the set switch-off time equals the current local time of the controller, the `s...
- Please note that the block can be used in the “Monthly timer” modes (mode = 3) or “yearly timer” (mode Note = 4) the block only switches if the days that you specify at the input parameters, “onDay...
