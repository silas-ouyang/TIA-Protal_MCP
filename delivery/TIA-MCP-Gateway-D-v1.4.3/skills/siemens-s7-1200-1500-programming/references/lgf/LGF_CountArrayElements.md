# LGF_CountArrayElements (FC / V1.0.0)

- **分类**：Counter operations (§4.4.2)
- **中文功能**：动态读取一维变长数组（Variant）的元素总个数（零基计数）
- **英文简述**：Count the number of array elements and returns the number of elements zero based (Array[0..x] of Type).

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `array` | `Variant` | `-` | Input arrayto check for number of elements |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `DInt` | Number of elements in array (zero based); Returning `-1` if input variable is not type `array`; Returning `-2` if input variable is type `bool`; |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `-1` | `RETURN_NO_ARRAY` | No array is present at the input `array` |
| `-2` | `RETURN_NO_BOOL_ARRAYS_NOT_SUPPORTED` | Boolean arrays not supported |
