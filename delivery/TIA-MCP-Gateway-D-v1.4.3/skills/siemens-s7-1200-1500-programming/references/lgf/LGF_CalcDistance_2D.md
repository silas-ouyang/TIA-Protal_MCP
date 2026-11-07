# LGF_CalcDistance_2D (FC / V3.0.1)

- **分类**：Math operations (§4.6.1)
- **中文功能**：根据两点平面坐标（X, Y）计算二维空间欧几里得几何距离
- **英文简述**：The function calculates the distance between two points in the plane.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `x1` | `LReal` | `-` | X coordinate point 1 |
| `y1` | `LReal` | `-` | Y coordinate point 1 |
| `x2` | `LReal` | `-` | X coordinate point 2 |
| `y2` | `LReal` | `-` | Y coordinate point 2 |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `LReal` | Calculated distance between the Points |

## 功能说明与使用要点
- The block calculates the distance between two points in a Cartesian coordinate system. The distance is calculated with the following formula:
- Figure: Graphical representation
