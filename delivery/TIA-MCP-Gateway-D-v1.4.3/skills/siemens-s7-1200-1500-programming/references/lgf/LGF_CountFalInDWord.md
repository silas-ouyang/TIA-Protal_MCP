# LGF_CountFalInDWord (FB / V3.0.1)

- **分类**：Counter operations (§4.4.4)
- **中文功能**：从高位到低位检索统计 DWORD 变量中 1 到 0 下降沿序列总次数
- **英文简述**：The function analyzes a variable of the type DWORD and outputs how often a 1-0 sequence (falling edge) occurs in the variable.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `value` | `DWord` | `16#00000000` | Input Double word in which the falling edges are counted |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `numberOfEdges` | `Int` | Number of falling edges in the DWord |

## 功能说明与使用要点
- In a variable of the data type DWORD, the block counts the falling edges (1-0 transitions) from left to right. The output `countFalInDWord` outputs the number of falling edges.
- So that falling edges at the variable limit are also detected, the input `value` is copied to the static variable `statDWordPrevCycle` at the end of the evaluation and evaluated in the next cycle.
