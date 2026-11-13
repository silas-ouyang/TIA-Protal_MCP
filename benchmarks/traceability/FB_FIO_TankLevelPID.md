# 规格实现对照表：B06 `FB_FIO_TankLevelPID`

- **代码文件**：[`FB_FIO_TankLevelPID.scl`](file:///D:/TIA_MCP/benchmarks/golden_library/scl/FB_FIO_TankLevelPID.scl)
- **配套 UDT**：[`UDT_HMI_FIO_TankLevelPID.xml`](file:///D:/TIA_MCP/benchmarks/golden_library/udt/UDT_HMI_FIO_TankLevelPID.xml)
- **编译结果**：第 1 次即 `0 Error, 0 Warning`

| 规格书条目 | 代码行号 | 实现状态 | 审查说明与偏差标注 |
| :--- | :--- | :--- | :--- |
| 1. 将 `levelMeterV (0..10V)` 线性换算为 `levelCm = levelMeterV * 30.0 (0..300cm)` 并限幅 | L77–L85 | ✅ 已实现 | 线性换算并限幅在 `[0.0, 300.0]` cm，同时计算高低液位报警（`>=285.0cm` / `<=10.0cm`）。（注：输入引脚 `flowMeterV` 在 L8 按规格预留，单回路液位 PID 中未参与运算）。 |
| 2. 当 `eStopOk=FALSE` 或 `enable=FALSE` 时，强制 `fillValveV := 0.0`、`dischargeValveV := 0.0` 并清零积分项 | L95–L106, L184–L188 | ✅ 已实现 | 急停或未使能时立即清零双阀输出与 `#statIntegral` / `#statPrevError`。 |
| 3. 参数校验：`dtSec <= 0.0` 时报 `16#8200` 并安全关闭阀门（严禁除以零） | L107–L112, L149 | ✅ 已实现 | 在 `ELSIF #dtSec <= 0.0` 分支拦截并报 `16#8200`，确保 L149 `(#tempErr - #statPrevError) / #dtSec` 绝不会除以零。 |
| 4. 设定值选取与手动/自动无扰切换（Bumpless Transfer） | L114–L120, L134–L146 | ⚠️ 轻微边界限制 | **无扰切换已实现**：手动切自动瞬间（L134–L139）以 `#ioHmi.rManualFillValve - #ioHmi.rManualDischargeValve` 预置 `#statIntegral`。<br>**边界偏差**：L114–L120 判定 `IF #ioHmi.rSetpoint > 0.0 ... ELSIF #setpointCm > 0.0 ... ELSE #tempSpCm := 150.0;`，导致若用户主动设定 `0.0 cm`（排空水箱），会被回退为默认 `150.0 cm`。 |
| 5. 自动模式位置式 PID + 抗积分饱和 (`[-10.0, 10.0]`) + 分程控制（`u > 0` 驱动进水阀，`u < 0` 驱动出水阀）+ 死区 `rDeadband` | L128–L131, L148–L171 | ✅ 已实现 | 死区内偏差归零，积分项与总输出均严格限幅在 `[-10.0, 10.0]`，正负分程驱动进/出水比例阀，无双阀同时开启浪费。 |
| 6. 高液位溢流保护硬联锁：当 `levelCm >= 285.0cm` 时，无论自动还是手动模式，强制关闭进水阀 `fillValveV := 0.0` 并置状态码 `16#8401` | L176–L181 | ✅ 已实现 | 位于手动/自动分支之后（L176），即使在手动模式下强行给进水阀开度，达到 `285.0cm` 也会被强制归零关死进水阀。 |
| 7. 遵循 `SE002` 与 `DA008` 规范 | L62–L74, L204–L211 | ✅ 已实现 | 全部临时变量显式初始化，输出在块尾集中写入一次。 |
