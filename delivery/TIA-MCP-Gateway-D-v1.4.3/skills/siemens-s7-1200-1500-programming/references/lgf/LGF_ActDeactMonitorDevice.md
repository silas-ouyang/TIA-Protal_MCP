# LGF_ActDeactMonitorDevice (FB / V2.0.0)

- **分类**：System operations (§4.17.4)
- **中文功能**：§4.17.4
- **英文简述**：`LGF_ActDeactMonitorDevice` implements a compact state machine to activate and monitor or deactivate a decentral IO device. The module monitors the device connection and error state as well after activation.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `enable` | `Bool` | `FALSE` | TRUE: Enable functionality of FB |
| `deactivate` | `Bool` | `FALSE` | Risingedge: Deactivate devicegiven by`hwId` |
| `activate` | `Bool` | `FALSE` | Rising edge: Activate device given by `hwId` |
| `hwId` | `HW_DEVICE` | `---` | Hardware ID of the device which should be activated / deactivated (`Device~PnIf~IODevice`) |
| `parameter` | `LGF_typeActDeact MonitorDevice Parameter` | `---` | Parameter dataset for the function `LGF_ActDeactMonitorDevice` |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `valid` | `Bool` | TRUE: Valid set of output values available at the FB |
| `busy` | `Bool` | TRUE: FB is not finished and new output values can be expected |
| `done` | `Bool` | TRUE: Commanded functionalityhas been completed successfully |
| `error` | `Bool` | TRUE: An error occurred duringthe execution of the FB |
| `status` | `Word` | 16#0000 - 16#7FFF: Status of the FB, 16#8000 - 16#FFFF: Error identification |
| `deactivating Active` | `Bool` | TRUE: Deactivating of device active |
| `activatingActive` | `Bool` | TRUE: Activation of device active |
| `isDeactivated` | `Bool` | TRUE: Device deactivated |
| `isActivated` | `Bool` | TRUE: Device activated |
| `deviceStateOK` | `Bool` | TRUE: Device is activated and connected to IO-System FALSE: Device is faulty or not connected, depends on `isActivated` |
| `diagnostics` | `LGF_type Diagnostics` | Diagnostic structure to store and transfer diagnostic information from blocks through the interface. |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#0000` | `STATUS_DEACTIVATED` | Device deactivation done |
| `16#0001` | `STATUS_ACTIVATED` | Device activation done |
| `16#7000` | `STATUS_NO_CALL` | No job being currently processed |
| `16#7001` | `STATUS_FIRST_CALL` | First call after incoming new job (rising edge 'enable') |
| `16#7002` | `STATUS_SUBSEQUENT_CALL` | Subsequent call during active processing without further details |
| `16#7040` | `STATUS_DEACTIVATION` | Processing device deactivation |
| `16#7060` | `STATUS_ACTIVATION` | Processing device activation |
| `16#8600` | `ERR_UNDEFINED_STATE` | Error: Due to an undefined state in state machine |
| `16#8601` | `ERR_LOG2GEO` | Error: Log2Geo, may the HW ID for the device is wrong,<br>please see `diagnostics.subFunctionStatus` for more detailed information |
| `16#8602` | `ERR_GEO2LOG` | Error: Geo2Log, may the HW ID for the device is wrong,<br>please see `diagnostics.subFunctionStatus` for more detailed information |
| `16#8640` | `ERR_DEVICE_DEACTIVATING` | Error: Deactivation (D_ACT_DP) of device,<br>please see `diagnostics.subFunctionStatus` for more detailed information |
| `16#8641` | `ERR_DEVICE_DEACTIVATING_TIME_OUT` | Error: Deactivation of device - watchdog time expired |
| `16#8642` | `ERR_DEVICE_DEACTIVATING_RETRIES_REACHED` | Error: Deactivation of device cause max retries reached |
| `16#8650` | `ERR_READ_ACTIVATION_STATE_WHILE_DEACTIVATED` | Error: Deactivation state (D_ACT_DP) of device is wrong,<br>desired is `16#0000` or `16#0002`,<br>please see `diagnostics.subFunctionStatus` for more detailed information |

## 功能说明与使用要点
- The module provides the procedure for activating and deactivating a remote IO-Device in the Profinet (PN, S7-1500 & S71200) and Profibus (DP, S7-1500) network.
- The activation of the device (defined at `hwId` ) is initiated by a rising edge at `activate` ,` after complete activation this is indicated at the output `isActivated` and `deviceStateOK ....
- The connection is monitored and in case of a failure of this of more than the set monitoring time `timeOutStateMonitoring` at the output and reported as an error. After successful recovery of the...
- The connection status of the decentralized device is as well displayed in the TIA Portal project Note navigation in the PLC, which is the controller, under the item ‘Distributed I/O’, if online wit...
- Deactivation of the device (defined at `hwId` )` is initiated by a rising edge at `deactivate` ,` after complete activation this is indicated at the output `isDeactivated` .
- It is possible to define the states for switching on and off, as well as the monitoring times for activating and deactivating and the connection monitoring.
- All errors are automatically reset as soon as the faulty state is eliminated.
- The exception to this are errors that can only be corrected by an intervention in the software, such as an incorrect or nonexistent hardware ID of a non-existent decentralized IO device.
- **注意**：[Note] The parameter `timeOutActDeact` for monitoring the activation and deactivation sequence should always be set higher than the parameterized value in the `Device configuration` / `Startup` / `Configuration time` .
