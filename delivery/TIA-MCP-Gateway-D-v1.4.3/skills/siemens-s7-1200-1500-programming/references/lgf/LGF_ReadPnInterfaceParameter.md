# LGF_ReadPnInterfaceParameter (FB / V1.0.0)

- **分类**：System operations (§4.17.6)
- **中文功能**：§4.17.6
- **英文简述**：The function block provides Interface parameter like the IP Address settings, MAC Address and the PN Name.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `execute` | `Bool` | `-` | Risingedge starts action once |
| `hardwareId utput parameter` | `HW_ANY` | `-` | Hardware ID of the Interface where the parameter should be read |
| `Identifier` | `Data type` | `-` |  |
| `done` | `Bool` | `-` | manded functionality has been completed successfully |
| `busy` | `Bool` | `-` | not finished, new output values can be expected |
| `error` | `Bool` | `-` | rror occurred duringthe execution of the FB |
| `status` | `DWord` | `-` | 6#7FFF: Status of the FB, 16#8000 - 16#FFFF: Error |
| `address` | `IP_V4` | `-` | rom interface |
| `subnetMask` | `IP_V4` | `-` | k from interface |
| `standardGateway` | `IP_V4` | `-` | tewayaddress from interface |
| `macAddress` | `Array[0..5] of Byte` | `-` | ss from interface |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `pnName` | `String` | Profinet name from interface |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#0000` | `STATUS_EXECUTION_FINISHED` | Execution finished without errors |
| `16#7000` | `STATUS_NO_CALL` | No job being currently processed |
| `16#7001` | `STATUS_FIRST_CALL` | First call after incoming new job (rising edge 'execute') |
| `16#7002` | `STATUS_SUBSEQUENT_CALL` | Subsequent call during active processing without further details |
| `16#9000` | `ERR_UNDEFINED_STATE` | Error: due to an undefined state in state machine |

## 功能说明与使用要点
- The function reads the Interface settings / parameters using the system function `RDREC` (Read data record).
- To read the MAC and IP address of the interface provided via it's hardware ID, it is mandatory to read the `PD_INTERFACE_DATA_REAL` data record of any PROFINET compliant interface.
- Upon TIA Portal V17, it’s possible to use as well the system function `CommConfig` , which is in the Note `Instructions / Communication / Open user communication (Version >= V8.1)` located.
