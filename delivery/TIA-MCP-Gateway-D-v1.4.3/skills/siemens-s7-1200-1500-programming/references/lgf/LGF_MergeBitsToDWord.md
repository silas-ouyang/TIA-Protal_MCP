# LGF_MergeBitsToDWord (FC / V3.0.1)

- **分类**：Converter operations / Binary types - Split and Merge (§4.11.2)
- **中文功能**：将 32 个独立的布尔变量（Bit0..Bit31）按位合并为一个 DWord 双字
- **英文简述**：This function merge 32 Bits / 32 Boolean variables into one DWord variable.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `bit31` | `Bool` | `-` | Input Bit 31 - MSB |
| `bit30` | `Bool` | `-` | Input Bit 30 |
| `bit29` | `Bool` | `-` | Input Bit 29 |
| `bit28` | `Bool` | `-` | Input Bit 28 |
| `bit27` | `Bool` | `-` | Input Bit 27 |
| `bit26` | `Bool` | `-` | Input Bit 26 |
| `bit25` | `Bool` | `-` | Input Bit 25 |
| `bit24` | `Bool` | `-` | Input Bit 24 |
| `bit23` | `Bool` | `-` | Input Bit 23 |
| `bit22` | `Bool` | `-` | Input Bit 22 |
| `bit21` | `Bool` | `-` | Input Bit 21 |
| `bit20` | `Bool` | `-` | Input Bit 20 |
| `bit19` | `Bool` | `-` | Input Bit 19 |
| `bit18` | `Bool` | `-` | Input Bit 18 |
| `bit17` | `Bool` | `-` | Input Bit 17 |
| `bit16` | `Bool` | `-` | Input Bit 16 |
| `bit15` | `Bool` | `-` | Input Bit 15 |
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
| `Ret_Val` | `DWord` | Composite Bit sequence stored as DWord variable |
