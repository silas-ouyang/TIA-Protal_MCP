# LGF_MergeBitsToWord (FC / V3.0.1)

- **分类**：Converter operations / Binary types - Split and Merge (§4.11.3)
- **中文功能**：将 16 个独立的布尔变量（Bit0..Bit15）按位合并为一个 Word 字
- **英文简述**：This function merge 16 Bits / 16 Boolean variables into one Word variable.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `bit15` | `Bool` | `-` | Input Bit 15 - MSB |
| `bit14` | `Bool` | `-` | Input Bit 14 |
| `bit13` | `Bool` | `-` | Input Bit 13 |
| `bit12` | `Bool` | `-` | Input Bit 12 |
| `bit11` | `Bool` | `-` | Input Bit 11 |
| `bit10` | `Bool` | `-` | Input Bit 10 |
| `bit9` | `Bool` | `-` | Input Bit 9 |
| `bit8` | `Bool` | `-` | Input Bit 8 |
| `bit7` | `Bool` | `-` | Input Bit 7 |
| `bit6` | `Bool` | `-` | Input Bit 6 |
| `bit5` | `Bool` | `-` | Input Bit 5 |
| `bit4` | `Bool` | `-` | Input Bit 4 |
| `bit3` | `Bool` | `-` | Input Bit 3 |
| `bit2` | `Bool` | `-` | Input Bit 2 |
| `bit1` | `Bool` | `-` | Input Bit 1 |
| `bit0` | `Bool` | `-` | Input Bit 0 - LSB |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `Word` | Composite Bit sequence stored as Word variable |
