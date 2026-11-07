# LGF_IsParityOdd (FC / V3.0.1)

- **分类**：Data handling (§4.8.9)
- **中文功能**：检验 DWORD 变量中二进制位值为 1 的总数是否为奇数（奇校验）
- **英文简述**：The function checks whether the parity of the input variable of type DWord is odd. The return value is set to `TRUE` if the number of bits that are assigned `TRUE` in the sequence is odd.

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `doubleWord utput parameter` | `DWord` | `-` | Variable for which the parity is to be determined. |
| `Identifier` | `Data type` | `-` | Description |
| `Ret_Val` | `Bool` | `-` | TRUE: When the number of bits that are assigned `TRUE` is odd |
