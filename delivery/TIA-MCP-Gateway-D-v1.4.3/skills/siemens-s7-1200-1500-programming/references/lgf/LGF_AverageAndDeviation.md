# LGF_AverageAndDeviation (FC / V3.0.1)

- **分类**：Measurement operations (§4.16.1)
- **中文功能**：一次性计算数值数组中全部采样数据的算术平均值与样本标准差
- **英文简述**：This function calculates the arithmetic mean and the standard deviation from a series of numbers.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `variableArray utput parameter` | `Array[*] of LReal` | `-` | Sequence of numbers to calculate with |
| `Identifier` | `Data type` | `-` | Description |
| `Ret_Val` | `Void` | `-` | Void - Function has no return value |
| `arithmetic Average` | `LReal` | `-` | Calculated arithmetic average value |
| `standard Deviation` | `LReal` | `-` | Calculated standard deviation |

## 功能说明与使用要点
- An array of any size is connected via the `variableArray` input. After reading-out the array boundaries, the arithmetic mean value and the standard deviation will be calculated from the values an...
- **注意**：[Note] An array with too many elements can cause the cycle monitoring time to be exceeded.
