# LGF_MergeBitsToByte (FC / V3.0.1)

- **分类**：Converter operations / Binary types - Split and Merge (§4.11.1)
- **中文功能**：将 8 个独立的布尔变量（Bit0..Bit7）按位合并为一个 Byte 字节
- **英文简述**：This function merge 8 Bits / 8 Boolean variables into one Byte variable.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `bit7` | `Bool` | `-` | Input Bit 7 - MSB |
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
| `Ret_Val` | `Byte` | Composite Bit sequence stored as Byte variable |
