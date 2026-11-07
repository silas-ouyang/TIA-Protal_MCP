# LGF_PulseRelay (FB / V3.0.1)

- **分类**：Bit logic operations (§4.1.7)
- **中文功能**：单按钮脉冲继电器/双稳态翻转触发器，支持复位与置位优先
- **英文简述**：This block corresponds to an impulse relay or a toggle flip-flop including set and reset input. Pulse relay, Surge relay, Toggle-Flip-Flop, Frequency divider `reset` is leading / prior to `set` or `trigger`

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `trigger` | `Bool` | `FALSE` | Trigger to toggle output signal (rising edge) |
| `set` | `Bool` | `FALSE` | Set output signal. rising edge |
| `reset` | `Bool` | `FALSE` | Reset signal, risingedge(prior to set) |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `out` | `Bool` | Ooutput signal |

## 功能说明与使用要点
- Figure: LGF_PulseRelay Signal diagram
- 1. Each rising edge of the input `trigger` changes the Boolean value of the output `out` .
- 2. Each rising edge of the input `set` sets the Bboolean value of the output `out` to `TRUE` .
- 3. Each rising edge of the input `reset` sets the Boolean value of the output `out` to `FALSE` .
- 4. If the inputs `set` and `reset` are set in the same cycle, the `reset` input has priority.
- The block can also be used as a frequency divider. If the input `trigger` is supplied with a fixed frequency, the output `out` delivers half the frequency.
