# LGF_CalcCRC8For1Byte (FC / V3.0.1)

- **分类**：Data handling (§4.8.7)
- **中文功能**：针对单个输入字节（Byte）快速计算其 8 位 CRC 校验码
- **英文简述**：The CRC calculation is used for error detection at data transmission. The result of a calculation returns a CRC value via the data sent (Byte). The receiver detects a faulty transmission due to the unequal CRC value. The function LGF_C...

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `initValue` | `Byte` | `-` | Start value with which the calculation is executed. If there is no need for start value - assign 16#00 |
| `mask` | `Byte` | `-` | Generator polynomial with which the calculation is executed. (Mask / CRC polynomial) |
| `value` | `Byte` | `-` | Data byte for which the CRC value will be calculated. |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `Byte` | Calculated CRC value (return value of the function). |

## 功能说明与使用要点
- The function calculates the CRC value from a data byte `value` .` The start value `initValue` and the generator polynomial `mask can be freely selected.
- Various online tools are available for calculating the CRC values. The function of the block was tested Note with the following online tool, since it supports the input parameters `mask` (Polynomia...
- http://www.sunshine2k.de/coding/javascript/crc/crc_js.html
