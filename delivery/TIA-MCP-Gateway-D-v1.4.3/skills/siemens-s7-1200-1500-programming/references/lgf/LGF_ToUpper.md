# LGF_ToUpper (FC / V1.0.0)

- **分类**：Converter operations / String Operations (§4.12.5)
- **中文功能**：将输入字符串中的所有英文字母统一转换为对应的大写形式
- **英文简述**：This function converts the lowercase letters of a string into their capital equivalents.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `In` | `String` | `-` | Stringinput |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `String` | Resulting string, after the conversion |

## 功能说明与使用要点
- The conversion of a string to upper case is replacing lowerer case characters with their upper case counterparts. Within the ASCII table the upper case characters are at a lower index to their lowe...
- That means the conversion is simply a subtraction of 32 (20hex) from the ASCII code in question. ASCII codes which are between ‘a’ and ‘z’ are going to be replaced.
