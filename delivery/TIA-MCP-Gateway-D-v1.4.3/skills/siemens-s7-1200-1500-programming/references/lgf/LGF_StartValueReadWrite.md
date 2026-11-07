# LGF_StartValueReadWrite (FB / V1.0.0)

- **分类**：Data handling (§4.8.21)
- **中文功能**：在线读取运行时数值或将其写回保存为 DB 块与变量的初始启动值
- **英文简述**：Read or write start value(s) from variables or complete data blocks

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `read` | `Bool` | `FALSE` | Rising edge: Read start value of data block / Variable of data block |
| `write` | `Bool` | `FALSE` | Rising edge: Write actual value(s) to start value of data block / Variable of data block |
| `dataSource` | `Variant` | `---` | Data (block / variable) source, if a separate source is needed. May also be `NULL` - then the target is also used as the source |
| `dataDestination` | `Variant` | `---` | Data (block / variable) destination |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `readDone` | `Bool` | TRUE: Read has been completed successfully |
| `writeDone` | `Bool` | TRUE: Write has been completed successfully |
| `busy` | `Bool` | TRUE: FB is not finished and new output values can be expected |
| `error` | `Bool` | TRUE: An error occurred during the execution of the FB |
| `lastRead` | `DTL` | Timestamp of last read access |
| `lastWrite` | `DTL` | Timestamp of last write access |
| `status` | `Word` | 16#0000 - 16#7FFF: Status of the FB, 16#8000 - 16#FFFF: Error identification |
| `diagnostics` | `LGF_type Diagnostics` | Diagnostic information |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#0001` | `STATUS_READ_DONE` | Read execution finished without errors |
| `16#0002` | `STATUS_WRITE_DONE` | Write execution finished without errors |
| `16#7000` | `STATUS_NO_CALL` | Nojob beingcurrentlyprocessed |
| `16#7001` | `STATUS_READ` | Read value(s)in progress |
| `16#7002` | `STATUS_WRITE` | Write value(s)in progress |
| `16#8400` | `ERR_MULTIPLE_COMMANDS` | Error: Multiple commands add the same time not allowed. |
| `16#8600` | `ERR_UNDEFINED_STATE` | Error: Undefined state in state machine |
| `16#8601` | `ERR_READ` | Error: Read value(s)`READ_DBL` - see `diagnostics.subfunctionStatus` |
| `16#8602` | `ERR_WRITE` | Error: Write value(s) `WRITE_DBL` - see `diagnostics.subfunctionStatus` |
| `16#8611` | `ERR_READ_TIME` | Error: Read timestamp `RD_LOC_T` while read values - see `diagnostics.subfunctionStatus` |
| `16#8612` | `ERR_WRITE_TIME` | Error: Write timestamp `WR_LOC_T` while write values - see `diagnostics.subfunctionStatus` |

## 功能说明与使用要点
- The function reads or writes the start value of a single variable, a structured variable or an entire data area or data block from the source to the destination.
- The parameter `dataDestination` must always be present, the parameter `dataSource` is optional. If `dataSource` is not used, the function…
- - reads the start value(s) of the destination(s) and writes them to the current value of the same variable(s)/data block.
- - writes the start value(s) of the target to the start value(s) of the same variable(s) of the data block.
- If the start values are written, the data block then appears in engineering as an “inconsistent” data block Note after the values have been written by the user program.
- **注意**：[Note] In order to use complete data blocks, they must be derived from a PLC data type. A change to the start values can no longer be reversed without further modifications. Note The possibilities are, for example: - ...
