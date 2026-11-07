# LGF_IsParityEven (FC / V3.0.1)

- **分类**：Data handling (§4.8.8)
- **中文功能**：检验 DWORD 变量中二进制位值为 1 的总数是否为偶数（偶校验）
- **英文简述**：The function checks whether the parity of the input variable of type DWord is even. If the number of bits that are assigned `TRUE` in the sequence is even, the return value is set to `TRUE` .

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `doubleWord utput parameter` | `DWord` | `-` | Variable for which the parityis to be determined. |
| `Identifier` | `Data type` | `-` | Description |
| `Ret_Val` | `Bool` | `-` | TRUE: When the number of bits that are assigned `TRUE` is even |
