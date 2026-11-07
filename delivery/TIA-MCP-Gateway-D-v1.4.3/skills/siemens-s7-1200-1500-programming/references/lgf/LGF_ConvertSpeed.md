# LGF_ConvertSpeed (FC / V1.0.0)

- **分类**：Converter operations (§4.9.3)
- **中文功能**：常用线速度与旋转速度单位相互换算（m/s、km/h、rpm、knot 等）
- **英文简述**：This function converts a given speed value in another unit by using an appropriate mode

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `mode` | `Int` | `-` | 1: MeterSecond_to_KilometerHour, 2: MeterSecond_to_Knot, 3: MeterSecond_to_MileHour, 4: KilometerHour_to_MeterSecond, 5: KilometerHour_to_Knot, 6: KilometerHour_to_MileHour, 7: Knot_to_MeterSecond, 8: Knot_to_KilometerHour, 9: Knot_to_MileHour, 10: MileHour_to_MeterSecond, 11: MileHour_to_KilometerHour, 12: MileHour_to_Knot |
| `value` | `Real` | `-` | Speed value to convert |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `Real` | converted speed result |
| `error` | `Bool` | if Error := True |
| `status` | `Word` | status code for error description |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#8200` | `ERR_WRONG_MODE` |  |
