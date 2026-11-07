# LGF_MergeBytesToDWord (FC / V3.0.1)

- **分类**：Converter operations / Binary types - Split and Merge (§4.11.4)
- **中文功能**：将 4 个独立的 Byte 字节变量按高低字节组合为一个 DWord 双字
- **英文简述**：This function merge 4 Byte variables into one DWord variable.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `byte3` | `Byte` | `-` | Input Byte 3 - MSB |
| `byte2` | `Byte` | `-` | Input Byte 2 |
| `byte1` | `Byte` | `-` | Input Byte 1 |
| `byte0` | `Byte` | `-` | Input Byte 0 - LSB |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `DWord` | Composite Byte sequence stored as DWord variable |
