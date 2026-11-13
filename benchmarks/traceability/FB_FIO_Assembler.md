# 规格实现对照表：B07 `FB_FIO_Assembler`

- **代码文件**：[`FB_FIO_Assembler.scl`](file:///D:/TIA_MCP/benchmarks/golden_library/scl/FB_FIO_Assembler.scl)
- **配套 UDT**：[`UDT_HMI_FIO_Assembler.xml`](file:///D:/TIA_MCP/benchmarks/golden_library/udt/UDT_HMI_FIO_Assembler.xml)
- **编译结果**：第 1 次即 `0 Error, 0 Warning`

| 规格书条目 | 代码行号 | 实现状态 | 审查说明与偏差标注 |
| :--- | :--- | :--- | :--- |
| 1. `STEP_FEED_BOTH (10)`：分别驱动 `convLids`（至 `lidAtPlace=TRUE` 停）和 `convBases`（至 `baseAtPlace=TRUE` 停），双到位后进入夹紧步 | L168–L186 | ✅ 已实现 | `#tempConvLids := NOT #lidAtPlace; #tempConvBases := NOT #baseAtPlace;`，双到位后转入 `STEP_CLAMP_BOTH`。 |
| 2. `STEP_CLAMP_BOTH (20)`：触发 `clampLid=TRUE` 和 `clampBase=TRUE`，等待 `lidClamped AND baseClamped` 为 TRUE | L188–L213 | ✅ 已实现 | 双夹紧到位并经 `instDelayTimer` 稳定后进入 `STEP_Z_DOWN_LID`，超时报 `STEP_FAULT`。 |
| 3. `STEP_Z_DOWN_LID (30)` & `STEP_GRAB_LID (40)`：`moveZ=TRUE` 下降，到位后 `grab=TRUE` 吸取盖板，检测到 `itemDetected=TRUE` 后松开 `clampLid=FALSE` | L215–L267 | ✅ 已实现 | L246 在 `STEP_GRAB_LID` 中释放 `#tempClampLid := FALSE` 并开启真空 `#tempGrab := TRUE`，检测到 `#itemDetected` 稳定后进入上升步。 |
| 4. `STEP_Z_UP_LID (50)` -> `STEP_X_TO_BASE (60)` -> `STEP_Z_DOWN_ASSY (70)` -> `STEP_RELEASE_ASSY (80)`：Z上升 -> X移至底座上方 -> Z下降压装 -> 释放真空 | L269–L383 | ✅ 已实现 | 途中在 `STEP_Z_UP_LID` 与 `STEP_X_TO_BASE` 实时监控 `IF NOT #itemDetected THEN #statStep := #STEP_FAULT;`（掉件保护），且 L307 `#tempMoveX := (NOT #movingZ)` 保证了 Z 轴静止才允许 X 轴移动。 |
| 5. `STEP_EJECT (90)`：Z轴上升并X轴回原位，松开 `clampBase=FALSE`，抬起挡料板 `posRaise=TRUE`，启动 `convBases=TRUE` 送出成品，检测到 `partLeaving=TRUE` 后 `diAssembledCount + 1` 并循环 | L385–L413 | ⚠️ 存在 2 处传感器/时序细节偏差 | **发现 1**：输入引脚 `posAtLimit`（L14，底座挡料升降气缸到位反馈）按规格声明，但 `STEP_EJECT` 在置 `#tempPosRaise := TRUE` 的同一周期即启动了 `#tempConvBases := TRUE`，未等待 `#posAtLimit=TRUE` 后再启动底座传送带。<br>**发现 2**：在 `STEP_EJECT` 中若 `#partLeaving` 先于 Z 轴完全升起触发（L402），状态机将跳回 `STEP_FEED_BOTH (10)`，此时 `#tempMoveX` 立即变为 `FALSE`，若此时 Z 轴尚未完全升到位，X 轴会提前回退。 |
| 6. 任何动作步超时 (`tStepTimeout`) 报 `16#8401`；`eStopOk=FALSE` 时立即切断全部 8 个输出并置 `16#8402` | L131–L134, L200–L203, L227–L230, L254–L257, L284–L287, L315–L318, L343–L346, L370–L373, L398–L401, L442–L479 | ✅ 已实现 | 全部运动步均挂载 `instWatchdog`；急停触发时在状态机、L442 块尾和 L470–L477 输出赋值处三重硬切断全部 8 个执行器输出。 |
| 7. 遵循 `SE002` 与 `DA008` 规范 | L81–L93, L469–L479 | ✅ 已实现 | 全部临时变量显式初始化，输出在块尾集中写入一次。 |
