# LGF_FileReadWriteDelete (FB / V1.0.0)

- **分类**：Data handling (§4.8.14)
- **中文功能**：SMC 存储卡 UserFiles 目录文件的读取、写入与删除一体化管理
- **英文简述**：The function `LGF_FileReadWriteDelete` can be used to read, write or delete a file to/from the SIMATIC Memory Card (SMC). To read or write the data, it is necessary to deserialize/serialize it, which the function already does for the u...

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `executeRead` | `Bool` | `FALSE` | Risingedge starts file read once |
| `executeWrite` | `Bool` | `FALSE` | Risingedge starts file write once |
| `executeDelete` | `Bool` | `FALSE` | Rising edge starts file delete once |
| `fileName` | `String` | `''` | Name of file including path: `UserFiles/test.dat` |
| `parameter` | `LGF_typeFileRead` | `---` | This UDT belongs to the Module |
| `WriteDelete` | ` | `LGF_FileReadWriteDelete` and lists all possible` |  |
| `Parameter` | ` | `parameters to configure its behavior. |  |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `done` | `Bool` | TRUE: Commanded functionality has been completed successfully |
| `busy` | `Bool` | TRUE: FB is not finished; new output values can be expected |
| `error` | `Bool` | TRUE: An error occurred during the execution of the functionality |
| `status` | `Word` | 16#0000 - 16#7FFF: Status of the FB, 16#8000 - 16#FFFF: Error identification |
| `dataLength` | `DInt` | Data length read from file (serialized length of `data`) |
| `fileDoesNotExist` | `Bool` | True: The file or the path present at `fileName` does not exist |
| `timestamps` | `LGF_typeFileRead WriteDelete Timestamps` | Timestamps for commands and file |
| `diagnostics` | `LGF_type Diagnostics` | Diagnostic structure to store and transfer diagnostic information from blocks through the interface. |

## 输入/输出参数 (In/Out)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `bufferByteArray` | `Array[*] of Byte` | Byte arraybuffer for read / write from / to file |
| `data` | `Variant` | Data set read from file / to write to file |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
