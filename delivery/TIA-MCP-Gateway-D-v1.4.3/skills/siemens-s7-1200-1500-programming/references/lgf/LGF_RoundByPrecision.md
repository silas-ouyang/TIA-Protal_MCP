# LGF_RoundByPrecision (FC / V1.0.0)

- **分类**：Math operations (§4.6.15)
- **中文功能**：将双精度浮点数（LReal）按指定小数位精度进行四舍五入规整
- **英文简述**：This function rounds a floating-point number (LReal) to a specified number of decimal places.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `number` | `LReal` | `-` | Value to be rounded |
| `precisionDecimal` | `UInt` | `-` | Number of decimal places to round the number (1,2,3) |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `LReal` | Number rounded with the number of decimal places selected |

## 功能说明与使用要点
- This function rounds a floating-point number (LReal) to a specified number of decimal places. It scales the value, truncates it to an integer, and then re-scales it to produce the rounded result.
