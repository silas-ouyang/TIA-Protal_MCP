# LGF_SplitDWordToBytes (FC / V3.0.1)

- **分类**：Converter operations / Binary types - Split and Merge (§4.11.9)
- **中文功能**：将一个 DWord 双字变量拆分分解为 4 个独立的 Byte 字节变量
- **英文简述**：This function splits a DWord variable into 4 Byte variables.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `doubleWord` | `DWord` | `-` | Bit sequence to be split |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `Void` | Void - Function has no return value |
| `byte3` | `Byte` | Output Byte 3 - MSB |
| `byte2` | `Byte` | Output Byte 2 |
| `byte1` | `Byte` | Output Byte 1 |
| `byte0` | `Byte` | Output Byte 0 - LSB |
