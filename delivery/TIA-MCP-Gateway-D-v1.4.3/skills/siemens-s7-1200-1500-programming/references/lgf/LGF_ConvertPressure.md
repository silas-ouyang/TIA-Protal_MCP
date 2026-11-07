# LGF_ConvertPressure (FC / V1.0.0)

- **分类**：Converter operations (§4.9.2)
- **中文功能**：常用工业压力单位相互换算（支持 Pa、bar、psi、atm、Torr 等）
- **英文简述**：This function converts a given pressure value between different units, by defining both the source and target measurement units.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `pressureValue` | `Real` | `-` | Pressure value to convert |
| `sourceUnit` | `Int` | `-` | 1: Pascal (Pa), 2: HectoPascal (hPa), 3: Bar, 4: Atmospheric physics (atm), 5: Torr (Torr/mmHg), 6: Meter Water Column (mWS), 7: MilliPascal (mPa) |
| `targetUnit` | `Int` | `-` | 1: Pascal (Pa), 2: HectoPascal (HPa), 3: Bar, 4: Atmospheric physics (atm), 5: Torr (Torr/mmHg), 6: Meter Water Column (mWS), 7: MilliPascal (mPa) |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `Real` | converted pressure result |
| `error` | `Bool` | if Error := True |
| `status` | `Word` | status code for error description |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#8200` | `ERR_WRONG_SOURCE_UNIT` | Error: wrong source unit selected, conversion do not exist |
| `16#8201` | `ERR_WRONG_TARGET_UNIT` | Error: wrong target unit selected, conversion do not exist |
