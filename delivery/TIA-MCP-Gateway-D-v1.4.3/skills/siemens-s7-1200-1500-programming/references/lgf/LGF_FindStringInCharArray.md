# LGF_FindStringInCharArray (FC / V1.1.0)

- **分类**：Converter operations / String Operations (§4.12.3)
- **中文功能**：在字符数组中检索目标子字符串并返回其首字符起始下标索引
- **英文简述**：The function searches for a specified String within an array of  characters. Returning the position of the String in the Array, if the string is not found the return value is `-1` .

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `searchFor` | `String` | `-` | Text that is searched for |
| `startPos` | `DInt` | `-` | Position within the arrayto start search from(index zero based) |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `DInt` | Position (index) of the first character of the text that is searched for within the input array (index zero based). Return `-1` if nothing found. |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |

## 输入/输出参数 (In/Out)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `searchIn` | `Variant` | Array of Character or Byte to search in |

