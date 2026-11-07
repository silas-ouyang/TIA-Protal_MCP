# LGF_EncodeUtf8 (FC / V1.0.0)

- **分类**：Converter operations (§4.9.10)
- **中文功能**：将博途宽字符文本（WString）编码转换为 UTF-8 格式的字节流数组
- **英文简述**：Encodes a WString into an UTF-8 encoded byte stream.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `sourceString` | `WString` | `-` | Character that shall be converted to UTF-8 |
| `startPos` | `DInt` | `-` | Position in encoded byte stream to start insert encoded WChars (Array lower bound is added) |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `Word` | 16#0000 - 16#7FFF: Status of the FC, 16#8000 - 16#FFFF: Error |
| `i` |  |  |
| `bytesUsed` | `UInt` | Number of Bytes converted. Ranges from 1 to 3. |

## 输入/输出参数 (In/Out)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `encodedByte` | `Array[*] of Byte` | UTF-8 conformant byte sequence. B0 stores first Byte, B1 second |
| `Stream` |  | and B2 third Byte. B3 is not used |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#0000` | `STATUS_NO_ERROR` | Status: No error |
| `16#8201` | `ERR_START_POS_OUTSIDE` | Error: Parameter `startPos` is outside array bounds |
| `16#8202` | `ERR_COUNT_EXCEEDS_BOUNDS` | Error: Lenght of array reached |
