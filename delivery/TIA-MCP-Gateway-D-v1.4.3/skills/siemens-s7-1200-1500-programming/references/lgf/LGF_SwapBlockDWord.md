# LGF_SwapBlockDWord (FC / V1.0.2)

- **分类**：Converter operations / Binary types - Byte Swaping (§4.10.1)
- **中文功能**：批量就地翻转 DWORD 双字数组元素的字节序（大端与小端互转）
- **英文简述**：Adjusts/ switches the endianness of multibyte data typed values. For this to achieve, a loop will iterate through the array elements and swap the bytes intrinsically.

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val n/Out parameter` | `Void` | Void - Function has no return value |
| `Identifier` | `Data type` | Description |
| `data` | `Array[*] of DWord` | Contains the data values, which will be endianness adjusted |
