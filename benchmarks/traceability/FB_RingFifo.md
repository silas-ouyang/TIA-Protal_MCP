# 规格追溯表：`FB_RingFifo` (A05)

- **源文件**：[FB_RingFifo.scl](file:///D:/TIA_MCP/benchmarks/golden_library/scl/FB_RingFifo.scl)
- **配套 UDT**：[UDT_HMI_RingFifo.xml](file:///D:/TIA_MCP/benchmarks/golden_library/udt/UDT_HMI_RingFifo.xml)
- **编译状态**：`0 Error, 0 Warning`（一次通过）

## 1. 接口与架构规范追溯

| 规格条目 | 代码行号 | 是否实现 | 核查说明 |
| :--- | :--- | :---: | :--- |
| 启用 `{ S7_Optimized_Access := 'TRUE' }` (`DA003`) | L2 | ✅ 已实现 | 块属性声明优化访问 |
| 数组下标从 `0` 到常量上限、指针采用 `DInt` (`AL002`/`PE008`) | L25–L27, L45–L46 | ✅ 已实现 | `Array[0..31] of DInt`，`statHead`/`statTail` 为 `DInt` |
| `InOut` 挂载 `"UDT_HMI_RingFifo"` (`PE003`) | L20–L22 | ✅ 已实现 | `ioHmi` 引用传递 |
| 临时变量 `temp*` 先写后读初始化 (`SE002`) | L54–L60 | ✅ 已实现 | 7 个临时变量首段初始化 |
| 禁止回读 `VAR_OUTPUT` 形参 (`DA008`) | L141–L146 | ✅ 已实现 | 100% 末尾单向写入 Output |

## 2. 业务逻辑与安全联锁追溯

| 规格条目 | 代码行号 | 是否实现 | 核查说明 |
| :--- | :--- | :---: | :--- |
| 1. 清空优先：`clear OR ioHmi.bClearCmd` 重置 `statHead/statTail/statCount/statLastOut := 0` | L63–L71 | ⚠️ 轻微时序细节 | 清空段未使用 `RETURN` 或 `ELSIF` 互斥，若同一扫描周期 `clear=TRUE` 且恰逢 `enqueue` 上升沿，清空后会立即入队 1 个元素 |
| 2. 合并外部与 HMI 入队/出队请求并检测上升沿 | L74–L80 | ✅ 已实现 | `tempEnqRise` 与 `tempDeqRise` 边沿提取 |
| 3. 入队上升沿：满队报 `16#8001`，否则 O(1) 环形写入并 `MOD 32` | L98–L109 | ✅ 已实现 | `statHead := (statHead + 1) MOD CAPACITY_DINT` |
| 4. 出队上升沿：空队报 `16#8002`，否则 O(1) 环形读取并 `MOD 32` | L112–L123 | ✅ 已实现 | `statTail := (statTail + 1) MOD CAPACITY_DINT` |
| 5. 更新队首预览 `ioHmi.diHeadPreview` 及所有 Output | L126–L146 | ✅ 已实现 | 非空时预览 `statBuffer[statTail]`，空时为 `0` |

## 3. 漏项与偏差记录
- **边界时序细节 1 处**：L63 清空分支未与 L98/L112 入队/出队分支做 `ELSE` 互斥，当 `clear=TRUE` 与 `enqueue` 上升沿同周期同时到达时，会执行“先清空、后入队新元素”。
