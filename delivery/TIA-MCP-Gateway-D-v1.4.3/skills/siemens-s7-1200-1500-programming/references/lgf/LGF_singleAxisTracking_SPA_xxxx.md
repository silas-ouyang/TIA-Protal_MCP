# LGF_singleAxisTracking_SPA_xxxx (FB / V1.0.0)

- **分类**：Date and timer operations / Solar Positioning Algorithm (§4.3.2)
- **中文功能**：结合 SPA 太阳位置与防遮挡回退算法解算单轴光伏跟踪器倾角
- **英文简述**：This block is discription for LGF_singleAxisTracking_SPA_xxxx blocks.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `enable Backtracking` | `Bool` | `FALSE` | Enable Backtracking |
| `azimuth` | `LReal` | `0.0` | Topocentric azimuth angle (eastward from north) [0, 360] [degree], STATUS ERROR CODE [16#8201] |
| `zenith` | `LReal` | `0.0` | Topocentric zenith angle [0, 180] [degree], STATUS ERROR CODE [16#8202] |
| `alpha` | `LReal` | `0.0` | Alpha angle, rotation in Azimuth [-180, 180] [degree], STATUS ERROR CODE [16#8203] |
| `beta` | `LReal` | `0.0` | Beta angle, rotation in Zenith [-90, 90] [degree], STATUS ERROR CODE [16#8204] |
| `distancePos` | `LReal` | `0.0` | Distance between Trackers for backtracking in the morning [0, +infinite] [meter], STATUS ERROR CODE [16#8205] |
| `distanceNeg` | `LReal` | `0.0` | Distance between Trackers for backtracking in the afternoon [0, +infinite] [meter], STATUS ERROR CODE [16#8206] |
| `width` | `LReal` | `0.0` | width of the short side [0, +infinite] [meter], STATUS ERROR CODE [16#8207] |
| `shadowLength` | `LReal` | `0.0` | Length of Shadow [0, Length] [meter], STATUS ERROR CODE [16#8208] |
| `groundSlope` | `LReal` | `0.0` | Slope angle of ground [-90, 90] [meter], STATUS ERROR CODE [16#8209] |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `phi` | `LReal` | One axis tracker angle with backtracking[- 90, 90] [degree] |
| `error` | `Bool` | Error |
| `status` | `Word` | Status and error code. 16#0000: success. 16#8201 - 16#8209: Input error. 16#9001: No result. |
| `busy` | `Bool` | Busy |
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
- The Single-Axis Tracking Calculation block uses the Solar Position Algorithm (SPA) to determine the precise position of the sun, including azimuth and zenith angles. It calculates the optimal track...
- Figure: Single Axis angle description
- **注意**：[Note] The rights to use the SPA algorithms were acquired from NREL with a corresponding legal agreement. The structure of the module is based on the corresponding C++ code of the master program. - Mandatory parameter...
