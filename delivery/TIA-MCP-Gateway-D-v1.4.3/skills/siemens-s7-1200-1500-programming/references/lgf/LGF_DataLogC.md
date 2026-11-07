# LGF_DataLogC (FB / V1.0.0)

- **分类**：Data handling (§4.8.10)
- **中文功能**：紧凑型数据记录器（集成创建、写入、读取与自动归档状态机）
- **英文简述**：LGF_DataLogC (C -> Compact) function integrates all the datalog system functions and can be used as standalone data logger.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `enable` | `Bool` | `FALSE` | TRUE: Enable functionalityof FB |
| `name` | `String` | `'DefaultDataLog'` | Name of datalog, also used as file name |
| `triggerLogEntry` | `Bool` | `FALSE` | Rising edge trigger one entry in data log (only if `parameter.isLoggingByInterval` := FALSE) |
| `clearLog` | `Bool` | `FALSE` | Rising edge triggering clearing of datalog file |
| `deleteLog` | `Bool` | `FALSE` | Risingedge triggeringdeletion of datalogfile if exist |
| `parameter` | `LGF_typeDataLog Parameter` | `---` | This UDT belongs to the Module `LGF_DataLogC` and lists all possible parameter to configure its behaviour. |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `valid` | `Bool` | TRUE: Valid set of output values available at the FB |
| `busy` | `Bool` | TRUE: FB is not finished and new output values can be expected |
| `error` | `Bool` | TRUE: An error occurred duringthe execution of the FB |
| `status` | `Word` | 16#0000 - 16#7FFF: Status of the FB, 16#8000 - 16#FFFF: Error identification |
| `writeEntryDone` | `Bool` | TRUE: DataLogwrite done successfully |
| `clearLogDone` | `Bool` | TRUE: DataLog clear done successfully |
| `deleteLogDone` | `Bool` | TRUE: DataLog delete done successfully |
| `lastEntryReached` | `Bool` | TRUE: Last entry of datalog reached, if `enableRingBuffer` is set, start from beginning, otherwise block ends here |
| `noOfEntries` | `UDInt` | Number of entries in datalog |
| `diagnostics` | `LGF_type Diagnostics` | Diagnostic structure to store and transfer diagnostic information from blocks through the interface. |

## 输入/输出参数 (In/Out)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `data` | `Variant` | Data structure to log in datalog file |

## 功能说明与使用要点
- The function `LGF_DataLogC` combines the system functions for creating and writing data logs in one block.
- The procedure provides that an existing Datalog is opened on the basis of the name ( `name` ) , if it was not created before, this is recognized and the function creates the Datalog.
- Afterwards, depending on the parameterization, the data is written from `data` in an adjustable interval or only on request to `triggerLogEntry` .
- ReadMe The functionality of Datalogs can be found in the user manual:
- - `DataLogCreate`
- - `DataLogOpen`
- - `DataLogClose`
- - `DataLogWrite`
- - `DataLogClear`
- - `DataLogDelete`
- The following parameters are only effective when creating a data log:
- - NOTICE • `parameter.header`
- - `parameter.maxNumberOfEntries`
- - • `parameter.timestampFormat` (S7-1200 and the S7-1500 support different formats, see the manual `DataLogCreate` )
