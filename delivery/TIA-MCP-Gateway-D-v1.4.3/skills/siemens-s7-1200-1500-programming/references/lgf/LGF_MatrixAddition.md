# LGF_MatrixAddition (FC / V3.0.1)

- **分类**：Math operations / Matrix (§4.7.1)
- **中文功能**：计算两个相同维度的二维 LReal 矩阵元素逐项相加并输出矩阵
- **英文简述**：This block adds two matrices of equal size of the data type `ARRAY[*,*] of LREAL` .` The individual fields of the two incoming matrices are read, added and then output in the matrix `matrixResult . Note that all input and output matr...

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `Void` | Void - Function has no return value |
| `error` | `Bool` | FALSE: No error TRUE: An error occurred duringthe execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |

## 输入/输出参数 (In/Out)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `matrix1` | `Array[*, *] of L Real` | First summand (matrix) |
| `matrix2` | `Array[*, *] of L Real` | Second summand (matrix) |
| `matrixResult` | `Array[*, *] of L Real` | Sum of the matrices |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
