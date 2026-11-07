# LGF_ConvertTemperature (FC / V3.0.1)

- **分类**：Converter operations / Temperature (§4.13.3)
- **中文功能**：通用温度单位转换器（支持 °C、°F、K、°R 之间按模式自由切换）
- **英文简述**：This function converts a temperature value from one into another unit by using an appropriate given `mode` parameter.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `mode` | `Int` | `-` | 1: Celsius to Fahrenheit, 2: Fahrenheit to Celsius, 3: Celsius to Kelvin, 4: Kelvin to Celsius, 5: Fahrenheit to Kelvin, 6: Kelvin in Fahrenheit, 7: Rankine to Kelvin, 8: Kelvin to Rankine |
| `value` | `Real` | `-` | Temperature value to be converted |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `Real` | Converted temperature result |
| `error` | `Bool` | FALSE: No error TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#8200` | `ERR_WRONG_MODE` | Error: Incorrect mode on input “mode”, |
