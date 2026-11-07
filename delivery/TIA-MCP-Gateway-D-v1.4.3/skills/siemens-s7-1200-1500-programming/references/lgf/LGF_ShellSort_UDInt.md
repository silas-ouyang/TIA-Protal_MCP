# LGF_ShellSort_UDInt (FB / V3.0.1)

- **分类**：Data handling (§4.8.19)
- **中文功能**：采用希尔排序算法对 UDInt 数组就地进行升序或降序排列
- **英文简述**：This block sorts an array of type `UDInt` with any number of elements (max. 1000) in ascending or descending order and returns the sorted version of the array in the same variable.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `sortDirection` | `Bool` | `FALSE` | FALSE: Sort ascending; TRUE: Sort descending |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `error` | `Bool` | FALSE: No TRUE: An e |
| `status` | `Word` | 16#0000-16 16#8000-16 |

## 输入/输出参数 (In/Out)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `array` | `Array[*] of UDInt` | Array to be sorted |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#0000` | `STATUS_NO_ERROR` | Status: Execution finished without errors |
| `16#8200` | `ERR_NO_ARRAY` | Error: Actual parameter at the `array` input has only one element. |
| `16#8201` | `ERR_TOO_MANY_ELEMENTS` | Error: Actual parameter at the `array` input has too many elements (maximum is 1000). |

## 功能说明与使用要点
- The block sorts according to the shell sort procedure. Note that the execution time of the block depends significantly on how many elements the array to be sorted has. The overview below shows seve...
- Average steps needed for execution: 𝒪(𝑛⋅log(𝑛)<sup>2</sup> )
- Table: Execution times of the block `LGF_ShellSort…`
- The block is executed synchronously and is not split over several PLC cycles. Thus the execution time Note has a direct effect on the PLC cycle time. Note this behavior for your project of the cont...
