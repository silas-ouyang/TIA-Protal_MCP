# LGF_BitSet (FC / V3.0.1)

- **分类**：Bit logic operations (§4.1.2)
- **中文功能**：将 DWord 变量中指定位号（bitNo）的位置位为 TRUE
- **英文简述**：This block sets a bit at a given position in a variable of the data type DWORD. Alternatively, Word and Byte can be used instead of DWord by converting the passed parameter with, for example, BYTE_TO_DWORD and the result with DWORD_TO_BYTE.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `value` | `DWord` | `-` | Tag where the bit has to be set |
| `bitNo` | `USInt` | `-` | Bit number to set in "value" parameter |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `DWord` | Tag with the set bit |
