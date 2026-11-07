# LGF_RegressionLine (FC / V3.0.1)

- **分类**：Measurement operations (§4.16.3)
- **中文功能**：采用最小二乘法对散点数据进行一元线性回归拟合（斜率与截距）
- **英文简述**：The simplest case of a regression is the regression line. This means that the assumed relationship between the input and output signal is a linear straight line. Figure: Regression line

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `Void` | Void - Function has no return value |
| `slope` | `LReal` | Gradient of straight line |
| `intercept` | `LReal` | The intersection with the Y axis |
| `error` | `Bool` | FALSE: No error TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB |
| `1` |  |  |

## 输入/输出参数 (In/Out)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `values` | `Array[*] of LGF _typeRegression Line` | The data points are transferred with their X- and Y-values. The data type `LGF_typeRegressionLine` has the following structure: • x (Real) • y (Real) |
| ` | ` |  |
| ` | ` |  |

## 功能说明与使用要点
- The block calculates the regression line with the following line equation:
- 𝑓(𝑥) = 𝑚⋅𝑥+ 𝑡
- 𝑚: Gradient of straight line 𝑡: Intersection with y-axis 𝑁: number of array elements
- The gradient 𝑚 is calculated using the following equation:
- The intersection 𝑡 with the Y axis is calculated using the following equation:
