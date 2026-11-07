# LGF_MatrixCompare (FC / V3.0.1)

- **分类**：Math operations / Matrix (§4.7.2)
- **中文功能**：比对两个相同维度的二维 LReal 矩阵所有对应元素是否完全相等
- **英文简述**：This function compares two matrices of the data type `ARRAY[*,*] of LREAL` of equal size. If both matrices are identical, the return value of the function is set to TRUE. Note that all input matrices must have the same lower and upper ...

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `Bool` | TRUE: Both matrices are identical. |
| `error` | `Bool` | FALSE: No error TRUE: An error occurred duringthe execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |

## 输入/输出参数 (In/Out)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `matrix1` | `Array[*, *] of L Real` | First Matrix |
| `matrix2` | `Array[*, *] of L Real` | Second Matrix |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#0000` | `STATUS_NO_ERROR` | Execution finished without errors |
| `16#8200` | `ERR_MATR1_LOWBOUND_ROWS_MATR2_LOWBOUND_ROWS` | Error: Matrix1 lower bound rows(Dim1) size is different with Matrix2 lower bound rows(Dim1) |
| `16#8201` | `ERR_MATR1_LOWBOUND_COLUMNS_MATR2_LOWBOUND_COLUMNS` | Error: Matrix1 lower bound columns(Dim2) size is different with Matrix 2 lower bound<br>columns(Dim2) |
| `16#8202` | `ERR_MATR1_UPPBOUND_ROWS_MATR2_UPPBOUND_ROWS` | Error: Matrix1 upper bound rows(Dim1) size is different with Matrix2 upper bound rows(Dim1) |
