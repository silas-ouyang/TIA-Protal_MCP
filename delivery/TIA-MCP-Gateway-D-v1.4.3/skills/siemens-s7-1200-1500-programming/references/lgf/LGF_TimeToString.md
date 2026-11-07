# LGF_TimeToString (FC / V3.1.0)

- **分类**：Converter operations (§4.9.23)
- **中文功能**：将系统 Time 持续时间变量转换为易读的文本字符串（String）
- **英文简述**：This function converts a variable of the system data type `Time` into a variable of the data type `String` .

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `timeValue` | `Time` | `-` | Time value to convert |
| `E` | ` | `- |  |
| `separator` | `Char` | `-` | Separator between the components of the output string |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `String` | Converted time as string. Example: `1D3H45M6S0MS` |
| `stringDay` | `String` | Converted dayas string |
| `stringHour` | `String` | Converted hour as string |
| `stringMinute` | `String` | Converted minute as string |
| `stringSecond` | `String` | Converted second as string |
| `stringMilli Second` | `String` | Converted millisecond as string |
