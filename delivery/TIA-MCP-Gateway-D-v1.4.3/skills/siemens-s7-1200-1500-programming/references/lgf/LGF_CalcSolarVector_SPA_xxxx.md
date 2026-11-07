# LGF_CalcSolarVector_SPA_xxxx (FB / V1.0.0)

- **分类**：Date and timer operations / Solar Positioning Algorithm (§4.3.1)
- **中文功能**：基于 NREL SPA 算法解算高精度太阳视位置（方位角与天顶角）

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `enable` | `Bool` | `FALSE` | TRUE: Enable functionalityof FB |
| `positionGps` | `LGF_typeGPS_DD` | `---` | GPS Coordinates in decimal degrees |
| `pressure` | `LReal` | `1013.0` | Annual average local pressure [0, 5000] [millibar], STATUS ERROR CODE [16#8209] |
| `temperature` | `LReal` | `0.0` | Annual average local temperature [-273, 6000] [degrees Celsius], STATUS ERROR CODE [16#820A] |
| `elevation` | `LReal` | `0.0` | Observer elevation [-650000, +infinit] [meter], STATUS ERROR CODE [16#820B] |
| `deltaT` | `LReal` | `0.0` | Difference between earth rotation time and terrestrial time (http://maia.usno.navy.mil/ser7/deltat.data) [-8000, 8000], STATUS ERROR CODE [16#820C] |
| `atmosRefract` | `LReal` | `0.5667` | Atmospheric refraction at sunrise and sunset (0.5667 deg is typical) [-5, 5], STATUS ERROR CODE [16#820D] |
| `timeUTC` | `DTL` | `---` | Coordinate Universal Time [1970-01-01-00:00:00, 2262-04-11-23:47:16] [DTL], STATUS ERROR CODE [16#8201- 16#8206] |
| `useInternalTime` | `Bool` | `TRUE` | True: UsingPLC internal time, False: User defined time |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `valid` | `Bool` | TRUE: Valid set of output values available at the FB |
| `busy` | `Bool` | TRUE: FB is not finished and new output values can be expected |
| `error` | `Bool` | Error |
| `status` | `Word` | Status and Error Code. 16#0000: Success.16#8201-16#820D: Input error. |
| `subFunction Status` | `Word` | Status or return value of called FCs and system blocks |
| `zenith` | `LReal` | Topocentric zenith angle [0, 180] [degree] |
| `azimuth` | `LReal` | Topocentric azimuth angle (eastward from north) [0, 360] [degree] |
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

## 功能说明与使用要点
- The block provides SPA (Sun Position Algorithm) to calculate the actual sun position for any location on Earth, with a deterministic accuracy of 0,0003º. The position of the sun is given in relatio...
- Figure: SPA angle description
- The rights to use the SPA algorithm were acquired from NREL with a corresponding legal agreement. Note The structure of the module is based on the corresponding C++ code of the master program.
- The calculation of Azimuth and Zenith depends on:
- - Mandatory parameters
- - `timeUTC` (DTL) / taken from the internal PLC clock or the time provided via interface
- - `longitude` ( Real) / position given in decimal degree
- - `latitude` ( Real) / position given in decimal degree
- - Optional parameters (increases precision and accuracy) :
- - `pressure` ( LReal) / provided in mbar. Default set as 1013.0 mbar
- - `temperature` ( LReal) / provided in °Celsius. Default set as 0°C
- - `elevation` ( LReal) / provided in meters. Default set to 0m
- - `atmosRefract` ( LReal) /Atmospheric refraction, provided in Degrees. Default set as 0.5667
- - `deltaT` / is difference between earth rotation time and terrestrial time Refer http://maia.usno.navy.mil/ser7/deltat.data for knowing the value
- It can be used to operate Photovoltaic (PV) power plants and to achieve the highest possible energy yield with their plants.
- Besides selecting the right technology, the best way to increase yield is by using single-axis or dual-axis tracking systems, which can raise the yield of PV power plants by 30 to 40 percent, depen...
- **注意**：[CAUTION]
