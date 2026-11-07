# LGF_MatrixInverse (FC / V3.0.1)

- **分类**：Math operations / Matrix (§4.7.3)
- **中文功能**：采用 Shipley-Coleman 算法求解任意阶二维 LReal 方阵的逆矩阵
- **英文简述**：This function inverts a square matrix of the data type `ARRAY[*,*] of LREAL` . The square matrix of any size will be inverted according to the Shipley-Coleman method. 𝑚𝑎𝑡𝑟𝑖𝑥𝑅𝑒𝑠𝑢𝑙𝑡= 𝑚𝑎𝑡𝑟𝑖𝑥<sup>−1</sup>

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `Void` | Void - Function has no return value |
| `error` | `Bool` | FALSE: No error TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |

## 输入/输出参数 (In/Out)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `matrix` | `Array[*, *] of L Real` | Square input matrix that will be inversed (Array[0..x, 0..x] of REAL) |
| `matrixResult` | `Array[*, *] of L Real` | Inverted matrix |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#0000` | `STATUS_NO_ERROR` | Execution finished without errors |
| `16#8200` | `ERR_NOT_SQUARE_MATRIX` | Error: Matrix is not square (number of rows equals number of colums) |
| `16#8201` | `ERR_ALGORITHM_NOT_POSSIBLE` | Matrix determinant is zero. Inversion is not possible for this matrix |

- **注意**：[Note] Note that the input matrix must be square. This means that the number of rows must be equal to the number of columns. The output matrix must be the same size and have the same array boundaries as the input matrix.
