# LGF_CompareLRealByPrecision (FC / V3.0.2)

- **分类**：Comparator operations (§4.5.3)
- **中文功能**：按用户自定义浮点绝对精度（precision）比对两个 LReal 是否相等
- **英文简述**：This function checks floating point numbers for equality, by using an approximation formula and a fixed precision by constant 1.0E-12 (pico)

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `valueA` | `LReal` | `-` | First LREAL number to be compared. |
| `valueB` | `LReal` | `-` | Second LREAL number to be compared. |
| `precision` | `LReal` | `-` | Accuracy with which the two values are compared. |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `Bool` | FALSE: not equal TRUE: approximately the same |

## 功能说明与使用要点
- The comparison of the LREAL numbers is based on an given accuracy at the parameter `precision` .` The difference between the two input values must be smaller than the `precision accuracy value ...
- Equation:
