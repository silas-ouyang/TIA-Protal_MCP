# LGF_Frequency (FB / V3.0.2)

- **分类**：Signal generators (§4.14.3)
- **中文功能**：依据设定频率与脉宽占空比生成连续周期性方波脉冲信号
- **英文简述**：This function generates a signal that changes between the values `FALSE` and `TRUE` depending on a defined frequency and a pulse pause ratio.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `frequency` | `Real` | `0.0` | Clock frequency in Hz. |
| `pulsePauseRatio` | `Real` | `1.0` | Pulse pause ratio (standard: 1.0 corresponds to 1:1). |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `clock` | `Bool` | Output changes with defined frequency. |
| `countdown` | `Time` | Remaining time of the current `clock` state. |

## 功能说明与使用要点
- The `clock` output is a Boolean value that toggles at the desired frequency. The `pulsePauseRatio` input is used to set the pulse pause ratio.
- The output `countdown` outputs the remaining time of the current state of `clock` .
- If the desired frequency or pulse pause ratio is less than or equal to `0.0` ,` the output `clock` = FALSE and `countdown` = `0s .
