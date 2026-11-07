# LGF_BinaryMaskCompare (FC / V1.0.0)

- **分类**：Comparator operations (§4.5.1)
- **中文功能**：使用指定二进制掩码过滤后对比两个 DWORD 数值是否相等
- **英文简述**：This function compares two binary Values `source` and `compare` by a given `mask` .` Both given values are masked (input AND `mask` )` , and the results is than compared and returned. Can be used for Word and Byte as well, by conve...

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `source` | `DWord` | `-` | Source value to compare |
| `compare` | `DWord` | `-` | Value to compare against |
| `mask` | `DWord` | `-` | Mask the data - bits will pass if TRUE or block if FALSE |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `Bool` | Return TRUE if masked values are equal |
