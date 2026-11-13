# 规格追溯表：`FB_CylinderCtrl` (A03)

- **源文件**：[FB_CylinderCtrl.scl](file:///D:/TIA_MCP/benchmarks/golden_library/scl/FB_CylinderCtrl.scl)
- **配套 UDT**：[UDT_HMI_CylinderCtrl.xml](file:///D:/TIA_MCP/benchmarks/golden_library/udt/UDT_HMI_CylinderCtrl.xml)
- **编译状态**：`0 Error, 0 Warning`（一次通过）

## 1. 接口与架构规范追溯

| 规格条目 | 代码行号 | 是否实现 | 核查说明 |
| :--- | :--- | :---: | :--- |
| 启用 `{ S7_Optimized_Access := 'TRUE' }` (`DA003`) | L2 | ✅ 已实现 | 块属性声明优化访问 |
| 多重背景定时器声明在 `VAR` 区 (`AL001`) | L34–L36 | ✅ 已实现 | `instExtendTimeout`、`instRetractTimeout`、`instSensorBothTon : TON_TIME` |
| `InOut` 挂载 `"UDT_HMI_CylinderCtrl"` (`PE003`) | L26–L28 | ✅ 已实现 | `ioHmi` 引用传递 |
| 临时变量 `temp*` 先写后读初始化 (`SE002`) | L58–L63 | ✅ 已实现 | 6 个临时变量首段初始化 |
| 禁止回读 `VAR_OUTPUT` 形参 (`DA008`) | L153–L158 | ⚠️ 存在轻微偏差 | L157–L158 将 `#inExtendedPos` / `#inRetractedPos`（Output 形参）赋给 `#ioHmi.bIsExtended`（虽前一行已无条件赋值故编译器 0 警告，但严格按 `DA008` 应通过临时变量中转） |

## 2. 业务逻辑与安全联锁追溯

| 规格条目 | 代码行号 | 是否实现 | 核查说明 |
| :--- | :--- | :---: | :--- |
| 1. 急停最高优：`NOT eStopOk` 时 `statTargetExtend := FALSE`、切断双线圈输出并报 `16#8404` | L126–L144 | ✅ 已实现 | 急停无条件切断 `tempCoilExt` / `tempCoilRet` |
| 2. 磁性开关冲突诊断：`sensorExtended AND sensorRetracted` 持续 `T#200ms` 锁存 `16#8403` | L86–L90 | ✅ 已实现 | `instSensorBothTon` 防抖检测双亮冲突 |
| 3. 手自动命令源选择、缩回优先于伸出、伸出受 `interlockOk` 联锁限制 | L93–L108 | ✅ 已实现 | `IF #tempReqRetract ... ELSIF #tempReqExtend AND #interlockOk` |
| 4. 伸出/缩回动作超时保护（`16#8401` / `16#8402`）并切断输出 | L111–L123 | ✅ 已实现 | 超时锁存 `statError := TRUE` 并切断线圈 |
| 5. 单电控 (`doubleSolenoid=FALSE`) / 双电控电磁阀驱动与双线圈硬互锁 | L133–L150 | ✅ 已实现 | 块尾包含 `IF #tempCoilExt AND #tempCoilRet` 硬互锁保护 |

## 3. 漏项与偏差记录
- **规范偏差 1 处（`DA008`）**：L157–L158 回读了已赋值的 `VAR_OUTPUT` 参数 `#inExtendedPos` 与 `#inRetractedPos`。
- **行为细节观察 1 处**：双电控模式（L138–L139）在缩回到位后仍持续保持 `#tempCoilRet := TRUE`（长通电保持），对于双电控脉冲阀也可在到位后断电，当前保持式驱动对仿真与常规双电控阀均安全有效。
