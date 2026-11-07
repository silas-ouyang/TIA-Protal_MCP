# LGF_ToLower (FC / V1.0.0)

- **分类**：Converter operations / String Operations (§4.12.4)
- **中文功能**：将输入字符串中的所有英文字母统一转换为对应的小写形式
- **英文简述**：This function converts the capital letters of a string into their lower case equivalents.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `In` | `String` | `-` | Stringinput |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `String` | Resulting string, after the conversion |

## 功能说明与使用要点
- The conversion of a string to lower case is replacing upper case characters with their lower case counterparts. Within the ASCII table the upper case characters are at a lower index to their lower ...
- That means the conversion is simply an addition of 32 (20hex) to the ASCII code in question. ASCII codes which are between ‘A’ and ‘Z’ are going to be replaced.
