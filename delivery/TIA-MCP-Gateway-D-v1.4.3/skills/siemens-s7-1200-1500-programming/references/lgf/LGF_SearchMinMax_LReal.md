# LGF_SearchMinMax_LReal (FC / V3.0.2)

- **分类**：Math operations (§4.6.19)
- **中文功能**：在 LReal 双精度浮点数组中检索最大值、最小值及其对应数组索引
- **英文简述**：This function searches, in an array of the data type LReal, for the maximum and minimum value and the respective index in the array.

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `Void` | Void - Function has no return value |
| `minValue` | `LReal` | Minimum value found in the array |
| `minValueIndex` | `DInt` | Index of the minimum found value in the array. The start index of the array plus `minValueIndex` results in the array index of the smallest value. The index starts with 0. |
| `maxValue` | `LReal` | Maximum value found in the array |
| `maxValueIndex` | `DInt` | Index of the maximum found value in the array. The start index of the array plus `maxValueIndex` results in the array index of the smallest value. The index starts with 0. |

## 输入/输出参数 (In/Out)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `values` | `Array[*] of LReal` | Array in whose fields the maximum and minimum are searched |

## 功能说明与使用要点
- An array of any size is connected via the `values` input. The elements are then compared in turn. The smallest and largest values, as well as their corresponding index are output to the array.
- Note
- If there are several identical min. or max. values, the index of the first min. or max. value is output.
