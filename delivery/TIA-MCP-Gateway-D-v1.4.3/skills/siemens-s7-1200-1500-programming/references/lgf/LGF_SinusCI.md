# LGF_SinusCI (FB / V3.0.2)

- **分类**：Signal generators (§4.14.8)
- **中文功能**：循环中断中按中断周期生成连续平滑的正弦波（Sine）信号
- **英文简述**：This function generates a sinusoidal signal profile. For this it uses the time interval of the calling Cyclic Interrupt OB.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `amplitude` | `Real` | `1.0` | Amplitude of the signal profile. |
| `offset` | `Real` | `0.0` | Offset of the signal profile in the Y-direction. |
| `periode` | `UDInt` | `1000` | Period duration of the signal profile in [ms] |
| `phaseShift` | `Real` | `0.0` | Phase offset in [ms] |
| `callOB` | `OB_CYCLIC` | `---` | Callingcyclic interrupt OB |
| `reset` | `Bool` | `FALSE` | Reset of the signal profile. |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `value` | `Real` | Current value of the sinusoidal signal. |
| `error` | `Bool` | FALSE: No error TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |
| `subFunction Status` | `Word` | Status or return value of called FB's, FC's and system blocks |

## 状态与错误码 (Status & Error Codes)
| 代码 | 标识符 | 说明 |
| :--- | :--- | :--- |
| `16#0000` | `STATUS_FINISHED_NO_ERROR` | Status: Execution finished without errors |
| `16#8600` | `ERR_OB_UNAVAILABLE` | Error: OB on input `callOB` is not configured / present.<br>Interconnect the constant name of a configured cyclic interrupt OB at the input `callOB`. |

## 功能说明与使用要点
- The status of called commands is output in `subFunctionStatus` . In this case, the output value in Note `status` indicates which command caused the error. In this case, refer to the TIA Portal Onli...
- The block calculates the values for a sinusoidal signal profile, which is output to the output parameter `value` .
- The `amplitude` ,` the `offset` in the Y-direction, the `period` (in `ms` ) and the `phase shift` (in `ms ) can be set at the input parameters.
- The input parameter `reset` resets the signal profile. At the `value` output parameter, the value `0` is output as long as `reset` is set to `TRUE` .
- The block must be called in a cyclic interrupt OB. The time interval of the calling cyclic interrupt OB is determined in the FB with the command `QRY_CINT` . For this, the constant name of the ca...
- The number of calculated values of the signal profile per period duration is calculated as follows:
- **𝑃𝑒𝑟𝑖𝑜𝑑𝑑𝑢𝑟𝑎𝑡𝑖𝑜𝑛**
- 𝑄𝑢𝑎𝑛𝑡𝑖𝑡𝑦𝑉𝑎𝑙𝑢𝑒𝑠= 𝑇𝑖𝑚𝑒𝑖𝑛𝑡𝑒𝑟𝑣𝑎𝑘𝐶𝑦𝑐𝑙𝑖𝑐𝑖𝑛𝑡𝑒𝑟𝑟𝑢𝑝𝑡𝑂𝐵
- To obtain a continuous signal profile of the curve, the time interval of the cyclic interrupt OB should not Note be selected too large depending on the period duration.
- The Figure below shows the signal profile of the calculated values.
