# LGF_GetFactorial (FC / V3.0.1)

- **分类**：Math operations (§4.6.3)
- **中文功能**：计算自然数的阶乘（0!~12!），计算结果以 DInt 整数输出
- **英文简述**：The function calculates the faculty of a natural number (ℕ!) and returns the result. The permissible value range of the input parameter `naturalNumber` is between 0 and 12, as 12 is the maximum factorial result fitting into a DInt type

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `naturalNumber` | `Int` | `-` | Natural number (0..12) |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `DInt` | Calculated factorial |
| `error` | `Bool` | FALSE: No error TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |
| ` | ` |  |
| ` | ` |  |
