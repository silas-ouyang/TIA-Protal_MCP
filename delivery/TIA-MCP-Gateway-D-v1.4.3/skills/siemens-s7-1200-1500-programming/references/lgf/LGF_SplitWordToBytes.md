# LGF_SplitWordToBytes (FC / V3.0.1)

- **分类**：Converter operations / Binary types - Split and Merge (§4.11.12)
- **中文功能**：将一个 Word 字变量拆分分解为高字节与低字节两个 Byte 变量
- **英文简述**：This function splits a Word variable into 2 Byte variables.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `word` | `Word` | `-` | Bit sequence to be split |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `Void` | Void - Function has no return value |
| `byte1` | `Byte` | Output Byte 1 - MSB |
| `byte0` | `Byte` | Output Byte 0 - LSB |
