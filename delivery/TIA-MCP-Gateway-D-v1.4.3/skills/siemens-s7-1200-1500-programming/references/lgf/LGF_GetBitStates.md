# LGF_GetBitStates (FB / V1.0.0)

- **分类**：Counter operations (§4.4.6)
- **中文功能**：周期比对 DWORD 变量并输出上升沿/下降沿位掩码及边沿总数
- **英文简述**：This function checks a DWord for falling as well as rising edges. It returns the number of edges, a DWord with the edge bits, and a boolean value if edge(s) are present.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `value` | `DWord` | `16#00000000` | Check input value for changes and edges |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `hasChanged` | `Bool` | Input value has changed (compared to the previous cycle) |
| `hasRisingEdges` | `Bool` | Input value has rising edges |
| `risingBits` | `DWord` | Bitstream with the risingedges |
| `noOfRisingBits` | `USInt` | Number of risingedges in the input value |
| `hasFallingEdges` | `Bool` | Input value has falling edges |
| `fallingBits` | `DWord` | Bitstream with the falling edges |
| `noOfFallingBits` | `USInt` | Number of falling edges in the input value |
