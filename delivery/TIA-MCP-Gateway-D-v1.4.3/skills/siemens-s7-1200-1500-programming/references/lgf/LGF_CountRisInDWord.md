# LGF_CountRisInDWord (FB / V3.0.1)

- **分类**：Counter operations (§4.4.5)
- **中文功能**：从高位到低位检索统计 DWORD 变量中 0 到 1 上升沿序列总次数
- **英文简述**：The function analyzes a variable of the type DWORD and outputs how often a 0-1 sequence (rising edge) occurs in the variable.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `value` | `DWord` | `16#00000000` | Input Double word in which the rising edges are counted |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `numberOfEdges` | `Int` | Number of rising edges in the DWord |

## 功能说明与使用要点
- In a variable of the data type DWORD, the block counts the rising edges (0-1 transitions) from left to right. The output `countRisInDWord` outputs the number of rising edges.
- So that rising edges at the variable limit are also detected, the input `value` is copied to the static variable `statDWordPrevCycle` at the end of the evaluation and evaluated in the next cycle.
