# LGF_ExtractStringFromCharArray (FC / V1.1.0)

- **分类**：Converter operations / String Operations (§4.12.1)
- **中文功能**：根据前后定界标记文本从字符数组中截取匹配的子字符串
- **英文简述**：The function extracts a String specified by a text before and after from an array of characters.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `textBefore` | `String` | `-` | Text in front of the characters which has to be extracted |
| `textAfter` | `String` | `-` | Text behind the characters which has to be extracted |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |
| `extractedString` | `String` | Extracted string |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |

## 输入/输出参数 (In/Out)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `searchIn` | `Variant` | Arrayof Character or Byte to search in |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#0000` | `STATUS_TEXT_FOUND` | Successful, start text and end text were found |
| `16#0000` | `STATUS_NO_ERROR` | Status: Execution finished without errors |
| `16#8200` | `ERR_NO_ARRAY` | Error: No array of Char or Byte is present at the input `searchIn` |
| `16#9001` | `WARNING_ONLY_START` | Unsuccessful, only start text was found, extracted String is filled with characters after start text |
