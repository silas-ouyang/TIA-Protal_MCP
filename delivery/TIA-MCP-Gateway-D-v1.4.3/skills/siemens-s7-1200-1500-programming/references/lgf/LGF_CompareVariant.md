# LGF_CompareVariant (FC / V3.0.1)

- **分类**：Comparator operations (§4.5.5)
- **中文功能**：比对两个结构体或数组变量（最大200字节）的类型与数据一致性
- **英文简述**：The function compares two structured actual parameters (array, PLC data type) and outputs whether they are of the same type and have the same values. Compare arrays or plc datatypes and their values up to a max lengh of 200 Bytes of the ...

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `Bool` | FALSE: Values of comparison variables or PLC data types are different. TRUE: Values of the comparison variables are equal and PLC data types are identical. |
| `error` | `Bool` | FALSE: No error / TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB / 16#8000-16#FFFF: Error identification (see following Table) |
| `subFunction Status` | `Word` | Status or return value of called FB's, FC's and system blocks |

## 输入/输出参数 (In/Out)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `variableA` | `Variant` | First comparison variable with anydata type |
| `variableB` | `Variant` | Second comparison variable with any data type |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#0000` | `STATUS_NO_ERROR` | Execution finished without errors |
| `16#8201` | `ERR_INPUT_TYPES_MUST_MATCH` | Error, the input types must match, e.g. STRUCT |
| `16#8202` | `ERR_INPUT_TYPES_LENGTH_NOT_EQUAL` | Error, the input types have different lengths after serialization, `subFunctionStatus` provides an<br>indicator of the different size |
| `16#8601` | `ERR_SERIALIZE_VARIABLE_A` | Error occured while serialize variableA into Bytearray - see `subFunctionStatus` for detailed<br>information |
| `16#8602` | `ERR_SERIALIZE_VARIABLE_B` | Error occured while serialize variableB into Bytearray - see `subFunctionStatus` for detailed<br>information |

## 功能说明与使用要点
- The status of called commands is output in `subFunctionStatus` . In this case, the output value in Note `status` indicates which command caused the error. In this case, refer to the TIA Portal Onli...
- This block compares two (structured) actual parameters and shows whether they equate to the same value.
- **注意**：[Note] The following differences cannot be detected with the comparison method (byte level): - Variables of the data type `Struct` cannot be compared. - For strings, there may be differences in the range between the a...
