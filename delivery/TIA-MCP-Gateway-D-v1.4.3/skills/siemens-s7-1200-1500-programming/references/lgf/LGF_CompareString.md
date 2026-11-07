# LGF_CompareString (FC / V1.0.0)

- **分类**：Comparator operations (§4.5.4)
- **中文功能**：按字符字典序比对两个字符串大小并返回关系结果数值编码
- **英文简述**：Compares two strings and returns a number which indicates the result of the comparison.

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `SInt` | Return values: left < right := -1; |
| `l` |  |  |

## 输入/输出参数 (In/Out)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `left` | `String` | Left / first stringto compare |
| `right` | `String` | Right / second string to compare |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `0` | `RETURN_STRINGS_ARE_EQUAL` | Strings are equal |
| `1` | `RETURN_STRING_LEFT_GREATER_THAN_RIGHT` | Left string is greater than right string |
| `-1` | `RETURN_STRING_LEFT_LESS_THAN_RIGHT` | Left string is less than right string |
