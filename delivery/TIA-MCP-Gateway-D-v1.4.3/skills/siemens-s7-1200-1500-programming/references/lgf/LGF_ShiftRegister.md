# LGF_ShiftRegister (FB / V4.0.0)

- **分类**：Data handling (§4.8.20)
- **中文功能**：通用多工位移位寄存器（支持左移/右移与产线物料跟踪状态保持）
- **英文简述**：The Function represents a shift register for any kind of Datatype (using `variant` )` . It is possible to shift the elements in the array at `bufferRegister` to the left (index `array[n]:=array[n+1]` ) or right (index `array[n]:=ar...

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `enable` | `Bool` | `FALSE` | TRUE: Enable functionalityof FB |
| `shiftLeft` | `Bool` | `FALSE` | Rising edge: Elements in the array `bufferRegister` shifted left. Elements moved from index `N` to `N - 1`. The element at index `N = 0`is overwritten |
| `shiftRight` | `Bool` | `FALSE` | Rising edge: Elements in the array `bufferRegister` shifted right. Elements moved from index `N` to `N + 1`. The element at index `N = lastIndex` is overwritten |
| `shiftRange` | `UInt` | `1` | Number of places to be shifted in the `bufferRegister` input array |
| `reset` | `Bool` | `FALSE` | Initializing the buffer (reset the index and the counter) |
| `clear` | `Bool` | `FALSE` | Clear buffer elements in `bufferRegister` with `initalItem` |
| `fill` | `Bool` | `FALSE` | Overwrite buffer elements after shift operation. * `shiftLeft` - the most right element/s * `shiftRight` - the most left element/s overwritten by `initalItem`. |
| `initialItem` | `Variant` | `---` | Value with which the ARRAY of the buffer is initialized (usually: `0` / default value) |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `valid` | `Bool` | TRUE: Valid set of output values available at the FB |
| `busy` | `Bool` | TRUE: FB is active and new output values can be expected |
| `error` | `Bool` | FALSE: No error TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |
| `leftShiftCount` | `DInt` | Number of left shift operations since clearing |
| `rightShiftCount` | `DInt` | Number of right shift operations since clearing |
| `shiftOffset Counter` | `DInt` | Offset of shift operations. `rightShift` - `leftShift` |
| `diagnostics` | `LGF_type Diagnostics` | Diagnostic structure to store and transfer diagnostic information from blocks through the interface. |

## 输入/输出参数 (In/Out)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `bufferRegister` | `Variant` | Buffer / Register memory as ARRAY, which keeps the data. The data in the register is shifted left or right depending on the command. |
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
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |
| ` | ` |  |

- **注意**：[Note] As this is a real shift operation, it may cause some runtime effects while using big array sizes to move at the input `bufferRegister` . Please consider that a FIFO or LIFO storage, based on indexes, could be u...
