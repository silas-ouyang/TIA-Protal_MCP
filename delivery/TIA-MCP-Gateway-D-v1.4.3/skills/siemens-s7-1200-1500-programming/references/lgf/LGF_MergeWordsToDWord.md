# LGF_MergeWordsToDWord (FC / V3.0.1)

- **分类**：Converter operations / Binary types - Split and Merge (§4.11.6)
- **中文功能**：将 2 个独立的 Word 字变量按高低字组合为一个 DWord 双字变量
- **英文简述**：This function merge 2 Word variables into one DWord variable.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `word1` | `Word` | `-` | Input Word 1 - MSB |
| `word0` | `Word` | `-` | Input Word 0 - LSB |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `DWord` | Composite Word sequence stored as DWord variable |
