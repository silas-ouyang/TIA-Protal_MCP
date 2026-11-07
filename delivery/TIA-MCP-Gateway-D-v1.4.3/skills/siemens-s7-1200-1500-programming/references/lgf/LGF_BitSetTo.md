# LGF_BitSetTo (FC / V3.0.1)

- **分类**：Bit logic operations (§4.1.3)
- **中文功能**：将 DWord 变量中指定位号的位按给定值置为 TRUE 或 FALSE
- **英文简述**：This block sets a bit to TRUE or FALSE at a predefined position in a variable of the data type DWORD. Alternatively, Word and Byte can be used instead of DWord by converting the passed parameter with, for example, BYTE_TO_DWORD and the r...

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `value` | `DWord` | `-` | Tag where the bit has to be set / reset |
| `bitNo` | `USInt` | `-` | Bit number to set in "value" parameter |
| `setTo` | `Bool` | `-` | Set bit to FALSE / TRUE |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `DWord` | Tag with set bit |
