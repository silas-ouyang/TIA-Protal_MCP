# LGF_IsNumber (FC / V1.0.0)

- **分类**：Math operations (§4.6.4)
- **中文功能**：校验 LReal 浮点数是否为有效数值（排除非数 NaN 与无穷大 INF）
- **英文简述**：This function proves a LReal datatype for a valid number and numeric range.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `number` | `LReal` | `-` | Number to validate |
| `validRangeMin` | `LReal` | `-` | Minimum real number for valid range |
| `validRangeMax` | `LReal` | `-` | Maximum real number for valid range |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `Bool` | TRUE: Is real number |
| `F` |  |  |
