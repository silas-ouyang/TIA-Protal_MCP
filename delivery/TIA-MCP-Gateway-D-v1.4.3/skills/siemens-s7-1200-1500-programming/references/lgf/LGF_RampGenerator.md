# LGF_RampGenerator (FB / V1.0.0)

- **分类**：Signal generators (§4.14.5)
- **中文功能**：线性斜坡信号发生器（带目标值逼近、保持与容差带到位判定）
- **英文简述**：Generates a linear interpolated signal with a defined target value (with or without tolerance)

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `startRamp` | `Bool` | `FALSE` | TRUE: Risingedge starts the rampgenerator |
| `deltaT` | `Real` | `0.0` | Allowed time for actual value change [s] |
| `startValue` | `Real` | `0.0` | Process value from which to start [e-units] |
| `targetValue` | `Real` | `0.0` | Process value to be reached [e-units] |
| `tolerance` | `Real` | `0.0` | Accepted tolerance in percentage [%] |
| `reset` | `Bool` | `FALSE` | TRUE: Risingedge resets the rampgenerator |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `valid` | `Bool` | TRUE: indicates that the block outputs are valid |
| `busy` | `Bool` | TRUE: indicates that the block calculates the ramp |
| `rampingDone` | `Bool` | TRUE: indicates that the block has finished the ramp |
| `actualValue` | `Real` | Ramp actual value [e-units] |
| `gradient` | `Real` | Ramp gradient [e-units/s] |
| `error` | `Bool` | TRUE: indicates that an error has occurred |
| `status` | `Word` | 16#0000-16#FFFF: contains status information about the internal state of the block |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
