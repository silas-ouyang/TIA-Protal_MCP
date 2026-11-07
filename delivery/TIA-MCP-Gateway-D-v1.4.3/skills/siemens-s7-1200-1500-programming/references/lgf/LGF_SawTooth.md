# LGF_SawTooth (FB / V3.0.1)

- **分类**：Legacy / Signal generators (§4.19.1)
- **中文功能**：§4.19.1
- **英文简述**：This function generates a sawtooth-shaped signal profile. Each sawtooth consists of a defined number of steps (increments).

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `startValue` | `Int` | `0` | Start value at which the signal begins. |
| `timeRange` | `Time` | `T#0s` | Time after which the output parameter `value` is incremented |
| `incrementRange` | `Int` | `0` | Size of the jump from one increment to the next. |
| `numberSteps` | `Int` | `0` | Number of increments per sawtooth. (In the case of an endless sawtooth signal, this information is not necessary). |
| `endlessSteps` | `Bool` | `FALSE` | Specifies whether an endless sawtooth signal will be generated. `TRUE` - Activated, `FALSE` - Disabled |
| `reset` | `Bool` | `FALSE` | Sawtooth starts again at the start value, `startValue`. |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `value` | `Int` | Current value of the sawtooth signal. |

## 功能说明与使用要点
- Please note that changes at the input parameters only become effective with `reset` . Note
- The block calculates the values for a sawtooth-shaped signal profile, which is output to the output parameter `value` .` The signal begins with the start value `startValue and is added with the...
- If the variable `endlessSteps` is set to `FALSE` ,` the number of add operations is counted. If this exceeds the value `numberSteps` ,` the output parameter `value` is set back to the start v...
- If the variable `endlessSteps` is set to `TRUE` ,` the value `increment` is added without interruption, starting once at `startValue` .` If the maximum positive INT value range (32767) of the...
- The duration of a sawtooth at `endlessSteps` on `FALSE` is calculated as follows: Note Duration = #timeRange * (#numberSteps + 1)
- **注意**：[Note] `LEGACY FUNCTION` Please update and use the FB with the same name `LGF_CountRisInDWord` in the future! This function is no longer maintained!
