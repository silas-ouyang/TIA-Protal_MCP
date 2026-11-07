# LGF_SimpleAveraging (FB / V1.0.0)

- **分类**：Math operations (§4.6.23)
- **中文功能**：循环或触发采集 LReal 浮点数值序列的动态算术平均值滤波
- **英文简述**：This function calculates a moving arithmetic mean from LReal values. The method can be used to smooth data series; the values can be read in cyclically or triggered.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `cyclicExecution` | `Bool` | `FALSE` | TRUE: cyclic operation, trigger not in use |
| `trigger` | `Bool` | `FALSE` | Rising edge: Read in `value` with every pulse at input `trigger` |
| `reset` | `Bool` | `FALSE` | TRUE: The block is reset and the calculation starts again. |
| `value` | `LReal` | `0.0` | Value/s from which the moving average is to be determined. |
| `windowSize` | `USInt` | `5` | Window length for averaging in the range from 1..255 |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `average` | `LReal` | Moving/ Floatingaverage |
| `overflow unctional d` | `Bool escription` | TRUE: Overflow detected in the calculation |
| `Note` | `The block`LGF_SimpleAver` types other than LReal, eith during compilation. You can find further inform section of the TIA Portal or u https://support.industry.sie` | `aging`does not query the data type for the input parameter`value`. For dat er an implicit conversion is performed automatically or an error is generated ation in the Chapter “Overview of Data Type Conversion” in the Online Help nder: mens.com/cs/ww/en/view/109773506/100611494667 |

## 功能说明与使用要点
- `The block` `LGF_SimpleAveraging` does not query the data type for the input parameter` `value` . For data` Note types other than LReal, either an implicit conversion is performed automatically o...
- The block calculates the (moving) average based on the set `windowSize` .` If `windowSize is set to 𝑤𝑖𝑛𝑑𝑜𝑤𝑆𝑖𝑧𝑒< 1, the value is passed through without averaging.
- There are two options for reading the values:
- - With the `cyclicExecution` input, the values are read and calculated cyclically.
- - With the `Trigger` input, the values are read and calculated with each pulse.
- - If the calculation reaches the value range limits of `LReal` ,` the output `overflow is set.
