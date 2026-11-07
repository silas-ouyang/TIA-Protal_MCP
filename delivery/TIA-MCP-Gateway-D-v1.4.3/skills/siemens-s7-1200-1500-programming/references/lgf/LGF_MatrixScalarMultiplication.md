# LGF_MatrixScalarMultiplication (FC / V3.0.2)

- **分类**：Math operations / Matrix (§4.7.5)
- **中文功能**：将二维 LReal 矩阵中的每一个元素与标量常数系数逐项相乘
- **英文简述**：This function block multiplies a matrix of the data type `ARRAY[*,*] of LREAL` with a scalar. Example for 2x2 matrix: A matrix is multiplied by a scalar, thereby multiplying each matrix element by the scalar. The result is output in th...

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `scalar` | `LReal` | `-` | Scalar value where the matrix is multiplied |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `Void` | Void - Function has no return value |
| `error` | `Bool` | FALSE: No error TRUE: An error occurred duringthe execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |

## 输入/输出参数 (In/Out)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `matrixInput` | `Array[*, *] of L Real` | Matrix to multiply |
| `matrixResult` | `Array[*, *] of L Real` | The result matrix of the multiplication |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |

- **注意**：[Note] Note that the input and output matrix must have the same number of columns and rows.
