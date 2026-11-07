# LGF_BitToggle (FC / V3.0.1)

- **分类**：Bit logic operations (§4.1.5)
- **中文功能**：将 DWord 变量中指定位号的布尔状态取反翻转
- **英文简述**：This block toggles (from TRUE to FALSE and vice versa) a bit at a predefined position in a variable of the data type DWORD. Alternatively, Word and Byte can be used instead of DWord by converting the passed parameter with, for example, B...

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `value` | `DWord` | `-` | Tag where the bit has to be toggled |
| `bitNo` | `USInt` | `-` | Bit number to be toggled in the “value” parameter. |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `DWord` | Tag with toggled bit |
