# LGF_ActDeactDevice (FB / V2.0.0)

- **分类**：System operations (§4.17.3)
- **中文功能**：§4.17.3
- **英文简述**：`LGF_ActDeactDevice` implements a compact state machine to activate or deactivate a decentral device.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `deactivate` | `Bool` | `FALSE` | Rising edge: Deactivate device given by `hwId` |
| `activate` | `Bool` | `FALSE` | Risingedge: Activate devicegiven by`hwId` |
| `hwId` | `HW_DEVICE` | `---` | Hardware ID of the device which should be activated / deactivated (`Device~PnIf~IODevice`) |
| `parameter` | `LGF_typeActDeact DeviceParameter` | `---` | Parameter dataset for the function `LGF_ActDeactDevice` |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `done` | `Bool` | TRUE: Commanded functionality has been completed successfully |
| `busy` | `Bool` | TRUE: FB is not finished and new output values can be expected |
| `error` | `Bool` | An error occurred duringthe execution of the FB |
| `status` | `Word` | 16#0000 - 16#7FFF: Status of the FB, 16#8000 - 16#FFFF: Error identification |
| `deactivating Active` | `Bool` | TRUE: Deactivating of device active |
| `deactivatingDone` | `Bool` | TRUE: Device deactivated |
| `activatingActive` | `Bool` | TRUE: Activation of device active |
| `activatingDone` | `Bool` | TRUE: Device activated |
| `diagnostics` | `LGF_type Diagnostics` | Diagnostic structure to store and transfer diagnostic information from blocks through the interface. |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#0000` | `STATUS_DEACTIVATION_DONE` | Device deactivation done |
| `16#0001` | `STATUS_ACTIVATION_DONE` | Device activation done |
| `16#7000` | `STATUS_NO_CALL` | No job being currently processed |
| `16#7040` | `STATUS_DEACTIVATION` | Processing device deactivation |
| `16#7060` | `STATUS_ACTIVATION` | Processing device activation |
| `16#8600` | `ERR_UNDEFINED_STATE` | Error: Due to an undefined state in state machine |
| `16#8601` | `ERR_LOG2GEO` | Error: Log2Geo, may the HW ID for the device is wrong,<br>please see `diagnostics.subFunctionStatus` for more detailed information |
| `16#8602` | `ERR_GEO2LOG` | Error: Geo2Log, may the HW ID for the device is wrong,<br>please see `diagnostics.subFunctionStatus` for more detailed information |
| `16#8640` | `ERR_DEVICE_DEACTIVATING` | Error: Deactivation (D_ACT_DP) of device,<br>please see `diagnostics.subFunctionStatus` for more detailed information |
| `16#8641` | `ERR_DEVICE_DEACTIVATING_TIME_OUT` | Error: Deactivation of device - watchdog time expired |
| `16#8642` | `ERR_DEVICE_DEACTIVATING_RETRIES_REACHED` | Error: Deactivation of device - max retries reached |
| `16#8650` | `ERR_READ_ACTIVATION_STATE_WHILE_DEACTIVATED` | Error: Deactivation state (D_ACT_DP) of device is wrong,<br>desired is `16#0000` or `16#0002`,<br>please see `diagnostics.subFunctionStatus` for more detailed information |
| `16#8660` | `ERR_DEVICE_ACTIVATING` | Error: Activation (D_ACT_DP) of device,<br>please see `diagnostics.subFunctionStatus` for more detailed information |
| `16#8661` | `ERR_DEVICE_ACTIVATING_TIME_OUT` | Error: Activation of device cause watchdog time expired.<br>Can be a broken device connection |
| `16#8662` | `ERR_DEVICE_ACTIVATING_RETRIES_REACHED` | Error: Activation of device cause max retries reached.<br>Can be a broken device connection |
| `16#8663` | `ERR_READ_DEVICES_STATES_DURING_ACTIVATION` | Error: Read Device states (`DeviceStates`) during device activation,<br>please see `diagnostics.subFunctionStatus` for more detailed information |
| `16#8670` | `ERR_READ_DEVICES_STATES_WHILE_ACTIVE` | Error: Read Device states (`DeviceStates`) while device active,<br>please see `diagnostics.subFunctionStatus` for more detailed information |
| `16#8671` | `ERR_DEVICE_STATE_WHILE_ACTIVE` | Error: Device states present error and is unreachable, faulty Device or IO-System |

## 功能说明与使用要点
- The module provides the procedure for activating and deactivating a remote IO-Device in the Profinet (PN, S7-1500 & S71200) and Profibus (DP, S7-1500) network.
- The activation of the device (defined at `hwId` ) is initiated by a rising edge at `activate` ,` after complete activation this is indicated at the output `isActivated .
- The connection status of the decentralized device is as well displayed in the TIA Portal project Note navigation in the PLC, which is the controller, under the item ‘Distributed I/O’, if online wit...
- Deactivation of the device (defined at `hwId` )` is initiated by a rising edge at `deactivate` ,` after complete activation this is indicated at the output `isDeactivated` .
- **注意**：[Note] The parameter `timeOutActDeact` for monitoring the activation and deactivation sequence should always be set higher than the parameterized value in the `Device configuration` / `Startup` / `Configuration time` .
