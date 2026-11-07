# LGF_SplitByteToBits (FC / V3.0.1)

- **分类**：Converter operations / Binary types - Split and Merge (§4.11.7)
- **中文功能**：将一个 Byte 字节变量按位分解拆分为 8 个独立的布尔变量
- **英文简述**：This function splits a Byte variable into 8 Boolean / 8 Bit variables.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `byte` | `Byte` | `-` | Bit sequence to be split |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `Void` | Void - Function has no return value |
| `bit7` | `Bool` | Output Bit 7 - MSB |
| `bit6` | `Bool` | Output Bit 6 |
| `bit5` | `Bool` | Output Bit 5 |
| `bit4` | `Bool` | Output Bit 4 |
| `bit3` | `Bool` | Output Bit 3 |
| `bit2` | `Bool` | Output Bit 2 |
| `bit1` | `Bool` | Output Bit 1 |
| `bit0` | `Bool` | Output Bit 0 - LSB |
