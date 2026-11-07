# LGF_MergeBytesToWord (FC / V3.0.1)

- **分类**：Converter operations / Binary types - Split and Merge (§4.11.5)
- **中文功能**：将 2 个独立的 Byte 字节变量按高低字节组合为一个 Word 字
- **英文简述**：This function merge 2 Byte variables into one Word variable.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `byte1` | `Byte` | `-` | Input Byte 1 - MSB |
| `byte0` | `Byte` | `-` | Input Byte 0 - LSB |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `Word` | Composite Byte sequence stored as Word variable |
