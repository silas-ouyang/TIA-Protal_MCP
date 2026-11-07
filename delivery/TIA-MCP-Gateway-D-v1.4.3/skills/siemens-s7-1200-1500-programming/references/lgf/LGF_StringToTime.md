# LGF_StringToTime (FC / V3.1.0)

- **分类**：Converter operations (§4.9.21)
- **中文功能**：将持续时间文本字符串（如 'T#5s'）解析转换为系统 Time 变量
- **英文简述**：The function converts a variable of the data type `String` into a variable of the system data type `Time` .

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `timeValue` | `String` | `-` | Time to be converted as string. MUST have SEPARATOR. Example: `1D-3H-45M-6S-0MS` |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `Time` | Converted time value |
| `E` |  |  |
