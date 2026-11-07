# LGF_AstroClock (FB / V3.0.1)

- **分类**：Date and timer operations (§4.2.5)
- **中文功能**：根据地理 GPS 经纬度坐标与本地时间解算日出与日落时刻
- **英文简述**：This function calculates the times of sunrise and sunset based on the local time for a specific place on Earth. The exact position is transferred in the form of geographical GPS coordinates (longitude and latitude).

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `enable` | `Bool` | `FALSE` | TRUE: Activates the functionalityof the FB |
| `positionGps` | `LGF_typeGPS_DD` | `---` | GPS position to calculate the time of sunrise and sunset |
| `offsetSunrise` | `Time` | `T#0s` | Offset to sunrise (added to sunrise time, considered at `isDaytime`, negative time allowed) |
| `offsetSunset` | `Time` | `T#0s` | Offset to sunset (added to sunset time, considered at `isDaytime`, negative time allowed) |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `valid` | `Bool` | TRUE: Valid set of output values available at the FB |
| `busy` | `Bool` | TRUE: FB is active and new output values can be expected |
| `error` | `Bool` | FALSE: No error / TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB / 16#8000-16#FFFF: Error identification (see following Table) |
| `subFunction Status` | `Word` | Status or return value of called FB's, FC's and system blocks |
| `actualLocalTime` | `DTL` | Current time (local time) |
| `sunriseTime` | `DTL` | Sunrise time (localtime) |
| `sunsetTime` | `DTL` | Sunset time(localtime) |
| `isDaytime` | `Bool` | TRUE: If the local time of the controller is between “sunrise” and “sunset”. |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#0000` | `STATUS_EXECUTION_FINISHED_NO_ERROR` | Execution finished without errors |
| `16#7000` | `STATUS_NO_CALL` | No job being currently processed - not `enable` |
| `16#7001` | `STATUS_IN_OPERATION` | Block is in Operation - Enabled |
| `16#8204` | `ERR_LATITUDE_VALUE` | Error: Wrong<br>Latitude DD value |
| `16#8205` | `ERR_LONGITUDE_VALUE` | Error: Wrong Longitude DD value |
| `16#8601` | `ERR_RD_SYS_T` | Error instruction RD_SYS_T, check `subFunctionStatus` code |
| `16#8602` | `ERR_RD_LOC_T` | Error instruction RD_LOC_T, check `subFunctionStatus` code |

## 功能说明与使用要点
- The status of called commands is output in `subFunctionStatus` . In this case, the output value in Note `status` indicates which command caused the error. In this case, refer to the TIA Portal Onli...
- If processes must run automatically depending on the change between day and night, the function of an astronomical clock is required. Examples of this would be switching outdoor lighting on and off...
- If these processes are to be executed with a time delay i.e. a defined time before or after sunrise or sunset an offset is required in each case.
- For precise execution of the function, it must be ensured that system time and local time of the SIMATIC Note controller are set correctly.
- Based on the system time/local time of the SIMATIC controller and the set coordinates, the block calculates the times for sunrise and sunset. The offset times are added to the sunrise and sunset an...
- Since the times for sunrise and sunset change daily, it is possible that the `isDaytime` output remains Note permanently on `TRUE` or `FALSE` over a longer period of time:
- - with correspondingly large offset values
- - for a place on the other side of the Arctic Circle
- The input of the GPS coordinate values is checked for valid values. If there are invalid values, an appropriate error code is output to `status` .
- If there is an invalid coordinate value for a formal parameter, the outputs `sunrise` and `sunset` are set to the value `DTL#1970-01-01-00:00:00` .
