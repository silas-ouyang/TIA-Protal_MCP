# LGF_CompareLReal (FC / V3.0.2)

- **分类**：Comparator operations (§4.5.2)
- **中文功能**：采用 1.0E-12 固定皮秒级容差比对两个 LReal 双精度浮点数
- **英文简述**：This function checks floating point numbers for equality, by using an approximation formula and a fixed precision by constant 1.0E-12 (pico)

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `valueA` | `LReal` | `-` | First LREAL number to be compared. |
| `valueB` | `LReal` | `-` | Second LREAL number to be compared. |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `Bool` | FALSE: not equal TRUE: approximately the same |

## 功能说明与使用要点
- The comparison of the LREAL numbers is based on an fixed accuracy of 1.0E-12. The difference between the two input values must be smaller than the `PRECISION` accuracy multiplied by one of the tw...
- Equation:
- If your application requires a different accuracy when comparing the numbers, adapt the “PRECISION” Note constant in the function to your requirements. Or you may use the FC LGF_CompareLRealByPrec...
