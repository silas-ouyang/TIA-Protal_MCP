# LGF_FileDelete (FB / V1.0.0)

- **分类**：Data handling (§4.8.12)
- **中文功能**：删除 PLC 存储卡（SMC）UserFiles 目录下的指定文件
- **英文简述**：This function block deletes a file that is stored on the memory card of the PLC (SMC) in the `UserFiles` folder.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `execute` | `Bool` | `FALSE` | Rising edge starts file delete |
| `fileName utput parameter` | `String` | `''` | Name of file including path: `UserFiles/test.dat` |
| `Identifier` | `Data type` | `Description` |  |
| `done` | `Bool` | `TRUE: Com` | manded functionalityhas been completed successfully |
| `busy` | `Bool` | `TRUE: FB i` | s not finished; new output values can be expected |
| `error` | `Bool` | `TRUE: An e` | rror occurred during the execution of the functionality |
| `fileDoesNotExist` | `Bool` | `True: The fi` | le or the path present at `fileName` does not exist |
| `status` | `Word` | `16#0000 - 1 identificatio` | 6#7FFF: Status of the FB, 16#8000 - 16#FFFF: Error n |
| `diagnostics` | `LGF_type Diagnostics` | `Diagnostic blocks throu` | structure to store and transfer diagnostic information from gh the interface. |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#0000` | `STATUS_EXECUTION_FINISHED` | Execution finished without errors |
| `16#7000` | `STATUS_NO_CALL` | No job being currently processed |
| `16#7001` | `STATUS_FIRST_CALL` | First call after incoming new job (rising edge 'execute') |
| `16#7002` | `STATUS_SUBSEQUENT_CALL` | Subsequent call during active processing without further details |

## 功能说明与使用要点
- With the function `LGF_FileDelete` a file can be deleted from the SIMATIC Memory Card (SMC). The file name must always be specified in full together with the folder name and the file extension in...
