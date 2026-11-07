# LGF_NthRoot (FC / V3.0.1)

- **分类**：Math operations (§4.6.8)
- **中文功能**：计算输入浮点数值的指定 N 次方根（开 N 次方根运算）
- **英文简述**：This function extracts the n-th root of a given value. The root is defined as follows: STEP 7 (TIA Portal) results in the following formula: 𝑟𝑒𝑠𝑢𝑙𝑡= 𝑣𝑎𝑙𝑢𝑒∗∗(1/𝑟𝑜𝑜𝑡)

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `value` | `LReal` | `-` | Value from which the root should be calculated. |
| `root` | `LReal` | `-` | Exponent of root |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `LReal` | Returns the Nth root of a value |
| `error` | `Bool` | FALSE: No error TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#0000` | `STATUS_NO_ERROR` | Execution finished without errors |
| `16#8200` | `ERR_NEG_VAR` | Error: Negative value for root exponend not permitted<br>(Leads to complex numbers) |
