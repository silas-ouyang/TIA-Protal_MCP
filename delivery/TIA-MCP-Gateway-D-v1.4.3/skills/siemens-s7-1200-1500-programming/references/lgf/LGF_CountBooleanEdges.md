# LGF_CountBooleanEdges (FB / V1.0.0)

- **分类**：Counter operations (§4.4.3)
- **中文功能**：在设定监控时间窗口内统计输入布尔信号的单脉冲或多次边沿
- **英文简述**：This function evaluates a input signal for different states in a certain amount of time. The states are: - One edge and input present over the whole monitoring time - Single edge - Double edge - N-Edges in between the monitoring time The...

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `trigger` | `Bool` | `FALSE` | Trigger to evaluate signal signal(risingedges) |
| `monitorTime` | `Time` | `T#1s` | Time to monitor fand count edges on `trigger` input |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `single` | `Bool` | Single edge until monitoring time expires |
| `double` | `Bool` | Two edges in between the monitoringtime |
| `long` | `Bool` | Just a single edge in the monitoring time, the `trigger` input stays TRUE after the edge appears |
| `severalEdges` | `Bool` | Numeros Edges occure within the monitoring time, see `noOfEdges` to get the number of edges |
| `noOfEdges` | `USInt` | Number of edges in between the monitoring time frame |
