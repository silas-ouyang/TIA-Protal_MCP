# LGF_StoreMinMax (FB / V3.0.1)

- **分类**：Math operations (§4.6.24)
- **中文功能**：在线持续跟踪并锁存自复位以来输入 LReal 模拟量的历史极值
- **英文简述**：This function reads-in a value of a variable at each call and outputs the maximum and minimum value that has been read in since the first call. The evaluation can be reset if necessary. The block supports the data type LReal.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `value` | `LReal` | `0.0` | Value to be compared with min/max |
| `reset` | `Bool` | `false` | TRUE: The min/max history is reset and the evaluation starts over again. |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `minValue` | `LReal` | Minimum value since first call or `reset`. |
| `maxValue` | `LReal` | Maximum values since first call or `reset`. |
