# LGF_TaddrToString (FC / V3.0.1)

- **分类**：Converter operations (§4.9.22)
- **中文功能**：将 TADDR_Param 通信参数结构格式化转换为 'IP:Port' 形式文本
- **英文简述**：The system data type `TADDR_Param` contains address information consisting of an IPV4 address and the port number. The `LGF_TaddrToString` function converts a `TADDR_Param` system data type variable to a `String` data type variable.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `ipAdressTaddr` | `TADDR_Param` | `-` | IP-Address and Port number to convert into string |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `String` | IP-Address and Port number as string |

## 功能说明与使用要点
- The function converts the IPV4 address with or without port number. The system data type `TADDR_Param` is a structured data type. This structure contains the variable `REM_PORT_NR` . If this va...
- **Example Result at Ret_Val :**
- - The standard string format for an IPV4 address without port number: `192.168.11.11`
- - The standard string format for an IPV4 address with port number: `192.168.11.11:3294`
