# LGF_MatrixMultiplication (FC / V3.0.1)

- **分类**：Math operations / Matrix (§4.7.4)
- **中文功能**：执行两个二维 LReal 矩阵的标准代数乘法运算（M*K 乘以 K*N）
- **英文简述**：This function multiplies two matrices of the data type `ARRAY[*,*] of LREAL` . Example for 2x2 matrix: The block multiplies two matrices of variable size. The individual elements of the two incoming matrices are read, multiplied, and t...

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `Void` | Void - Function has no return value |
| `error` | `Bool` | FALSE: No error TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |

## 输入/输出参数 (In/Out)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `matrix1` | `Array[*, *] of L Real` | First factor: Matrix to multiply |
| `matrix2` | `Array[*, *] of L Real` | Second factor: Matrix to multiply |
| `matrixResult` | `Array[*, *] of L Real` | Product: The resulting matrix |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
