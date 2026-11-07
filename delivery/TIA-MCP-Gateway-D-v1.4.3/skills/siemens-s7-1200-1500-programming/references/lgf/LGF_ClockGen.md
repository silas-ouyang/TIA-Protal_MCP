# LGF_ClockGen (FB / V1.0.1)

- **分类**：Signal generators (§4.14.1)
- **中文功能**：软件模拟生成 CPU 系统时钟存储器字节（0.5~10Hz 多频段方波及边沿）
- **英文简述**：This function generates the same clock signals as the system clock memory.

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `clockDataType` | `LGF_typeSystem ClockGen` | Clock data type |
| `clockDataType RisingEdge` | `LGF_typeSystem ClockGen` | Clock edge data type (rising edges) |
| `clockDataType FallingEdge` | `LGF_typeSystem ClockGen` | Clock edge data type (falling edges) |
| `clockByte` | `Byte` | Clock byte |
| `clockByteRising Edge` | `Byte` | Clock edge byte (rising edges) |
| `clockByte FallingEdge` | `Byte` | Clock edge byte (falling edges) |
| `clk10Hz` | `Bool` | Clock bit 10Hz |
| `clk5Hz` | `Bool` | Clock bit 5Hz |
| `clk2Hz5` | `Bool` | Clock bit 2.5Hz |
| `clk2Hz` | `Bool` | Clock bit 2Hz |
| `clk1Hz25` | `Bool` | Clock bit 1.25Hz |
| `clk1Hz` | `Bool` | Clock bit 1Hz |
| `clk0Hz625` | `Bool` | Clock bit 0.625Hz |
| `clk0Hz5` | `Bool` | Clock bit 0.5Hz |

## 功能说明与使用要点
- The module generates the clock flags known from the system. It uses the system function `Runtime` and calculates the clock flag states based on the time.
- The function block outputs the clocks in three formats:
- - Individual Boolean values
- - Clock byte
- - Clock data type
- In addition, the edges (rising and falling edges) are also evaluated and output as bytes and data structure.
