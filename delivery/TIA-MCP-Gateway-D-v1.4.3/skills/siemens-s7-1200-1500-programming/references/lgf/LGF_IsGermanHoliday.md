# LGF_IsGermanHoliday (FC / V3.0.1)

- **分类**：Date and timer operations (§4.2.4)
- **中文功能**：判定指定日期是否为德国法定节假日（支持特定联邦州过滤）
- **英文简述**：The function determines whether a given date is a public holiday. All public holidays in Germany are taken into account. Holidays that are NOT uniform nationwide can be switched on or off

## 输入参数 (Inputs)
| 参数名 | 数据类型 | 默认值 | 描述 |
| :--- | :--- | :--- | :--- |
| `date` | `DTL` | `-` | Date, which has to be evaluated |
| `threeKings` | `Bool` | `-` | Three Kings |
| `roseMonday` | `Bool` | `-` | Rose Monday |
| `ascension` | `Bool` | `-` | Ascension |
| `corpusChristi` | `Bool` | `-` | Corpus Christi |
| `augsburger Friedensfest` | `Bool` | `-` | Augsburger Friedensfest |
| `assumptionOfMary` | `Bool` | `-` | Assumption Of Mary |
| `reformationDay` | `Bool` | `-` | Reformation Day |
| `allSaintDay` | `Bool` | `-` | All Saint Day |
| `bussUndBettag` | `Bool` | `-` | Day of Prayer and Repentance (Buss und Bettag) |

## 输出参数 (Outputs)
| 参数名 | 数据类型 | 描述 |
| :--- | :--- | :--- |
| `Ret_Val` | `Bool` | If the date at the input parameter is a public holiday - returning TRUE, otherwise returning FALSE |

## 功能说明与使用要点
- The block calculates the public holiday calendar of the year for a given date and displays whether the given date is a public holiday.
- Optionally, holidays that are not uniform nationwide, such as Epiphany (Three Kings), can be taken into account via the appropriate input parameters in the block.
