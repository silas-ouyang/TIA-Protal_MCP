# LGF_CalcCRC32Advanced (FC / V3.1.0)

- **分类**：Data handling (§4.8.4)
- **中文功能**：高级 CRC-32 校验计算（支持自定义多项式、初值与输入输出反转）
- **英文简述**：The CRC calculation is used for error detection at data transmission. The result of a calculation returns a CRC value via the data sent. The receiver detects a faulty transmission due to the unequal CRC value. The function LGF_CalcCRC3...

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `initValue` | `DWord` | `-` | Start value with which the calculation is executed. If there is no need for start value - assign 16#00 |
| `mask` | `DWord` | `-` | Generator polynomial with which the calculation is executed. (Mask / CRC polynomial) |
| `finalXorValue` | `DWord` | `-` | Value with which another XOR operation is performed at the end |
| `reflectInput` | `Bool` | `-` | TRUE: the sequence of the bits within the input byte is mirrored. The sequence 0...7 becomes 7...0. |
| `reflectResult` | `Bool` | `-` | TRUE: the order of the bits within the result is mirrored. The sequence 0...7 becomes 7...0. |
| `noOfElements` | `UInt` | `-` | Number of elements to be used in CRC calculation 0 = all elements / the whole array |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `DWord` | Calculated CRC value(return value of the function). |
| `error` | `Bool` | TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000 - 16#7FFF: Status of the FB, 16#8000 - 16#FFFF: Error identification |

## 输入/输出参数 (In/Out)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `array` | `Array[*] of Byte` | Data stream for which the CRC value will be calculated. |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#0000` | `STATUS_NO_ERROR` | No error occurred in function call |
| `16#8400` | `ERR_NO_OF_ELEMENTS` | Error: `noOfElements` exceeds the maximum number of array elements |

## 功能说明与使用要点
- The function calculates the CRC value from a data stream of any size. The data stream is composed of the individual elements of the array at the input/output parameter `array` .` The start value `...
- Via the Boolean input parameters `reflectInput` and `reflectResult` , you may optionally mirror the bits of the input data or the CRC value. An XOR operation is also performed with the CRC valu...
- The input `noOfELements` can be used to specify the desired number of elements for calculation, it applies:
- **𝑁𝑢𝑚𝑏𝑒𝑟𝑂𝑓𝐸𝑙𝑒𝑚𝑒𝑛𝑡𝑠<= (𝐴𝑟𝑟𝑎𝑦𝑈𝑝𝑝𝑒𝑟𝐿𝑖𝑚𝑖𝑡−𝐴𝑟𝑟𝑎𝑦𝐿𝑜𝑤𝑒𝑟𝑈𝑛𝑑𝑒𝑟𝐿𝑖𝑚𝑖𝑡+ 1)**
- Various online tools are available for calculating the CRC values. The function of the block was tested Note with the following online tool, since it supports the input parameters `mask` (Polynomia...
