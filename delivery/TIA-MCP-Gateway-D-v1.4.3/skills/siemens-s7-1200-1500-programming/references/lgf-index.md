# 西门子 LGF 通用函数库 (V5.5.0) —— 189 块全量速查索引

> ⚠️ **调用前必读铁律**：LGF 是西门子扩展库（条目 ID: 109479728），**不是** TIA Portal CPU 内置指令！
> 1. **工程已有 LGF 库**：通过 `d_tree` 确认工程存在目标 `LGF_*` 块后，按下方路径读取 `references/lgf/<块名>.md` 获取精确引脚表与状态码。
> 2. **工程未导入 LGF 库**：**严禁在代码中直接写 `LGF_*` 调用**（否则必报块不存在编译错误）！请读取 `references/lgf-blueprints.md` 或对应块的 `.md` 详情，参照其官方接口与算法用原生 SCL 自行编写同款 FC/FB。

## 189 块速查表（格式：`块名 | 类型 | 版本 | 中文功能简述 | 原文章节 | 详情文件`）

| 块名 | 类型 | 版本 | 中文功能简述 | 章节 | 详情文件 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `LGF_BitReset` | FC | 3.0.1 | 将 DWord 变量中指定位号（bitNo）的位复位为 FALSE | §4.1.1 | [`LGF_BitReset.md`](lgf/LGF_BitReset.md) |
| `LGF_BitSet` | FC | 3.0.1 | 将 DWord 变量中指定位号（bitNo）的位置位为 TRUE | §4.1.2 | [`LGF_BitSet.md`](lgf/LGF_BitSet.md) |
| `LGF_BitSetTo` | FC | 3.0.1 | 将 DWord 变量中指定位号的位按给定值置为 TRUE 或 FALSE | §4.1.3 | [`LGF_BitSetTo.md`](lgf/LGF_BitSetTo.md) |
| `LGF_BitTest` | FC | 3.0.1 | 检测 DWord 变量中指定位号的状态并作为布尔返回值输出 | §4.1.4 | [`LGF_BitTest.md`](lgf/LGF_BitTest.md) |
| `LGF_BitToggle` | FC | 3.0.1 | 将 DWord 变量中指定位号的布尔状态取反翻转 | §4.1.5 | [`LGF_BitToggle.md`](lgf/LGF_BitToggle.md) |
| `LGF_IecTimerOnOff` | FB | 1.0.0 | 集成通电延时（TON）与断电延时（TOF）的双向防抖定时器 | §4.1.6 | [`LGF_IecTimerOnOff.md`](lgf/LGF_IecTimerOnOff.md) |
| `LGF_PulseRelay` | FB | 3.0.1 | 单按钮脉冲继电器/双稳态翻转触发器，支持复位与置位优先 | §4.1.7 | [`LGF_PulseRelay.md`](lgf/LGF_PulseRelay.md) |
| `LGF_GetCalendarDay` | FC | 3.0.1 | 根据指定 DTL 日期计算自当年1月1日起经过的年积日天数 | §4.2.1 | [`LGF_GetCalendarDay.md`](lgf/LGF_GetCalendarDay.md) |
| `LGF_GetCalendarWeek_ISO` | FC | 3.0.1 | 按 ISO 8601 标准计算指定日期所属的日历周次与年积日 | §4.2.2 | [`LGF_GetCalendarWeek_ISO.md`](lgf/LGF_GetCalendarWeek_ISO.md) |
| `LGF_GetCalendarWeek_US` | FC | 3.0.1 | 按美洲标准（周日为首日）计算指定日期的日历周次与年积日 | §4.2.3 | [`LGF_GetCalendarWeek_US.md`](lgf/LGF_GetCalendarWeek_US.md) |
| `LGF_IsGermanHoliday` | FC | 3.0.1 | 判定指定日期是否为德国法定节假日（支持特定联邦州过滤） | §4.2.4 | [`LGF_IsGermanHoliday.md`](lgf/LGF_IsGermanHoliday.md) |
| `LGF_AstroClock` | FB | 3.0.1 | 根据地理 GPS 经纬度坐标与本地时间解算日出与日落时刻 | §4.2.5 | [`LGF_AstroClock.md`](lgf/LGF_AstroClock.md) |
| `LGF_DelayProgram` | FB | 1.0.0 | 阻塞式空循环延时块，用于人工增加 PLC 负荷以模拟高负载工况 | §4.2.6 | [`LGF_DelayProgram.md`](lgf/LGF_DelayProgram.md) |
| `LGF_GetClockState` | FB | 1.0.0 | 读取 PLC 本地时间与系统时间，并返回网络 NTP 时钟同步状态 | §4.2.7 | [`LGF_GetClockState.md`](lgf/LGF_GetClockState.md) |
| `LGF_SetTime` | FB | 3.0.3 | 综合读取并配置 PLC 系统时间、本地时间及夏令时时区参数 | §4.2.8 | [`LGF_SetTime.md`](lgf/LGF_SetTime.md) |
| `LGF_TimerSwitch` | FB | 3.1.0 | 多模式日历定时开关（支持按日、周、月、年及工作日定时启闭） | §4.2.9 | [`LGF_TimerSwitch.md`](lgf/LGF_TimerSwitch.md) |
| `LGF_CalcSolarVector_SPA_xxxx` | FB | 1.0.0 | 基于 NREL SPA 算法解算高精度太阳视位置（方位角与天顶角） | §4.3.1 | [`LGF_CalcSolarVector_SPA_xxxx.md`](lgf/LGF_CalcSolarVector_SPA_xxxx.md) |
| `LGF_singleAxisTracking_SPA_xxxx` | FB | 1.0.0 | 结合 SPA 太阳位置与防遮挡回退算法解算单轴光伏跟踪器倾角 | §4.3.2 | [`LGF_singleAxisTracking_SPA_xxxx.md`](lgf/LGF_singleAxisTracking_SPA_xxxx.md) |
| `LGF_BitCount` | FC | 3.0.2 | 统计 DWord 变量中状态为 TRUE 与 FALSE 的二进制位总数 | §4.4.1 | [`LGF_BitCount.md`](lgf/LGF_BitCount.md) |
| `LGF_CountArrayElements` | FC | 1.0.0 | 动态读取一维变长数组（Variant）的元素总个数（零基计数） | §4.4.2 | [`LGF_CountArrayElements.md`](lgf/LGF_CountArrayElements.md) |
| `LGF_CountBooleanEdges` | FB | 1.0.0 | 在设定监控时间窗口内统计输入布尔信号的单脉冲或多次边沿 | §4.4.3 | [`LGF_CountBooleanEdges.md`](lgf/LGF_CountBooleanEdges.md) |
| `LGF_CountFalInDWord` | FB | 3.0.1 | 从高位到低位检索统计 DWORD 变量中 1 到 0 下降沿序列总次数 | §4.4.4 | [`LGF_CountFalInDWord.md`](lgf/LGF_CountFalInDWord.md) |
| `LGF_CountRisInDWord` | FB | 3.0.1 | 从高位到低位检索统计 DWORD 变量中 0 到 1 上升沿序列总次数 | §4.4.5 | [`LGF_CountRisInDWord.md`](lgf/LGF_CountRisInDWord.md) |
| `LGF_GetBitStates` | FB | 1.0.0 | 周期比对 DWORD 变量并输出上升沿/下降沿位掩码及边沿总数 | §4.4.6 | [`LGF_GetBitStates.md`](lgf/LGF_GetBitStates.md) |
| `LGF_BinaryMaskCompare` | FC | 1.0.0 | 使用指定二进制掩码过滤后对比两个 DWORD 数值是否相等 | §4.5.1 | [`LGF_BinaryMaskCompare.md`](lgf/LGF_BinaryMaskCompare.md) |
| `LGF_CompareLReal` | FC | 3.0.2 | 采用 1.0E-12 固定皮秒级容差比对两个 LReal 双精度浮点数 | §4.5.2 | [`LGF_CompareLReal.md`](lgf/LGF_CompareLReal.md) |
| `LGF_CompareLRealByPrecision` | FC | 3.0.2 | 按用户自定义浮点绝对精度（precision）比对两个 LReal 是否相等 | §4.5.3 | [`LGF_CompareLRealByPrecision.md`](lgf/LGF_CompareLRealByPrecision.md) |
| `LGF_CompareString` | FC | 1.0.0 | 按字符字典序比对两个字符串大小并返回关系结果数值编码 | §4.5.4 | [`LGF_CompareString.md`](lgf/LGF_CompareString.md) |
| `LGF_CompareVariant` | FC | 3.0.1 | 比对两个结构体或数组变量（最大200字节）的类型与数据一致性 | §4.5.5 | [`LGF_CompareVariant.md`](lgf/LGF_CompareVariant.md) |
| `LGF_CalcDistance_2D` | FC | 3.0.1 | 根据两点平面坐标（X, Y）计算二维空间欧几里得几何距离 | §4.6.1 | [`LGF_CalcDistance_2D.md`](lgf/LGF_CalcDistance_2D.md) |
| `LGF_CalcDistance_3D` | FC | 3.0.1 | 根据两点空间坐标（X, Y, Z）计算三维空间欧几里得几何距离 | §4.6.2 | [`LGF_CalcDistance_3D.md`](lgf/LGF_CalcDistance_3D.md) |
| `LGF_GetFactorial` | FC | 3.0.1 | 计算自然数的阶乘（0!~12!），计算结果以 DInt 整数输出 | §4.6.3 | [`LGF_GetFactorial.md`](lgf/LGF_GetFactorial.md) |
| `LGF_IsNumber` | FC | 1.0.0 | 校验 LReal 浮点数是否为有效数值（排除非数 NaN 与无穷大 INF） | §4.6.4 | [`LGF_IsNumber.md`](lgf/LGF_IsNumber.md) |
| `LGF_IsValueInLimits` | FC | 3.0.1 | 判定输入数值是否落在指定的上下限绝对区间（low~high）以内 | §4.6.5 | [`LGF_IsValueInLimits.md`](lgf/LGF_IsValueInLimits.md) |
| `LGF_IsValueInRange` | FC | 3.0.1 | 根据设定中心值与绝对偏差范围判定输入数值是否在合格区间内 | §4.6.6 | [`LGF_IsValueInRange.md`](lgf/LGF_IsValueInRange.md) |
| `LGF_IsValueInTolerance` | FC | 3.0.2 | 根据目标设定值与百分比公差带（%）判定输入数值是否在合格区间 | §4.6.7 | [`LGF_IsValueInTolerance.md`](lgf/LGF_IsValueInTolerance.md) |
| `LGF_NthRoot` | FC | 3.0.1 | 计算输入浮点数值的指定 N 次方根（开 N 次方根运算） | §4.6.8 | [`LGF_NthRoot.md`](lgf/LGF_NthRoot.md) |
| `LGF_Random_DInt` | FC | 3.0.1 | 每次调用生成一个均匀分布的 32 位 DInt 类型伪随机整数 | §4.6.9 | [`LGF_Random_DInt.md`](lgf/LGF_Random_DInt.md) |
| `LGF_Random_Real` | FC | 3.0.1 | 每次调用生成一个介于 [0.0, 1.0] 之间的 Real 浮点伪随机数 | §4.6.10 | [`LGF_Random_Real.md`](lgf/LGF_Random_Real.md) |
| `LGF_Random_UDInt` | FC | 3.0.1 | 每次调用生成一个均匀分布的 32 位 UDInt 无符号伪随机整数 | §4.6.11 | [`LGF_Random_UDInt.md`](lgf/LGF_Random_UDInt.md) |
| `LGF_RandomRange_DInt` | FC | 3.0.1 | 在指定的最小值与最大值区间范围内生成一个 DInt 伪随机整数 | §4.6.12 | [`LGF_RandomRange_DInt.md`](lgf/LGF_RandomRange_DInt.md) |
| `LGF_RandomRange_Real` | FC | 3.0.1 | 在指定的最小值与最大值区间范围内生成一个 Real 浮点伪随机数 | §4.6.13 | [`LGF_RandomRange_Real.md`](lgf/LGF_RandomRange_Real.md) |
| `LGF_RandomRange_UDInt` | FC | 3.0.1 | 在指定的最小值与最大值区间范围内生成一个 UDInt 伪随机整数 | §4.6.14 | [`LGF_RandomRange_UDInt.md`](lgf/LGF_RandomRange_UDInt.md) |
| `LGF_RoundByPrecision` | FC | 1.0.0 | 将双精度浮点数（LReal）按指定小数位精度进行四舍五入规整 | §4.6.15 | [`LGF_RoundByPrecision.md`](lgf/LGF_RoundByPrecision.md) |
| `LGF_ScaleLinear` | FC | 3.0.1 | 工业模拟量两点线性标定换算（带上下限限幅与超限报警标志） | §4.6.16 | [`LGF_ScaleLinear.md`](lgf/LGF_ScaleLinear.md) |
| `LGF_SearchMinMax` | FC | 3.0.1 | 在通用类型一维数组中查找极大值、极小值及其对应元素下标 | §4.6.17 | [`LGF_SearchMinMax.md`](lgf/LGF_SearchMinMax.md) |
| `LGF_SearchMinMax_DInt` | FC | 3.0.2 | 在 DInt 整数数组中快速检索最大值、最小值及其对应数组索引 | §4.6.18 | [`LGF_SearchMinMax_DInt.md`](lgf/LGF_SearchMinMax_DInt.md) |
| `LGF_SearchMinMax_LReal` | FC | 3.0.2 | 在 LReal 双精度浮点数组中检索最大值、最小值及其对应数组索引 | §4.6.19 | [`LGF_SearchMinMax_LReal.md`](lgf/LGF_SearchMinMax_LReal.md) |
| `LGF_SearchMinMax_UDInt` | FC | 3.0.1 | 在 UDInt 无符号整数数组中检索最大值、最小值及其对应数组索引 | §4.6.20 | [`LGF_SearchMinMax_UDInt.md`](lgf/LGF_SearchMinMax_UDInt.md) |
| `LGF_Integration` | FB | 3.1.0 | 连续模拟量时间梯形数值积分器（以秒为基准，用于流量/位移累积） | §4.6.21 | [`LGF_Integration.md`](lgf/LGF_Integration.md) |
| `LGF_IsValueInToleranceByTime` | FB | 1.0.0 | 过程值超公差带时间监控器（带设定值变更屏蔽与超差延时报警） | §4.6.22 | [`LGF_IsValueInToleranceByTime.md`](lgf/LGF_IsValueInToleranceByTime.md) |
| `LGF_SimpleAveraging` | FB | 1.0.0 | 循环或触发采集 LReal 浮点数值序列的动态算术平均值滤波 | §4.6.23 | [`LGF_SimpleAveraging.md`](lgf/LGF_SimpleAveraging.md) |
| `LGF_StoreMinMax` | FB | 3.0.1 | 在线持续跟踪并锁存自复位以来输入 LReal 模拟量的历史极值 | §4.6.24 | [`LGF_StoreMinMax.md`](lgf/LGF_StoreMinMax.md) |
| `LGF_MatrixAddition` | FC | 3.0.1 | 计算两个相同维度的二维 LReal 矩阵元素逐项相加并输出矩阵 | §4.7.1 | [`LGF_MatrixAddition.md`](lgf/LGF_MatrixAddition.md) |
| `LGF_MatrixCompare` | FC | 3.0.1 | 比对两个相同维度的二维 LReal 矩阵所有对应元素是否完全相等 | §4.7.2 | [`LGF_MatrixCompare.md`](lgf/LGF_MatrixCompare.md) |
| `LGF_MatrixInverse` | FC | 3.0.1 | 采用 Shipley-Coleman 算法求解任意阶二维 LReal 方阵的逆矩阵 | §4.7.3 | [`LGF_MatrixInverse.md`](lgf/LGF_MatrixInverse.md) |
| `LGF_MatrixMultiplication` | FC | 3.0.1 | 执行两个二维 LReal 矩阵的标准代数乘法运算（M*K 乘以 K*N） | §4.7.4 | [`LGF_MatrixMultiplication.md`](lgf/LGF_MatrixMultiplication.md) |
| `LGF_MatrixScalarMultiplication` | FC | 3.0.2 | 将二维 LReal 矩阵中的每一个元素与标量常数系数逐项相乘 | §4.7.5 | [`LGF_MatrixScalarMultiplication.md`](lgf/LGF_MatrixScalarMultiplication.md) |
| `LGF_MatrixSubtraction` | FC | 3.0.1 | 计算两个相同维度的二维 LReal 矩阵各元素逐项相减 | §4.7.6 | [`LGF_MatrixSubtraction.md`](lgf/LGF_MatrixSubtraction.md) |
| `LGF_MatrixTranspose` | FC | 3.0.1 | 对二维 LReal 矩阵执行转置操作（行列互换，M*N 转为 N*M） | §4.7.7 | [`LGF_MatrixTranspose.md`](lgf/LGF_MatrixTranspose.md) |
| `LGF_CalcCRC16` | FC | 3.1.0 | 计算字节流数据的标准 16 位循环冗余校验码（CRC-16） | §4.8.1 | [`LGF_CalcCRC16.md`](lgf/LGF_CalcCRC16.md) |
| `LGF_CalcCRC16Advanced` | FC | 3.1.0 | 高级 CRC-16 校验计算（支持自定义多项式掩码、初值与位反转） | §4.8.2 | [`LGF_CalcCRC16Advanced.md`](lgf/LGF_CalcCRC16Advanced.md) |
| `LGF_CalcCRC32` | FC | 3.1.0 | 计算字节流数据的标准 32 位循环冗余校验码（CRC-32） | §4.8.3 | [`LGF_CalcCRC32.md`](lgf/LGF_CalcCRC32.md) |
| `LGF_CalcCRC32Advanced` | FC | 3.1.0 | 高级 CRC-32 校验计算（支持自定义多项式、初值与输入输出反转） | §4.8.4 | [`LGF_CalcCRC32Advanced.md`](lgf/LGF_CalcCRC32Advanced.md) |
| `LGF_CalcCRC8` | FC | 3.1.0 | 计算字节流数据的标准 8 位循环冗余校验码（CRC-8） | §4.8.5 | [`LGF_CalcCRC8.md`](lgf/LGF_CalcCRC8.md) |
| `LGF_CalcCRC8Advanced` | FC | 3.1.0 | 高级 CRC-8 校验计算（支持自定义多项式掩码、初值与位反转） | §4.8.6 | [`LGF_CalcCRC8Advanced.md`](lgf/LGF_CalcCRC8Advanced.md) |
| `LGF_CalcCRC8For1Byte` | FC | 3.0.1 | 针对单个输入字节（Byte）快速计算其 8 位 CRC 校验码 | §4.8.7 | [`LGF_CalcCRC8For1Byte.md`](lgf/LGF_CalcCRC8For1Byte.md) |
| `LGF_IsParityEven` | FC | 3.0.1 | 检验 DWORD 变量中二进制位值为 1 的总数是否为偶数（偶校验） | §4.8.8 | [`LGF_IsParityEven.md`](lgf/LGF_IsParityEven.md) |
| `LGF_IsParityOdd` | FC | 3.0.1 | 检验 DWORD 变量中二进制位值为 1 的总数是否为奇数（奇校验） | §4.8.9 | [`LGF_IsParityOdd.md`](lgf/LGF_IsParityOdd.md) |
| `LGF_DataLogC` | FB | 1.0.0 | 紧凑型数据记录器（集成创建、写入、读取与自动归档状态机） | §4.8.10 | [`LGF_DataLogC.md`](lgf/LGF_DataLogC.md) |
| `LGF_FIFO` | FB | 4.0.1 | 通用先进先出（FIFO）环形队列缓冲区（支持任意类型元素存取） | §4.8.11 | [`LGF_FIFO.md`](lgf/LGF_FIFO.md) |
| `LGF_FileDelete` | FB | 1.0.0 | 删除 PLC 存储卡（SMC）UserFiles 目录下的指定文件 | §4.8.12 | [`LGF_FileDelete.md`](lgf/LGF_FileDelete.md) |
| `LGF_FileRead` | FB | 1.0.1 | 从 SMC 存储卡 UserFiles 目录中读取文件并反序列化为数据流 | §4.8.13 | [`LGF_FileRead.md`](lgf/LGF_FileRead.md) |
| `LGF_FileReadWriteDelete` | FB | 1.0.0 | SMC 存储卡 UserFiles 目录文件的读取、写入与删除一体化管理 | §4.8.14 | [`LGF_FileReadWriteDelete.md`](lgf/LGF_FileReadWriteDelete.md) |
| `LGF_FileWrite` | FB | 1.1.0 | 将二进制或序列化数据流写入 SMC 存储卡 UserFiles 目录的文件 | §4.8.15 | [`LGF_FileWrite.md`](lgf/LGF_FileWrite.md) |
| `LGF_LIFO` | FB | 4.0.1 | 通用后进先出（LIFO）堆栈缓冲区（支持任意类型压栈与弹栈） | §4.8.16 | [`LGF_LIFO.md`](lgf/LGF_LIFO.md) |
| `LGF_ShellSort_DInt` | FB | 3.0.1 | 采用希尔排序算法对 DInt 整数数组就地进行升序或降序排列 | §4.8.17 | [`LGF_ShellSort_DInt.md`](lgf/LGF_ShellSort_DInt.md) |
| `LGF_ShellSort_LReal` | FB | 3.0.1 | 采用希尔排序算法对 LReal 浮点数组就地进行升序或降序排列 | §4.8.18 | [`LGF_ShellSort_LReal.md`](lgf/LGF_ShellSort_LReal.md) |
| `LGF_ShellSort_UDInt` | FB | 3.0.1 | 采用希尔排序算法对 UDInt 数组就地进行升序或降序排列 | §4.8.19 | [`LGF_ShellSort_UDInt.md`](lgf/LGF_ShellSort_UDInt.md) |
| `LGF_ShiftRegister` | FB | 4.0.0 | 通用多工位移位寄存器（支持左移/右移与产线物料跟踪状态保持） | §4.8.20 | [`LGF_ShiftRegister.md`](lgf/LGF_ShiftRegister.md) |
| `LGF_StartValueReadWrite` | FB | 1.0.0 | 在线读取运行时数值或将其写回保存为 DB 块与变量的初始启动值 | §4.8.21 | [`LGF_StartValueReadWrite.md`](lgf/LGF_StartValueReadWrite.md) |
| `LGF_BinaryToGray` | FC | 3.0.1 | 将二进制编码格式的整数数值转换为对应的格雷码（Gray Code） | §4.9.1 | [`LGF_BinaryToGray.md`](lgf/LGF_BinaryToGray.md) |
| `LGF_ConvertPressure` | FC | 1.0.0 | 常用工业压力单位相互换算（支持 Pa、bar、psi、atm、Torr 等） | §4.9.2 | [`LGF_ConvertPressure.md`](lgf/LGF_ConvertPressure.md) |
| `LGF_ConvertSpeed` | FC | 1.0.0 | 常用线速度与旋转速度单位相互换算（m/s、km/h、rpm、knot 等） | §4.9.3 | [`LGF_ConvertSpeed.md`](lgf/LGF_ConvertSpeed.md) |
| `LGF_DecodeUtf8` | FC | 1.0.0 | 将 UTF-8 编码的字节流数组解码转换为博途 WString 宽字符文本 | §4.9.4 | [`LGF_DecodeUtf8.md`](lgf/LGF_DecodeUtf8.md) |
| `LGF_DTLToJulianDate` | FC | 0.0.1 | 将 DTL 日期时间转换为天文儒略日（Julian Date）及修正儒略日 | §4.9.5 | [`LGF_DTLToJulianDate.md`](lgf/LGF_DTLToJulianDate.md) |
| `LGF_DTLToString_DE` | FC | 3.1.1 | 将 DTL 日期时间格式化转换为传统德标日期文本（DD.MM.YYYY） | §4.9.6 | [`LGF_DTLToString_DE.md`](lgf/LGF_DTLToString_DE.md) |
| `LGF_DTLToString_ISO` | FC | 3.1.1 | 将 DTL 日期时间格式化转换为 ISO 8601 标准文本（YYYY-MM-DD） | §4.9.7 | [`LGF_DTLToString_ISO.md`](lgf/LGF_DTLToString_ISO.md) |
| `LGF_DTLToString_US` | FC | 1.0.1 | 将 DTL 日期时间格式化转换为美标格式日期文本（MM/DD/YYYY） | §4.9.8 | [`LGF_DTLToString_US.md`](lgf/LGF_DTLToString_US.md) |
| `LGF_DTLToUnixTime` | FC | 3.0.2 | 将 DTL 格式 UTC 日期时间换算转换为 32 位 Unix 秒级时间戳 | §4.9.9 | [`LGF_DTLToUnixTime.md`](lgf/LGF_DTLToUnixTime.md) |
| `LGF_EncodeUtf8` | FC | 1.0.0 | 将博途宽字符文本（WString）编码转换为 UTF-8 格式的字节流数组 | §4.9.10 | [`LGF_EncodeUtf8.md`](lgf/LGF_EncodeUtf8.md) |
| `LGF_GpsDDToGps` | FC | 3.0.2 | 将十进制经纬度（GPS-DD）转换为传统度分秒方位格式（GPS-DMS） | §4.9.11 | [`LGF_GpsDDToGps.md`](lgf/LGF_GpsDDToGps.md) |
| `LGF_GpsToGpsDD` | FC | 3.0.2 | 将传统度分秒方位格式（GPS-DMS）转换为十进制经纬度（GPS-DD） | §4.9.12 | [`LGF_GpsToGpsDD.md`](lgf/LGF_GpsToGpsDD.md) |
| `LGF_GrayToBinary` | FC | 3.0.1 | 将格雷码（Gray Code）编码数值还原转换回标准二进制数值 | §4.9.13 | [`LGF_GrayToBinary.md`](lgf/LGF_GrayToBinary.md) |
| `LGF_IntToString` | FC | 3.0.1 | 将 DInt 有符号长整型数值格式化转换为 ASCII 文本字符串 | §4.9.14 | [`LGF_IntToString.md`](lgf/LGF_IntToString.md) |
| `LGF_JulianTimeToDTL` | FC | 0.0.1 | 将天文儒略日（或修正儒略日）浮点数值还原换算为 DTL 日期时间 | §4.9.15 | [`LGF_JulianTimeToDTL.md`](lgf/LGF_JulianTimeToDTL.md) |
| `LGF_StringToDTL_DE` | FC | 3.1.0 | 解析德标格式日期时间文本字符串并重构转换为系统 DTL 变量 | §4.9.16 | [`LGF_StringToDTL_DE.md`](lgf/LGF_StringToDTL_DE.md) |
| `LGF_StringToDTL_ISO` | FC | 3.1.0 | 解析 ISO 8601 标准日期时间文本字符串并重构转换为 DTL 变量 | §4.9.17 | [`LGF_StringToDTL_ISO.md`](lgf/LGF_StringToDTL_ISO.md) |
| `LGF_StringToDTL_US` | FC | 1.0.0 | 解析美标格式日期时间文本字符串并重构转换为系统 DTL 变量 | §4.9.18 | [`LGF_StringToDTL_US.md`](lgf/LGF_StringToDTL_US.md) |
| `LGF_StringToInt` | FC | 3.0.1 | 解析包含数字的文本字符串并将其转换为 DInt 类型有符号整数 | §4.9.19 | [`LGF_StringToInt.md`](lgf/LGF_StringToInt.md) |
| `LGF_StringToTaddr` | FC | 3.0.1 | 将包含 IP 与端口号的文本字符串解析转换为 TADDR_Param 结构 | §4.9.20 | [`LGF_StringToTaddr.md`](lgf/LGF_StringToTaddr.md) |
| `LGF_StringToTime` | FC | 3.1.0 | 将持续时间文本字符串（如 'T#5s'）解析转换为系统 Time 变量 | §4.9.21 | [`LGF_StringToTime.md`](lgf/LGF_StringToTime.md) |
| `LGF_TaddrToString` | FC | 3.0.1 | 将 TADDR_Param 通信参数结构格式化转换为 'IP:Port' 形式文本 | §4.9.22 | [`LGF_TaddrToString.md`](lgf/LGF_TaddrToString.md) |
| `LGF_TimeToString` | FC | 3.1.0 | 将系统 Time 持续时间变量转换为易读的文本字符串（String） | §4.9.23 | [`LGF_TimeToString.md`](lgf/LGF_TimeToString.md) |
| `LGF_UnixTimeToDTL` | FC | 3.0.1 | 将 32 位 Unix 时间戳整数秒还原转换为 UTC 标准 DTL 日期时间 | §4.9.24 | [`LGF_UnixTimeToDTL.md`](lgf/LGF_UnixTimeToDTL.md) |
| `LGF_SwapBlockDWord` | FC | 1.0.2 | 批量就地翻转 DWORD 双字数组元素的字节序（大端与小端互转） | §4.10.1 | [`LGF_SwapBlockDWord.md`](lgf/LGF_SwapBlockDWord.md) |
| `LGF_SwapBlockLWord` | FC | 1.0.2 | 批量就地翻转 LWORD 64位数组元素的字节序（大端与小端互转） | §4.10.2 | [`LGF_SwapBlockLWord.md`](lgf/LGF_SwapBlockLWord.md) |
| `LGF_SwapBlockWord` | FC | 1.0.2 | 批量就地翻转 WORD 字数组元素的字节序（大端与小端互转） | §4.10.3 | [`LGF_SwapBlockWord.md`](lgf/LGF_SwapBlockWord.md) |
| `LGF_MergeBitsToByte` | FC | 3.0.1 | 将 8 个独立的布尔变量（Bit0..Bit7）按位合并为一个 Byte 字节 | §4.11.1 | [`LGF_MergeBitsToByte.md`](lgf/LGF_MergeBitsToByte.md) |
| `LGF_MergeBitsToDWord` | FC | 3.0.1 | 将 32 个独立的布尔变量（Bit0..Bit31）按位合并为一个 DWord 双字 | §4.11.2 | [`LGF_MergeBitsToDWord.md`](lgf/LGF_MergeBitsToDWord.md) |
| `LGF_MergeBitsToWord` | FC | 3.0.1 | 将 16 个独立的布尔变量（Bit0..Bit15）按位合并为一个 Word 字 | §4.11.3 | [`LGF_MergeBitsToWord.md`](lgf/LGF_MergeBitsToWord.md) |
| `LGF_MergeBytesToDWord` | FC | 3.0.1 | 将 4 个独立的 Byte 字节变量按高低字节组合为一个 DWord 双字 | §4.11.4 | [`LGF_MergeBytesToDWord.md`](lgf/LGF_MergeBytesToDWord.md) |
| `LGF_MergeBytesToWord` | FC | 3.0.1 | 将 2 个独立的 Byte 字节变量按高低字节组合为一个 Word 字 | §4.11.5 | [`LGF_MergeBytesToWord.md`](lgf/LGF_MergeBytesToWord.md) |
| `LGF_MergeWordsToDWord` | FC | 3.0.1 | 将 2 个独立的 Word 字变量按高低字组合为一个 DWord 双字变量 | §4.11.6 | [`LGF_MergeWordsToDWord.md`](lgf/LGF_MergeWordsToDWord.md) |
| `LGF_SplitByteToBits` | FC | 3.0.1 | 将一个 Byte 字节变量按位分解拆分为 8 个独立的布尔变量 | §4.11.7 | [`LGF_SplitByteToBits.md`](lgf/LGF_SplitByteToBits.md) |
| `LGF_SplitDWordToBits` | FC | 3.0.1 | 将一个 DWord 双字变量按位分解拆分为 32 个独立的布尔变量 | §4.11.8 | [`LGF_SplitDWordToBits.md`](lgf/LGF_SplitDWordToBits.md) |
| `LGF_SplitDWordToBytes` | FC | 3.0.1 | 将一个 DWord 双字变量拆分分解为 4 个独立的 Byte 字节变量 | §4.11.9 | [`LGF_SplitDWordToBytes.md`](lgf/LGF_SplitDWordToBytes.md) |
| `LGF_SplitDWordToWords` | FC | 3.0.1 | 将一个 DWord 双字变量拆分分解为高字与低字两个 Word 字变量 | §4.11.10 | [`LGF_SplitDWordToWords.md`](lgf/LGF_SplitDWordToWords.md) |
| `LGF_SplitWordToBits` | FC | 3.0.1 | 将一个 Word 字变量按位分解拆分为 16 个独立的布尔变量 | §4.11.11 | [`LGF_SplitWordToBits.md`](lgf/LGF_SplitWordToBits.md) |
| `LGF_SplitWordToBytes` | FC | 3.0.1 | 将一个 Word 字变量拆分分解为高字节与低字节两个 Byte 变量 | §4.11.12 | [`LGF_SplitWordToBytes.md`](lgf/LGF_SplitWordToBytes.md) |
| `LGF_ExtractStringFromCharArray` | FC | 1.1.0 | 根据前后定界标记文本从字符数组中截取匹配的子字符串 | §4.12.1 | [`LGF_ExtractStringFromCharArray.md`](lgf/LGF_ExtractStringFromCharArray.md) |
| `LGF_ExtractStringFromCharArrayAdv` | FC | 1.1.0 | 带起始偏移与长度约束等高级选项从字符数组中截取子字符串 | §4.12.2 | [`LGF_ExtractStringFromCharArrayAdv.md`](lgf/LGF_ExtractStringFromCharArrayAdv.md) |
| `LGF_FindStringInCharArray` | FC | 1.1.0 | 在字符数组中检索目标子字符串并返回其首字符起始下标索引 | §4.12.3 | [`LGF_FindStringInCharArray.md`](lgf/LGF_FindStringInCharArray.md) |
| `LGF_ToLower` | FC | 1.0.0 | 将输入字符串中的所有英文字母统一转换为对应的小写形式 | §4.12.4 | [`LGF_ToLower.md`](lgf/LGF_ToLower.md) |
| `LGF_ToUpper` | FC | 1.0.0 | 将输入字符串中的所有英文字母统一转换为对应的大写形式 | §4.12.5 | [`LGF_ToUpper.md`](lgf/LGF_ToUpper.md) |
| `LGF_CelsiusToFahrenheit` | FC | 3.0.1 | 摄氏温度（°C）转换为华氏温度（°F）：F = C * 1.8 + 32 | §4.13.1 | [`LGF_CelsiusToFahrenheit.md`](lgf/LGF_CelsiusToFahrenheit.md) |
| `LGF_CelsiusToKelvin` | FC | 3.0.1 | 摄氏温度（°C）转换为热力学开尔文温标（K）：K = C + 273.15 | §4.13.2 | [`LGF_CelsiusToKelvin.md`](lgf/LGF_CelsiusToKelvin.md) |
| `LGF_ConvertTemperature` | FC | 3.0.1 | 通用温度单位转换器（支持 °C、°F、K、°R 之间按模式自由切换） | §4.13.3 | [`LGF_ConvertTemperature.md`](lgf/LGF_ConvertTemperature.md) |
| `LGF_FahrenheitToCelsius` | FC | 3.0.1 | 华氏温度（°F）转换为摄氏温度（°C）：C = (F - 32) / 1.8 | §4.13.4 | [`LGF_FahrenheitToCelsius.md`](lgf/LGF_FahrenheitToCelsius.md) |
| `LGF_FahrenheitToKelvin` | FC | 3.0.1 | 华氏温度（°F）转换为热力学绝对温标开尔文（K） | §4.13.5 | [`LGF_FahrenheitToKelvin.md`](lgf/LGF_FahrenheitToKelvin.md) |
| `LGF_KelvinToCelsius` | FC | 3.0.1 | 热力学绝对温标开尔文（K）转换为摄氏温度（°C） | §4.13.6 | [`LGF_KelvinToCelsius.md`](lgf/LGF_KelvinToCelsius.md) |
| `LGF_KelvinToFahrenheit` | FC | 3.0.1 | 热力学绝对温标开尔文（K）转换为华氏温度（°F） | §4.13.7 | [`LGF_KelvinToFahrenheit.md`](lgf/LGF_KelvinToFahrenheit.md) |
| `LGF_KelvinToRankine` | FC | 3.0.1 | 热力学绝对温标开尔文（K）转换为兰氏温度（°R）：R = K * 1.8 | §4.13.8 | [`LGF_KelvinToRankine.md`](lgf/LGF_KelvinToRankine.md) |
| `LGF_RankineToKelvin` | FC | 3.0.1 | 兰氏温度（°R）转换为热力学绝对温标开尔文（K）：K = R / 1.8 | §4.13.9 | [`LGF_RankineToKelvin.md`](lgf/LGF_RankineToKelvin.md) |
| `LGF_ClockGen` | FB | 1.0.1 | 软件模拟生成 CPU 系统时钟存储器字节（0.5~10Hz 多频段方波及边沿） | §4.14.1 | [`LGF_ClockGen.md`](lgf/LGF_ClockGen.md) |
| `LGF_CosinusCI` | FB | 3.0.2 | 循环中断中按中断周期生成连续平滑的余弦波（Cosine）信号 | §4.14.2 | [`LGF_CosinusCI.md`](lgf/LGF_CosinusCI.md) |
| `LGF_Frequency` | FB | 3.0.2 | 依据设定频率与脉宽占空比生成连续周期性方波脉冲信号 | §4.14.3 | [`LGF_Frequency.md`](lgf/LGF_Frequency.md) |
| `LGF_Impulse` | FB | 3.0.1 | 按设定触发频率输出单 PLC 扫描周期宽度的单次时钟脉冲信号 | §4.14.4 | [`LGF_Impulse.md`](lgf/LGF_Impulse.md) |
| `LGF_RampGenerator` | FB | 1.0.0 | 线性斜坡信号发生器（带目标值逼近、保持与容差带到位判定） | §4.14.5 | [`LGF_RampGenerator.md`](lgf/LGF_RampGenerator.md) |
| `LGF_RectangleCI` | FB | 3.0.1 | 循环中断中按中断周期生成幅值与占空比可调的矩形方波信号 | §4.14.6 | [`LGF_RectangleCI.md`](lgf/LGF_RectangleCI.md) |
| `LGF_SawToothCI` | FB | 3.0.1 | 循环中断中按中断周期生成线性周期上升/复位的锯齿波信号 | §4.14.7 | [`LGF_SawToothCI.md`](lgf/LGF_SawToothCI.md) |
| `LGF_SinusCI` | FB | 3.0.2 | 循环中断中按中断周期生成连续平滑的正弦波（Sine）信号 | §4.14.8 | [`LGF_SinusCI.md`](lgf/LGF_SinusCI.md) |
| `LGF_TriangleCI` | FB | 3.0.1 | 循环中断中按中断周期生成对称线性上升与下降的三角波信号 | §4.14.9 | [`LGF_TriangleCI.md`](lgf/LGF_TriangleCI.md) |
| `LGF_LimRateOfChangeAdvancedCI` | FB | 3.0.1 | 高级变化率限制器（支持多工况模式、加速度上下限与阶跃平滑） | §4.15.1 | [`LGF_LimRateOfChangeAdvancedCI.md`](lgf/LGF_LimRateOfChangeAdvancedCI.md) |
| `LGF_LimRateOfChangeCI` | FB | 3.0.1 | 循环中断中限制变量变化速率，将阶跃输入平滑过渡为斜坡输出 | §4.15.2 | [`LGF_LimRateOfChangeCI.md`](lgf/LGF_LimRateOfChangeCI.md) |
| `LGF_NonLinearInterpolation` | FB | 3.0.1 | 基于离散折线点表实现多段非线性曲线查表与线性插值计算 | §4.15.3 | [`LGF_NonLinearInterpolation.md`](lgf/LGF_NonLinearInterpolation.md) |
| `LGF_RampCI` | FB | 3.0.1 | 循环中断中按设定速度曲线与插值点表生成多段平滑过渡斜坡 | §4.15.4 | [`LGF_RampCI.md`](lgf/LGF_RampCI.md) |
| `LGF_AverageAndDeviation` | FC | 3.0.1 | 一次性计算数值数组中全部采样数据的算术平均值与样本标准差 | §4.16.1 | [`LGF_AverageAndDeviation.md`](lgf/LGF_AverageAndDeviation.md) |
| `LGF_DifferenceQuotientFC` | FC | 3.0.1 | 基于拟合多项式对等距采样数组进行非周期差商求导（速度/加速度） | §4.16.2 | [`LGF_DifferenceQuotientFC.md`](lgf/LGF_DifferenceQuotientFC.md) |
| `LGF_RegressionLine` | FC | 3.0.1 | 采用最小二乘法对散点数据进行一元线性回归拟合（斜率与截距） | §4.16.3 | [`LGF_RegressionLine.md`](lgf/LGF_RegressionLine.md) |
| `LGF_SimpleSmoothingFC` | FC | 3.0.1 | 非周期调用三点滑动均值算法对给定数组离散采样数据整体平滑 | §4.16.4 | [`LGF_SimpleSmoothingFC.md`](lgf/LGF_SimpleSmoothingFC.md) |
| `LGF_SmoothByPolynomFC` | FC | 3.0.1 | 采用五点三次多项式最小二乘拟合算法对数组采样数据降噪滤波 | §4.16.5 | [`LGF_SmoothByPolynomFC.md`](lgf/LGF_SmoothByPolynomFC.md) |
| `LGF_Boxplot_DInt` | FB | 3.0.3 | 统计分析 DInt 数据样本箱线图特征值（极值、四分位数与中位数） | §4.16.6 | [`LGF_Boxplot_DInt.md`](lgf/LGF_Boxplot_DInt.md) |
| `LGF_Boxplot_LReal` | FB | 3.0.3 | 统计分析 LReal 浮点样本箱线图特征值（极值、四分位数与中位数） | §4.16.7 | [`LGF_Boxplot_LReal.md`](lgf/LGF_Boxplot_LReal.md) |
| `LGF_Boxplot_UDInt` | FB | 3.0.3 | 统计分析 UDInt 样本箱线图特征值（极值、四分位数与中位数） | §4.16.8 | [`LGF_Boxplot_UDInt.md`](lgf/LGF_Boxplot_UDInt.md) |
| `LGF_DifferenceQuotientFB` | FB | 3.0.1 | 周期触发采样并基于补偿多项式在线实时计算一阶数值导数（差商） | §4.16.9 | [`LGF_DifferenceQuotientFB.md`](lgf/LGF_DifferenceQuotientFB.md) |
| `LGF_FloatingAverage` | FB | 3.0.2 | 工业模拟量动态滑动平均滤波块（支持循环/触发采集与滑动窗口） | §4.16.10 | [`LGF_FloatingAverage.md`](lgf/LGF_FloatingAverage.md) |
| `LGF_Histogram_DInt` | FB | 3.0.3 | 统计分析 DInt 样本数据的频数直方图分布（自动解算组宽与频次） | §4.16.11 | [`LGF_Histogram_DInt.md`](lgf/LGF_Histogram_DInt.md) |
| `LGF_Histogram_LReal` | FB | 3.0.3 | 统计分析 LReal 样本数据的频数直方图分布（自动解算组宽与频次） | §4.16.12 | [`LGF_Histogram_LReal.md`](lgf/LGF_Histogram_LReal.md) |
| `LGF_Histogram_UDInt` | FB | 3.0.3 | 统计分析 UDInt 样本数据的频数直方图分布（自动解算组宽与频次） | §4.16.13 | [`LGF_Histogram_UDInt.md`](lgf/LGF_Histogram_UDInt.md) |
| `LGF_SimpleSmoothingFB` | FB | 3.0.1 | 周期触发三点线性移动平均平滑滤波块（滤除瞬态高频尖峰脉冲） | §4.16.14 | [`LGF_SimpleSmoothingFB.md`](lgf/LGF_SimpleSmoothingFB.md) |
| `LGF_SmoothByPolynomFB` | FB | 3.0.1 | 周期触发五点三次多项式在线动态平滑滤波（实时拟合滤波降噪） | §4.16.15 | [`LGF_SmoothByPolynomFB.md`](lgf/LGF_SmoothByPolynomFB.md) |
| `LGF_IsBigEndian` | FC | 1.0.0 | §4.17.1 | §4.17.1 | [`LGF_IsBigEndian.md`](lgf/LGF_IsBigEndian.md) |
| `LGF_IsLittleEndian` | FC | 1.0.0 | §4.17.2 | §4.17.2 | [`LGF_IsLittleEndian.md`](lgf/LGF_IsLittleEndian.md) |
| `LGF_ActDeactDevice` | FB | 2.0.0 | §4.17.3 | §4.17.3 | [`LGF_ActDeactDevice.md`](lgf/LGF_ActDeactDevice.md) |
| `LGF_ActDeactMonitorDevice` | FB | 2.0.0 | §4.17.4 | §4.17.4 | [`LGF_ActDeactMonitorDevice.md`](lgf/LGF_ActDeactMonitorDevice.md) |
| `LGF_MeasureCpuLoad` | FB | 1.1.1 | §4.17.5 | §4.17.5 | [`LGF_MeasureCpuLoad.md`](lgf/LGF_MeasureCpuLoad.md) |
| `LGF_ReadPnInterfaceParameter` | FB | 1.0.0 | §4.17.6 | §4.17.6 | [`LGF_ReadPnInterfaceParameter.md`](lgf/LGF_ReadPnInterfaceParameter.md) |
| `LGF_CountFalInDWord` | FC | 3.0.1 | （兼容旧版FC）从高到低位统计 DWORD 变量中 1 到 0 下降沿序列次数 | §4.18.1 | [`LGF_CountFalInDWord_FC.md`](lgf/LGF_CountFalInDWord_FC.md) |
| `LGF_CountRisInDWord` | FC | 3.0.1 | （兼容旧版FC）从高到低位统计 DWORD 变量中 0 到 1 上升沿序列次数 | §4.18.2 | [`LGF_CountRisInDWord_FC.md`](lgf/LGF_CountRisInDWord_FC.md) |
| `LGF_SawTooth` | FB | 3.0.1 | §4.19.1 | §4.19.1 | [`LGF_SawTooth.md`](lgf/LGF_SawTooth.md) |
| `LGF_typeCalcSolarVector_SPA` | UDT | 1.0.0 | SPA 太阳位置算法配置输入与天文计算结果数据类型结构体 | §5.2.1 | [`LGF_typeCalcSolarVector_SPA.md`](lgf/LGF_typeCalcSolarVector_SPA.md) |
| `LGF_typeGPS` | UDT | 3.0.1 | 复合 GPS 全局地理坐标数据类型（包含度分秒经纬度及半球标示） | §5.2.2 | [`LGF_typeGPS.md`](lgf/LGF_typeGPS.md) |
| `LGF_typeGPS_DD` | UDT | 3.0.1 | 十进制小数格式（GPS-DD）经纬度地理坐标数据类型 | §5.2.3 | [`LGF_typeGPS_DD.md`](lgf/LGF_typeGPS_DD.md) |
| `LGF_typeGPS_DMS` | UDT | 3.0.1 | 传统度分秒格式（GPS-DMS）单轴地理坐标数据类型 | §5.2.4 | [`LGF_typeGPS_DMS.md`](lgf/LGF_typeGPS_DMS.md) |
| `LGF_typeIsValueInToleranceByTimeConfiguration` | UDT | 1.0.0 | 容差时间过滤模块运行参数配置结构体（包含屏蔽延时与过滤时间） | §5.3.1 | [`LGF_typeIsValueInToleranceByTimeConfiguration.md`](lgf/LGF_typeIsValueInToleranceByTimeConfiguration.md) |
| `LGF_typeDataLogParameter` | UDT | 1.0.0 | 紧凑型数据记录器（LGF_DataLogC）运行行为与存储配置参数结构体 | §5.4.1 | [`LGF_typeDataLogParameter.md`](lgf/LGF_typeDataLogParameter.md) |
| `LGF_typeFileReadWriteDeleteParameter` | UDT | 0.0.1 | 存储卡文件操作块（LGF_FileReadWriteDelete）行为配置参数结构体 | §5.4.2 | [`LGF_typeFileReadWriteDeleteParameter.md`](lgf/LGF_typeFileReadWriteDeleteParameter.md) |
| `LGF_typeFileReadWriteDeleteTimestamp` | UDT | 0.0.1 | 存储卡文件或执行指令操作的 DTL 单条历史时间戳记录结构体 | §5.4.3 | [`LGF_typeFileReadWriteDeleteTimestamp.md`](lgf/LGF_typeFileReadWriteDeleteTimestamp.md) |
| `LGF_typeFileReadWriteDeleteTimestamps` | UDT | 0.0.1 | 存储卡文件读写删除模块全部操作指令与文件创建时间戳汇总结构体 | §5.4.4 | [`LGF_typeFileReadWriteDeleteTimestamps.md`](lgf/LGF_typeFileReadWriteDeleteTimestamps.md) |
| `LGF_typeNonLinSetpoints` | UDT | 3.0.1 | 非线性折线插值函数块（LGF_NonLinearInterpolation）设定点表结构体 | §5.5.1 | [`LGF_typeNonLinSetpoints.md`](lgf/LGF_typeNonLinSetpoints.md) |
| `LGF_typeRampTimeTable` | UDT | 3.0.1 | 斜坡速度曲线函数块（LGF_RampCI）分段给定设定点与时间表结构体 | §5.5.2 | [`LGF_typeRampTimeTable.md`](lgf/LGF_typeRampTimeTable.md) |
| `LGF_typeRegressionLine` | UDT | 3.0.1 | 线性回归分析（LGF_RegressionLine）散点键值对与拟合参数结构体 | §5.6.1 | [`LGF_typeRegressionLine.md`](lgf/LGF_typeRegressionLine.md) |
| `LGF_typeActDeactDeviceParameter` | UDT | 2.0.0 | 分布式设备启停功能块（LGF_ActDeactDevice）行为配置参数结构体 | §5.7.1 | [`LGF_typeActDeactDeviceParameter.md`](lgf/LGF_typeActDeactDeviceParameter.md) |
| `LGF_typeActDeactMonitorDeviceParameter` | UDT | 2.0.0 | 分布式设备监控功能块（LGF_ActDeactMonitorDevice）配置参数结构体 | §5.7.2 | [`LGF_typeActDeactMonitorDeviceParameter.md`](lgf/LGF_typeActDeactMonitorDeviceParameter.md) |
| `LGF_typeMeasureCpuLoad_Configuration` | UDT | 1.0.0 | CPU 负荷测量功能块（LGF_MeasureCpuLoad）周期与全局配置结构体 | §5.7.3 | [`LGF_typeMeasureCpuLoad_Configuration.md`](lgf/LGF_typeMeasureCpuLoad_Configuration.md) |
| `LGF_typeMeasureCpuLoad_ConfigurationBlock` | UDT | 1.0.0 | CPU 负荷测量中针对待测特定程序块（OB/FC/FB）的配置参数结构体 | §5.7.4 | [`LGF_typeMeasureCpuLoad_ConfigurationBlock.md`](lgf/LGF_typeMeasureCpuLoad_ConfigurationBlock.md) |
| `LGF_typeMeasureCpuLoad_ResultBlock` | UDT | 1.0.0 | CPU 负荷测量中各被测程序块测量统计结果数据结构体 | §5.7.5 | [`LGF_typeMeasureCpuLoad_ResultBlock.md`](lgf/LGF_typeMeasureCpuLoad_ResultBlock.md) |
| `LGF_typeSystemClockGen` | UDT | 1.0.0 | 系统时钟发生器（LGF_ClockGen）多频段时钟状态与边沿输出结构体 | §5.7.6 | [`LGF_typeSystemClockGen.md`](lgf/LGF_typeSystemClockGen.md) |
