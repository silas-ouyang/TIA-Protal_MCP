# LGF_GetClockState (FB / V1.0.0)

- **分类**：Date and timer operations (§4.2.7)
- **中文功能**：读取 PLC 本地时间与系统时间，并返回网络 NTP 时钟同步状态
- **英文简述**：This function reads the local time, the system time and returns the NTP status.

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `localTime` | `DTL` | Local time |
| `systemTime` | `DTL` | System time(UTC) |
| `isDaylight SavingTime` | `Bool` | Daylight saving time active |
| `ntpActivated` | `Bool` | NTP Client activated |
| `error` | `Bool` | TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000 - 16#7FFF: Status of the FB, 16#8000 - 16#FFFF: Error identification |
| `diagnostics` | `LGF_type Diagnostics` | Diagnostics information of FB |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#0000` | `STATUS_FINISHED_NO_ERROR` | NO error occurred in function call |
| `16#8401` | `ERR_NTP_SERVER_SYNC_MISSING` | Error: NTP Client missing time synchronization |
| `16#8601` | `ERR_READ_LOCAL_TIME` | Error: Read local time |
| `16#8602` | `ERR_READ_SYSTEM_TIME` | Error: Read system time |

## 功能说明与使用要点
- If NTP time synchronization is activated in the hardware configuration, make sure that the time zone Note settings are correctly set to your local time zone!
