# LGF_IecTimerOnOff (FB / V1.0.0)

- **分类**：Bit logic operations (§4.1.6)
- **中文功能**：集成通电延时（TON）与断电延时（TOF）的双向防抖定时器
- **英文简述**：The Block implements an IEC_Timer TON and TOF

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `in` | `Bool` | `FALSE` | Boolean Input value |
| `timeOnDelay` | `Time` | `T#0s` | Preset Time on Delay |
| `timeOffDelay` | `Time` | `T#0s` | Preset Time off Delay |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `out` | `Bool` | Delayed Input signal from input `in` |
