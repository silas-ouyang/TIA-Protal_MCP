# LGF_DelayProgram (FB / V1.0.0)

- **分类**：Date and timer operations (§4.2.6)
- **中文功能**：阻塞式空循环延时块，用于人工增加 PLC 负荷以模拟高负载工况
- **英文简述**：Blocking delay to increase/extent PLC Load to simulate program load.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `delay` | `Time` | `T#1MS` | Time by which the program is delayed |

## 功能说明与使用要点
- The function extends the PLC cycle by the time specified at the `delay` input. Thus makes it easy to simulate PLC program load by increasing the cycle time.
- The function achieves the cycle time extension by blocking the cycle for the specified time. Use this only to simulate program load and not in productive environments. WARNING
