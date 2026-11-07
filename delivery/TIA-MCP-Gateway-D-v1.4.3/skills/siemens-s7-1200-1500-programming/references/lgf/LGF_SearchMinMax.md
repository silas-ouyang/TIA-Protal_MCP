# LGF_SearchMinMax (FC / V3.0.1)

- **分类**：Math operations (§4.6.17)
- **中文功能**：在通用类型一维数组中查找极大值、极小值及其对应元素下标
- **英文简述**：This function searches, in an array of the data type DInt, for the maximum and minimum value and the respective index in the array. The following data types of the array elements are supported: Int, DInt, UInt, UDInt, USInt, SInt, and Real.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `variableArray` | `Variant` | `-` | Array in whose fields the maximum and minimum are searched |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `Void` | Void - Function has no return value |
| `minValue` | `Variant` | Minimum value found in the array |
| `minValueIndex` | `DInt` | Index of the minimum found value in the array. The start index of the array plus `minValueIndex` results in the array index of the smallest value. The index starts with 0. |
| `maxValue` | `Variant` | Maximum value found in the array |
| `maxValueIndex` | `DInt` | Index of the maximum found value in the array. The start index of the array plus `maxValueIndex` results in the array index of the smallest value. The index starts with 0. |
| `error` | `Bool` | FALSE: No error TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |
| `subfunction` | `Word` | Status or return value of called FB's, FC's and system blocks |
| `S` |  |  |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#0000` | `STATUS_NO_ERROR` | Execution finished without errors |
| `16#8200` | `ERR_NO_ARRAY` | Error: At input `variableArray` the actual parameter is not an array |
| `16#8201` | `ERR_WRONG_TYPE` | Error: The data type of the elements in the array is not supported.<br>Only the data types Int, UInt, DInt, UDInt, USInt, SInt and Real are supported. |
| `16#8202` | `ERR_NOT_EQUAL_TYPES` | Error: The elements of the array do not have the same data type as the outputs `minValue` and<br>`maxValue` |
| `16#8203` | `ERR_MOVE_BLK_VARIANT` | Error: Subfunction `MOVE_BLK_VARIANT` executed with and error - check<br>`subFunctionStatus` code |

## 功能说明与使用要点
- The status of called commands is output in `subFunctionStatus` . In this case, the output value in Note `status` indicates which command caused the error. In this case, refer to the TIA Portal Onli...
- An array of any size is connected via the `variableArray` input. After a data type query in the block, the elements are copied one after the other into a variable of the appropriate type and comp...
- The following data types of the array elements are supported: Note Int, DInt, UInt, UDInt, USInt, SInt, and Real.
- If there are several identical min. or max. values, the index of the first min. or max. value is output. Note
