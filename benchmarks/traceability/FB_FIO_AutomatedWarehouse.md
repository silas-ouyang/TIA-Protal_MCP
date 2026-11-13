# 规格实现对照表：B05 `FB_FIO_AutomatedWarehouse`

- **代码文件**：[`FB_FIO_AutomatedWarehouse.scl`](file:///D:/TIA_MCP/benchmarks/golden_library/scl/FB_FIO_AutomatedWarehouse.scl)
- **配套 UDT**：[`UDT_HMI_FIO_Warehouse.xml`](file:///D:/TIA_MCP/benchmarks/golden_library/udt/UDT_HMI_FIO_Warehouse.xml)
- **编译结果**：第 1 次即 `0 Error, 0 Warning`

| 规格书条目 | 代码行号 | 实现状态 | 审查说明与偏差标注 |
| :--- | :--- | :--- | :--- |
| 1. 参数合法性前置校验 (`targetCell` 必须在 `1..54` 范围内，否则报错 `16#8200`) | L149–L151 | ✅ 已实现 | 在 `STEP_IDLE` 收到触发上升沿时校验 `(#tempCell < #MIN_CELL) OR (#tempCell > #MAX_CELL)`，越界立即置 `#statStatus := 16#8200` 并进入 `STEP_FAULT`。 |
| 2. 堆垛机防撞核心铁律：只有当货叉完全处于中位 (`atMiddle=TRUE` 且 `forksLeft/Right=FALSE`) 才允许改变 `targetPosition` | L176, L244, L264, L326, L360–L363 | ✅ 已实现 | 块尾 L361–L363 强制执行 `IF #atMiddle AND (NOT #tempForkL) AND (NOT #tempForkR) THEN #ioHmi.iActiveTargetPos := #tempTargetPos; END_IF;`；且 `STEP_MOVE_SRC`/`DST` 均要求 `#tempAxisStill AND #atMiddle` 稳定达 `tAxisSettleTime` 后才允许伸出货叉。 |
| 3. 入库 (`modeRetrieve=FALSE`) 完整 9 步顺控：寻址55 -> 左伸 -> 微升 -> 缩回中位 -> 寻址1..54 -> 右伸 -> 微降 -> 缩回中位 -> 完成计数 | L160–L343 | ⚠️ 存在 2 处细节偏差 | **发现 1**：`STEP_DONE (90)` (L331–L343) 在完成计数后于 L342 立即执行了 `#statStep := #STEP_IDLE;`，导致块尾 L375/L384 `#done := (#statStep = #STEP_DONE)` 计算时 `#statStep` 已经变成 `0`，**使得 `done` / `ioHmi.bDone` 永远无法输出为期 1 个扫描周期的 `TRUE` 完成脉冲**（仅 `diStoredCount` / `diRetrievedCount` 递增且 `status=16#0000`）。<br>**发现 2**：输入引脚 `atEntry` 与 `atExit` (L9–L10) 按规格声明，但在 `STEP_FORK_EXT_PICK` / `STEP_FORK_EXT_PLACE` 中未作为前置联锁条件判读。 |
| 4. 出库 (`modeRetrieve=TRUE`) 完整 9 步顺控：寻址1..54 -> 右伸 -> 微升 -> 缩回中位 -> 寻址55 -> 右伸(放料侧) -> 微降 -> 缩回中位 -> 完成计数 | L162–L338 | ✅ 已实现 | 源位置与目标位置根据 `#statIsRetrieve` 自动镜像切换，完成时 `diRetrievedCount + 1`。 |
| 5. 寻址到位条件：`movingX=FALSE AND movingZ=FALSE` 且持续稳定达 `tAxisSettleTime` | L101, L176–L182, L264–L270 | ⚠️ 轻微习惯偏差 | 稳定滤波逻辑完全正确；但 L92–L98 在 `ioHmi.tAxisSettleTime <= T#0s` 时直接修改了 `InOut` 变量 `#ioHmi.tAxisSettleTime := T#800ms`（而非仅赋给临时变量）。 |
| 6. 任何寻址或货叉动作超过 `tMoveTimeout` 报 `16#8401`；`eStopOk=FALSE` 立即切断货叉与升降输出并报 `16#8402` | L131–L135, L171–L175, L199–L203, L239–L243, L259–L263, L285–L289, L321–L325, L366–L383 | ✅ 已实现 | 各运动步均挂载 `instMoveWatchdog`；急停触发时双保险硬切断 `#forksLeft/#forksRight/#lift` 并保持当前 `targetPosition` 不突变。 |
| 7. 遵循 `SE002` 与 `DA008` 规范 | L80–L89, L379–L387 | ✅ 已实现 | 全部临时变量显式初始化，输出在块尾集中写入一次。 |
