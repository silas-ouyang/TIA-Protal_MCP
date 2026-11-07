# LGF_GpsDDToGps (FC / V3.0.2)

- **分类**：Converter operations (§4.9.11)
- **中文功能**：将十进制经纬度（GPS-DD）转换为传统度分秒方位格式（GPS-DMS）
- **英文简述**：This function converts a given GPS-DD data type (decimal degrees) into a GPS data type (direction, degrees, minutes, and seconds). GPS decimal degree to GPS “native”.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `gps` | `LGF_typeGPS_DD` | `-` | GPS-Data to be converted (decimal degrees), e.g. 52.520817 13.40945 |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `LGF_typeGPS` | Converted GPS-Data (direction, degrees, minutes, and seconds), e.g. N52° 31′ 14.941″ E13° 24′ 34.020″ |
| `error` | `Bool` | FALSE: No error TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
