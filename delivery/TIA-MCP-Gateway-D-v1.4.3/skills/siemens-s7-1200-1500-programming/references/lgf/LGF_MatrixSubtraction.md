# LGF_MatrixSubtraction (FC / V3.0.1)

- **分类**：Math operations / Matrix (§4.7.6)
- **中文功能**：计算两个相同维度的二维 LReal 矩阵各元素逐项相减
- **英文简述**：This function subtracts a matrix of the data type `ARRAY[*,*] of LREAL` from another one. The individual fields of the two matrices are read, subtracted and then output in the matrix `matrixResult` .

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `Void` | Void - Function has no return value |
| `error` | `Bool` | FALSE: No error TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |

## 输入/输出参数 (In/Out)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `matrix1` | `Array[*, *] of L Real` | First matrix - minuend |
| `matrix2` | `Array[*, *] of L Real` | Second matrix - subtrahend |
| `matrixResult` | `Array[*, *] of L Real` | Sum of the matrices |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#0000` | `STATUS_NO_ERROR` |  |

- **注意**：[Note] Note that all input and output matrices must have the same number of columns and rows.
