# LGF_SplitWordToBits (FC / V3.0.1)

- **分类**：Converter operations / Binary types - Split and Merge (§4.11.11)
- **中文功能**：将一个 Word 字变量按位分解拆分为 16 个独立的布尔变量
- **英文简述**：This function splits a Word variable into 16 Boolean / 16 Bit variables.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `word` | `Word` | `-` | Bit sequence to be split |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `Void` | Void - Function has no return value |
| `bit15` | `Bool` | Output Bit 15 - MSB |
| `bit14` | `Bool` | Output Bit 14 |
| `bit13` | `Bool` | Output Bit 13 |
| `bit12` | `Bool` | Output Bit 12 |
| `bit11` | `Bool` | Output Bit 11 |
| `bit10` | `Bool` | Output Bit 10 |
| `bit9` | `Bool` | Output Bit 9 |
| `bit8` | `Bool` | Output Bit 8 |
| `bit7` | `Bool` | Output Bit 7 |
| `bit6` | `Bool` | Output Bit 6 |
| `bit5` | `Bool` | Output Bit 5 |
| `bit4` | `Bool` | Output Bit 4 |
| `bit3` | `Bool` | Output Bit 3 |
| `bit2` | `Bool` | Output Bit 2 |
| `bit1` | `Bool` | Output Bit 1 |
| `bit0` | `Bool` | Output Bit 0 - LSB |
