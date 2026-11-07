# LGF_DecodeUtf8 (FC / V1.0.0)

- **分类**：Converter operations (§4.9.4)
- **中文功能**：将 UTF-8 编码的字节流数组解码转换为博途 WString 宽字符文本
- **英文简述**：Decodes a UTF-8 encoded byte stream into a WString

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `byteStream` | `Array[*] of Byte` | `-` | UTF-8 encoded byte stream |
| `startPos` | `DInt` | `-` | Position in byte stream to start decodingfrom |
| `count` | `UInt` | `-` | Number of character (not bytes) to decode; 0: byte stream is decoded until end |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `Word` | 16#0000 - 16#7FFF: Status of the FC, 16#8000 - 16#FFFF: Error identification |

## 输入/输出参数 (In/Out)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `decodedString` | `WString` | Decoded string |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#0000` | `STATUS_NO_ERROR` | Status: No error |
| `16#7FFD` | `WARN_UNSUPPORTED_CHAR` | Warning: Byte stream was decoded but contained unsupported characters |
| `16#7FFE` | `WARN_STREAM_EXCEEDS_MAX_LEN` | Warning: Byte stream exceeds max. length of the string at parameter `decodedString` |
| `16#8201` | `ERR_START_POS_OUTSIDE` | Error: Parameter `startPos` is outside array bounds |
| `16#8202` | `ERR_COUNT_EXCEEDS_BOUNDS` | Error: Parameter `count` is outside array bounds |
| `16#8203` | `ERR_COUNT_EXCEEDS_MAX_LEN` | Error: Parameter `count` exceeds max. length of a WString |
