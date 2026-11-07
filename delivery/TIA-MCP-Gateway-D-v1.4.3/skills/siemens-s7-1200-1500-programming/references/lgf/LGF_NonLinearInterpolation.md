# LGF_NonLinearInterpolation (FB / V3.0.1)

- **分类**：Technology operations (§4.15.3)
- **中文功能**：基于离散折线点表实现多段非线性曲线查表与线性插值计算
- **英文简述**：This function implements a characteristic curve. The characteristic curve is defined via an interpolation point table with linear interpolation between the interpolation points. A prescribed input value generates an output value in each ...

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `value` | `LReal` | `0.0` | Input value for calculating the output value over the defined characteristic curve. |
| `defaultOutValue` | `LReal` | `0.0` | Value for pre-assignment of the output variable (`outputValue` = `defaultOutValue`) |
| `enDefaultOut Value` | `Bool` | `FALSE` | Assign default output value (`outputValue` = `defaultOutValue`) |
| `track` | `Bool` | `FALSE` | The value of the output `outputValue` follows the value of the input `value` without using the characteristic curve as long as this input is set. (`outputValue` = `value`) |
| `reset` | `Bool` | `FALSE` | If the interpolation point table is changed in running operation, the input `reset` must be activated afterwards. Otherwise, the block cannot guarantee correct execution. (`outputValue` = 0.0) |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `outputValue` | `LReal` | The output value that has been calculated from the input value over the defined characteristic curve. |

## 输入/输出参数 (In/Out)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `setpoints` | `Array[*] of LGF _typeNonLin Setpoints` | Setpoint point table for defining the characteristic curve (polynomial) |

## 功能说明与使用要点
- The value of the output `outputValue` based on the following priority:
- 1. As long as the input `enDefaultOutValue` is set, the value defined via the parameter `defaultOutValue` will be output as output value.
- 2. As long as the input `reset` is set, the block is reset and the output value is `0.0` .
- 3. If the input `track` is set, the output value will be output directly as input value, without consideration of the characteristic curve.
- 4. Based on the input value, a characteristic curve value is calculated via the linearly interpolated, interpolation point table and output as an output value.
- - If the input value is between two interpolation points within the interpolation point table, the output value is calculated as the intersection with the connecting line between the preceding and ...
- - If the input value is before the first interpolation point (lowest value defined in the interpolation point table), the output value will be calculated as the intersection of the line formed by t...
- - If the input value is after the last interpolation point (highest value defined in the interpolation point table), the output value will be calculated as the intersection of the line formed by th...
