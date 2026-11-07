# LGF_Boxplot_LReal (FB / V3.0.3)

- **分类**：Measurement operations (§4.16.7)
- **中文功能**：统计分析 LReal 浮点样本箱线图特征值（极值、四分位数与中位数）
- **英文简述**：If you want to get an overview of existing data, you can use a Boxplot diagram. A Boxplot shows you in which area the data is located and how it is distributed over this area. A Boxplot consists of the following parameters: - Minimum (sm...

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `execute` | `Bool` | `FALSE` | Activation of the calculation with each positive edge. |
| `rangeOutlier` | `LReal` | `1.5` | Outlier detection: * 0: Outlier detection is deactivated * 0-1: Invalid value * >1: Outlier detection is activated. |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `error` | `Bool` | FALSE: No error TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |
| `subfunction Status` | `Word` | Status or return value of called FB's, FC's and system blocks |
| `outlierMax` | `LReal` | Upper outliers in %. |
| `max` | `LReal` | Maximum Value, not an outlier. |
| `q75` | `LReal` | 3rd quartile or Q75 of the data series. |
| `median` | `LReal` | 2nd quartile or Median of the data series. |
| `q25` | `LReal` | 1st quartile or Q25 of the data series. |
| `min` | `LReal` | Minimum Value, not an outlier. |
| `outlierMin` | `LReal` | Lower outliers in %. |
| `skewness` | `LReal` | Skewness of the data series. |

## 输入/输出参数 (In/Out)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `values` | `Array[*] of LReal` | The array containing the data series that is to be used for the calculation |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#0000` | `STATUS_EXECUTION_FINISHED` | Status: Execution finished without errors |
| `16#7000` | `STATUS_NO_CALL` | Status: No call of FB.<br>The block waits for activation through the parameter `enable`. |
| `16#7001` | `STATUS_FIRST_CALL` | Status: First call of FB after enabling |
| `16#8200` | `ERR_NEG_ARR_BOUND` | Error: Negative array boundary not allowed.<br>Check the array at the input `values`. |
| `16#8600` | `ERR_SHELL_SORT` | Error: Error in command `LGF_ShellSort_LReal`.<br>Check `subFunctionStatus` code |
| `16#9101` | `ERR_RANGE_NOT_OK` | Error: The parameter `rangeOutlier` type is invalid.<br>Enter a valid `rangeOutlier` value for the parameter:<br>* 0: Outlier detection is deactivated<br>* >1 Valid value. |

## 功能说明与使用要点
- The block sorts the data series and then calculates the so-called “five-point summary”:
- Table: Five-point summary
- If outlier detection is activated, the block first calculates the limits. From these limit values, the values are recognized as outliers:
- 𝐵𝑜𝑢𝑛𝑑<sup>𝑢𝑝𝑝𝑒𝑟</sup> = 𝑞75 + 𝑟𝑎𝑛𝑔𝑒𝑂𝑢𝑡𝑙𝑖𝑒𝑟⋅(𝑞75 −𝑞25)
- 𝐵𝑜𝑢𝑛𝑑𝑙𝑜𝑤𝑒𝑟 = 𝑞25 −𝑟𝑎𝑛𝑔𝑒𝑂𝑢𝑡𝑙𝑖𝑒𝑟⋅(𝑞75 −𝑞25)
- The block then calculates new values for the parameters `max` and `min` , which lie within the outlier limits. The outliers are counted and output as a percentage.
- To make it easier to judge how the data is distributed, the block also calculates the skew. The skewness lies between the values `-1` and `1` with the following meaning:
- - `-1` : extremely left skewed distribution
- - `0` : symmetrical distribution
- - `1` : extreme right-skew distribution
- The elements of the passed array are sorted in ascending order by the block. The `LGF_Shellsort_LReal` block is used for sorting.
- The parameters are calculated as follows:
- Table: Boxplot formulas Parameters Formula
- 𝑛 := number of samples (size of array)
- If the result of the element to be determined (from which the quartiles can be derived) is not an integer, the quartile is calculated from the linear fraction between the two adjacent samples.
- skewness (𝑞75 + 𝑞25) −2 ⋅𝑞50 𝑠𝑘𝑒𝑤𝑛𝑒𝑠𝑠= 𝑞75 −𝑞25
- Note: This is just an approximation.
