# LGF_ExtractStringFromCharArrayAdv (FC / V1.1.0)

- **分类**：Converter operations / String Operations (§4.12.2)
- **中文功能**：带起始偏移与长度约束等高级选项从字符数组中截取子字符串
- **英文简述**：The function extracts a String specified by a text before and after from an array of characters with extended options.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `textBefore` | `String` | `-` | Text in front of the characters which has to be extracted |
| `textAfter` | `String` | `-` | Text behind the characters which has to be extracted |
| `includeBefore After` | `Bool` | `-` | TRUE: `textBefore` and `textAfter` are included in the extracted string |
| `startPos` | `DInt` | `-` | Position within the arrayto start search from(index zero based) |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `Word` | Return value: 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |
| `extractedString` | `String` | Extracted string |
| `position` | `DInt` | Position(index)within the arraywhere text begins(index zero based) |
| `length` | `Int` | Length of text that was extracted |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |

## 输入/输出参数 (In/Out)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `searchIn` | `Variant` | Array of Character or Byte to search in |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
