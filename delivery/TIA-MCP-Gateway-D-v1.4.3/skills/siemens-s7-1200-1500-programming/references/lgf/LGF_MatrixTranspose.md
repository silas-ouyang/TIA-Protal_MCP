# LGF_MatrixTranspose (FC / V3.0.1)

- **分类**：Math operations / Matrix (§4.7.7)
- **中文功能**：对二维 LReal 矩阵执行转置操作（行列互换，M*N 转为 N*M）
- **英文简述**：This function transposes a matrix of the data type `ARRAY[*,*] of LREAL` . Condition: Input matrix (m x n) = output matrix (n x m). A matrix is transposed by making columns out of the rows. Note that the number of rows of the input mat...

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `Void` | Void - Function has no return value |
| `error` | `Bool` | FALSE: No error TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |

## 输入/输出参数 (In/Out)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `matrix` | `Array[*, *] of L Real` | Matrix to be transposed |
| `matrixTranspose` | `Array[*, *] of L Real` | Transposed matrix |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#0000` | `STATUS_NO_ERROR` | Execution finished without errors |
| `16#8200` | `ERR_MATR1_LOWBOUND_ROWS_RESMATR_LOWBOUND_COLUMNS` | Error: Matrix1 lower bound rows(Dim1) size is different with Result Matrix lower bound<br>columns(Dim2) |
