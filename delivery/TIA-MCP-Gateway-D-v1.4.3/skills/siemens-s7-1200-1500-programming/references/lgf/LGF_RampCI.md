# LGF_RampCI (FB / V3.0.1)

- **分类**：Technology operations (§4.15.4)
- **中文功能**：循环中断中按设定速度曲线与插值点表生成多段平滑过渡斜坡
- **英文简述**：The function generates a speed curve based on an interpolation point table. Linear interpolation occurs between the points within the prescribed time.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `defaultOutValue` | `LReal` | `0.0` | Value for pre-assignment of the output variable (`outputValue` = `defaultOutValue`) |
| `contStepNbr` | `Int` | `0` | Number of the next interpolation point for continuing |
| `contStepTime` | `Time` | `T#0MS` | Remaining time to continue to the interpolation point `contStepNbr` |
| `enDefaulftOut Value` | `Bool` | `FALSE` | Assign default output value (`outputValue` = `defaultOutValue`) |
| `start` | `Bool` | `FALSE` | Run down the interpolation point table |
| `hold` | `Bool` | `FALSE` | Freeze/ hold output at actual value |
| `continue` | `Bool` | `FALSE` | Continuing |
| `cyclicOP` | `Bool` | `FALSE` | Repeat interpolation point table cyclically |
| `updateTime` | `Bool` | `FALSE` | Update time values |
| `reset` | `Bool` | `FALSE` | Complete reset of function |
| `callOB` | `OB_CYCLIC` | `---` | Calling wake-alarm interrupt OB (cyclic interrupt OB) |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `outputValue` | `LReal` | Output value |
| `actTimeTable` | `Bool` | The interpolation point table will be edited. |
| `stepNumber` | `Int` | current interpolation point number (interpolation point that is approached) |
| `remainTime` | `Time` | Remainingtime until reachingthe next interpolation point |
| `totalTime` | `Time` | Total time for setpoint table |
| `remainTotalTime` | `Time` | Total remaining time |
| `error` | `Bool` | FALSE: No error TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |
| `subfunction Status` | `Word` | Status or return value of called FB's, FC's and system blocks |

## 输入/输出参数 (In/Out)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `setpoints` | `Array[*] of LGF` | Interpolation point table. |
| `_typeRampTime` | `You can find information on the data type` |  |
| `Table` | `LGF_typeRampTimeTable` under the item “Global data” . |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |

## 功能说明与使用要点
- The status of called commands is output in `subFunctionStatus` . In this case, the output value in Note `status` indicates which command caused the error. In this case, refer to the TIA Portal Onli...
- With this block, speed curves can be executed based on parameterized interpolation points; in each call cycle values are output according to a schedule, and interpolation takes place between the in...
- In each cycle the currently approached interpolation point number `stepNumber` ,` the actual remaining time `remainTime` until reaching the interpolation point, the total time `totalTime, and...
- The time interval of the calling cyclic interrupt OB is determined by interconnecting the calling cyclic interrupt OB at the input parameter `callOB` .
- Figure: Interconnecting the cyclic interrupt OB
- The following operating modes can be selected via control inputs:
- - Restart
- - Pre-assigning an output
- - Output a speed curve
- - Stop processing
- - Specify processing step and processing time
- - Switch-on cyclic operation+F1
- - Update total time and remaining time
- Figure: Functional processes
