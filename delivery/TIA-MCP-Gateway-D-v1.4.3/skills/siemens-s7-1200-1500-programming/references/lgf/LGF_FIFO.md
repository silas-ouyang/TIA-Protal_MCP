# LGF_FIFO (FB / V4.0.1)

- **分类**：Data handling (§4.8.11)
- **中文功能**：通用先进先出（FIFO）环形队列缓冲区（支持任意类型元素存取）
- **英文简述**：FIFO (First-In First-Out / Queue / ring buffer memory) The function stores incoming data and outputs the oldest unprocessed data.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `enable` | `Bool` | `FALSE` | TRUE: Enable functionality of FB |
| `enqueue` | `Bool` | `false` | Enqueue item to the buffer |
| `dequeue` | `Bool` | `false` | Dequeue item from the buffer and return it on `item` |
| `reset` | `Bool` | `FALSE` | Initializingthe buffer(reset the index and the counter) |
| `clear` | `Bool` | `FALSE` | Clearing the buffer and initialize with the initial value `initialItem` (Reset index and counter). |
| `initialItem` | `Variant` | `---` | Value with which the ARRAY of the buffer is initialized (usually: `0` / default value) |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `valid` | `Bool` | TRUE: Valid set of output values available at the FB |
| `busy` | `Bool` | TRUE: FB is active and new output values can be expected |
| `error` | `Bool` | FALSE: No error TRUE: An error occurred during the execution of the FB |
| `status` | `Word` | 16#0000-16#7FFF: Status of the FB 16#8000-16#FFFF: Error identification (see following Table) |
| `elementCount` | `DInt` | Number of elements in the buffer |
| `isEmpty` | `Bool` | TRUE: Buffer is empty |
| `isFull` | `Bool` | TRUE: Buffer is full |
| `diagnostics` | `LGF_type Diagnostics` | Diagnostic structure to store and transfer diagnostic information from blocks through the interface. |

## 输入/输出参数 (In/Out)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `item` | `Variant` | The entry that is either returned from the ring buffer or written into the |
| `b` |  |  |
| `buffer` | `Variant` | The ARRAY that is used as the ring buffer. (Array of…) |
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

## 功能说明与使用要点
- The status of called commands is output in `subFunctionStatus` . In this case, the output value in Note `status` indicates which command caused the error. In this case, refer to the TIA Portal Onli...
- In computer science, the queue is also based on the FIFO principle. Note
- With the `enqueue` input, a new item is stored from the InOut parameter `item` in the next free position in the buffer. The output `elementCount` is incremented by one.
- With the `dequeue` input, the next element to be processed is output to the InOut parameter `item` ,` and this field in the buffer is replaced by the value in the parameter `initialItem` .` The...
- With the `reset` input, the buffer is initialized, and the index and counter are reset. The `elementCount` output is set to zero and the `isEmpty` output is set to TRUE.
- With the `clear` input, the buffer is emptied and initialized with the initial value `initialItem` .` Index and counter are reset. The `elementCount` output is set to zero and the `isEmpty ...
