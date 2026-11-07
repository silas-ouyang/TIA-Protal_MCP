# LGF_Impulse (FB / V3.0.1)

- **分类**：Signal generators (§4.14.4)
- **中文功能**：按设定触发频率输出单 PLC 扫描周期宽度的单次时钟脉冲信号
- **英文简述**：This function generates pulses at a given frequency. The pulse is always present for one (control) cycle.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `frequency` | `Real` | `0.0` | Clock frequency in Hz |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `impulse` | `Bool` | Impulse signal output |
| `countdown` | `Time` | Time until next pulse |

## 功能说明与使用要点
- The function generates pulses at the output `impulse` with the frequency `frequency` .
- The block always begins with a pulse and sets the next pulse after the period that has elapsed.
