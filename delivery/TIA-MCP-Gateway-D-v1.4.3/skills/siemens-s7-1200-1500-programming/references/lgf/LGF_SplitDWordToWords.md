# LGF_SplitDWordToWords (FC / V3.0.1)

- **分类**：Converter operations / Binary types - Split and Merge (§4.11.10)
- **中文功能**：将一个 DWord 双字变量拆分分解为高字与低字两个 Word 字变量
- **英文简述**：This function splits a DWord variable into 2 Word variables.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `doubleWord` | `DWord` | `-` | Bit sequence to be split |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `Void` | Void - Function has no return value |
| `word1` | `Word` | Output Word 1 - MSW |
| `word0` | `Word` | Output Word 0 - LSW |
