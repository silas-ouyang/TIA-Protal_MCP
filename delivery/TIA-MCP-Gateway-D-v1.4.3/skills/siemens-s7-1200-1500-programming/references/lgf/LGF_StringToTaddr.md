# LGF_StringToTaddr (FC / V3.0.1)

- **分类**：Converter operations (§4.9.20)
- **中文功能**：将包含 IP 与端口号的文本字符串解析转换为 TADDR_Param 结构
- **英文简述**：The system data type `TADDR_Param` contains address information consisting of an IPV4 address and the port number. The `LGF_StringToTaddr` function converts a variable od data type `String` to a `TADDR_Param` system data type var...

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `ipAddressString` | `String` | `-` | IPV4 address string in the format of `192.168.1.200:55047` [Port number including colon `:` is optional] |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `TADDR_Param` | IP-Address and Port number as `TADDR_Param` data type |
| `error` | `Bool` | FALSE: No error TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |

## 功能说明与使用要点
- The function converts the IPV4 address with or without port number from data type `String` to `TADDR_Param` . The string must be in the following form:
- - without port number: `[0..255].[0..255].[0..255].[0..255]`
- - with port number: `[0..255].[0..255].[0..255].[0..255]:[0..65535]`
- **Example:**
- - The standard string format for an IPV4 address without port number: `192.168.11.11`
- - The standard string format for an IPV4 address with port number: `192.168.11.11:3294`
- If you do not specify a port number in the `ipAddressString` parameter, the `Ret_Val.REM_PORT_NR` Note parameter returns `0` .
