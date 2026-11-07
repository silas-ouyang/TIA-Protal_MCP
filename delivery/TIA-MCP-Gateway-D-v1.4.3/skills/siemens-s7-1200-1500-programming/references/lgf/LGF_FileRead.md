# LGF_FileRead (FB / V1.0.1)

- **分类**：Data handling (§4.8.13)
- **中文功能**：从 SMC 存储卡 UserFiles 目录中读取文件并反序列化为数据流
- **英文简述**：This function block offers reading data as binary / serialized data stream from files stored on the PLC's memory card in the folder `UserFiles` .

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `execute` | `Bool` | `FALSE` | Risingedge starts file read once |
| `dataLengthMust` | `Bool` | `FALSE` | TRUE: The length of the file data set and the dataset in |
| `Match` | ` | `- | the PLC must match. |
| `fileName` | `String` | `''` | Name of file includingpath: `UserFiles/test.dat` |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `done` | `Bool` | TRUE: Commanded functionality has been completed successfully |
| `busy` | `Bool` | TRUE: FB is not finished; new output values can be expected |
| `error` | `Bool` | TRUE: An error occurred duringthe execution of the functionality |
| `status` | `Word` | 16#0000 - 16#7FFF: Status of the FB, 16#8000 - 16#FFFF: Error identification |
| `dataLength` | `DInt` | Data length read from file (serialized length of `data`) |
| `diagnostics` | `LGF_type Diagnostics` | Diagnostic structure to store and transfer diagnostic information from blocks through the interface. |

## 输入/输出参数 (In/Out)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `bufferByteArray` | `Array[*] of Byte` | Byte arraybuffer for read / write from / to file |
| `data` | `Variant` | Data set read from file |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#0000` | `STATUS_EXECUTION_FINISHED` | Execution finished without errors |
| `16#7000` | `STATUS_NO_CALL` | No job being currently processed |
| `16#7001` | `STATUS_FIRST_CALL` | First call after incoming new job (rising edge 'execute') |
| `16#7002` | `STATUS_SUBSEQUENT_CALL` | Subsequent call during active processing without further details |
| `16#8201` | `ERR_BUFFER_LOWERBOUND` | Error: Buffer array lower bound<br>Lower bound must be 0 |
| `16#8202` | `ERR_BUFFER_ARRAY_TO_SMALL_TO_COPY` | Error: Buffer size less than needed size for data |
| `16#8401` | `ERR_FILE_PATH` | Error: File path error: File path must start with 'UserFiles/'. |
| `16#8411` | `ERR_FILE_SIZE_GRATER_THEN_DATA_SIZE` | Error: File length and Data length dose not match! |
| `16#8412` | `ERR_FILE_SIZE_LESS_THEN_DATA_SIZE` | Error: File length and Data length dose not match! |
| `16#8600` | `ERR_UNDEFINED_STATE` | Error due to an undefined state in state machine |
| `16#8601` | `ERR_MOVE_BLK_VARIANT` | Error: Move block variant (buffer to data) - see `diagnostics.subFunctionStatus` |
| `16#8602` | `ERR_DATA_SERIALIZE` | Error: Serialize data - see `diagnostics.subFunctionStatus` |
| `16#8603` | `ERR_DATA_DESERIALIZE` | Error: Deserialize data - see `diagnostics.subFunctionStatus` |
| `16#8604` | `ERR_FILE_READ_INIT` | Error: Read file from SMC - see `diagnostics.subFunctionStatus` |
| `16#8605` | `ERR_FILE_READ` | Error: Read file from SMC - see `diagnostics.subFunctionStatus` |

## 功能说明与使用要点
- With the function `LGF_FileRead` a file can be read into the data budget of a variable at `data` . To read the data it is necessary to deserialize it, which the function already takes from the ...
- The file name must always be specified in full together with the folder name and the file extension in the following format: `UserFiles/test.dat` .
