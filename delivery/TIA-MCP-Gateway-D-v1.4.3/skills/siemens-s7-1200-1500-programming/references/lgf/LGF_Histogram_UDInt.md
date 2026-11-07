# LGF_Histogram_UDInt (FB / V3.0.3)

- **分类**：Measurement operations (§4.16.13)
- **中文功能**：统计分析 UDInt 样本数据的频数直方图分布（自动解算组宽与频次）
- **英文简述**：The histogram shows the frequency distribution of a sample by class. A class describes a value interval in which the individual frequencies are added together. After specifying the number of classes, the class width and the respective cl...

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `execute` | `Bool` | `FALSE` | Activation of the calculation with each positive edge. |
| `numberOfClasses` | `UInt` | `0` | Number of desired classes. |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `error` | `Bool` | FALSE: No error TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |
| `subfunction Status` | `Word` | Status or return value of called FB's, FC's and system blocks |
| `histValues` | `Array[0..1, 0..# CLASSES_COUNTE R_ UP_LIMIT] of L Real` | Outputs the calculated values in a two-dimensional array. • `histValues[0,0..14]` displays the relative frequency of the individual classes. • `histValues[1,0..14]` displays the class centers. • If fewer than 15 classes are desired, the array elements that are not required are output with 0. |
| `axis` | `Array[0..3] of L Real` | Specifies the axis values: • Lower X axis value • Upper X axis value • Lower Y axis value • Upper Y axis value |
| `classWidth` | `LReal` | Returns the calculated class width. |

## 输入/输出参数 (In/Out)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `values` | `Array[*] of UDInt` | The array containing the data series that is to be used for the calculation |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#0000` | `STATUS_EXECUTION_FINISHED` | Status: Execution finished without errors |
| `16#7000` | `STATUS_NO_CALL` | Status: No call of FB.<br>The block waits for activation through the parameter `enable`. |
| `16#7001` | `STATUS_FIRST_CALL` | Status: First call of FB after enabling |
| `16#8600` | `ERR_SHELL_SORT` | Error: Error in command `LGF_ShellSort_UDInt`.<br>Check `subFunctionStatus` code |
| `16#9101` | `ERR_WRONG_NO_CLASSES` | Error: Incorrect number of classes.<br>Give the parameter `numberOfClasses` a valid value (1 to 15). |

## 功能说明与使用要点
- The block sorts the transferred data and calculates the general class width using the transferred class count and data range. The block then counts the values that lie within a class. In order to d...
- The elements of the passed array `values` are sorted in ascending order by the block. The `LGF_Shellsort_UDInt` block is used for sorting.
- The number of classes can be specified using the following rule of thumb:
- 𝑁𝑢𝑚𝑏𝑒𝑟 𝑜𝑓 𝑐𝑙𝑎𝑠𝑠𝑒𝑠= √𝑛𝑢𝑚𝑏𝑒𝑟 𝑜𝑓 𝑒𝑙𝑒𝑚𝑒𝑛𝑡𝑠
- e.g. 100 values –> 𝑁𝑢𝑚𝑏𝑒𝑟 𝑜𝑓 𝑐𝑙𝑎𝑠𝑠𝑒𝑠= √100 = 10
