# LGF_ScaleLinear (FC / V3.0.1)

- **分类**：Math operations (§4.6.16)
- **中文功能**：工业模拟量两点线性标定换算（带上下限限幅与超限报警标志）
- **英文简述**：This function scales an input variable ( `LReal` ) via a linear straight-line equation.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `x` | `LReal` | `-` | Input value `x` to be scaled. |
| `x1` | `LReal` | `-` | Point 1(P1)-`x` coordinate of the linear function. |
| `y1` | `LReal` | `-` | Point 1(P1)-`y` coordinate of the linear function. |
| `x2` | `LReal` | `-` | Point 2 (P2) -`x` coordinate of the linear function. |
| `y2` | `LReal` | `-` | Point 2 (P2) -`y` coordinate of the linear function. |
| `yMin` | `LReal` | `-` | Lower limit value of the output. |
| `yMax` | `LReal` | `-` | High limit value of the output. |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `LReal` | Scaled output value `y` |
| `error` | `Bool` | FALSE: No error TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#0000` | `STATUS_FINISHED_NO_ERROR` |  |

## 功能说明与使用要点
- The function linearly scales an input variable (e.g. an analog input value) to a specific output variable (e.g. level).
- To determine the output variable, the following linear equation is used in the function:
- The straight line is described by the two points, P1 and P2. You specify the points as a Cartesian coordinate system using x and y coordinates.
- **注意**：[Note] If the values of the parameters `x1` and `x2` are the same, the value of `y1` is output on output `y` . By specifying `yMin` and `yMax` you can restrict the calculated value of `y` to a range limited at top...
