# LGF_BitCount (FC / V3.0.2)

- **分类**：Counter operations (§4.4.1)
- **中文功能**：统计 DWord 变量中状态为 TRUE 与 FALSE 的二进制位总数
- **英文简述**：This block counts in a variable of type DWord how many bits are set (TRUE) and how many are not set (FALSE) and outputs the number at the outputs. Instead of DWord, Word and Byte can also be used by converting the past parameter with e.g...

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `value` | `DWord` | `-` | Tag where the bit states has to be counted |
| `numberOfBits` | `USInt` | `-` | Number of bits in input tag "value" (bit size of Datatype), in case of Byte=8, Word=16, DWord=32 |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `Void` | Void - Function has no return value |
| `countBitsFalse` | `USInt` | Number of bits are FALSE in input tag "value" |
| `countBitsTrue` | `USInt` | Number of bits are TRUE in input tag "value" |
