# LGF_BitTest (FC / V3.0.1)

- **分类**：Bit logic operations (§4.1.4)
- **中文功能**：检测 DWord 变量中指定位号的状态并作为布尔返回值输出
- **英文简述**：This block checks whether a bit is TRUE or FALSE at a given position in a variable of the data type DWORD. Alternatively, Word and Byte can be used instead of DWord by converting the passed parameter with, for example, BYTE_TO_DWORD and ...

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `value` | `DWord` | `-` | Tag where the bit has to be tested |
| `bitNo` | `USInt` | `-` | bit number to test in "value" parameter |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `Bool` | Value of the checked bit. |
