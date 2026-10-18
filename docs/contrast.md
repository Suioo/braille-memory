# 对比度实测（WCAG 2.x 相对亮度公式）

由 `node tools/contrast.js` 生成；配色来自 `src/core/palette.js`。要求：正文 ≥ 4.5:1，控件 / 图形 ≥ 3:1。

说明：M3 的 `outline-variant` 只用于装饰性分隔线（列表分隔、统计分隔），不承担控件边界；
空点细圈、芯片与分段按钮边框、禁用文字一律使用 `outline`（≥ 3:1）。

## teal（#2F6F8F）· 浅色

surface `#F4FAFF` · on-surface `#161C20` · primary `#00668A`

| 前景 | 背景 | 用途 | 对比度 | 要求 | 结果 |
|---|---|---|---|---|---|
| on-surface `#161C20` | surface `#F4FAFF` | 正文 | 16.35:1 | 4.5:1 | 达到 |
| on-surface `#161C20` | surface-container-high `#E1E9EF` | 卡片正文 | 14.01:1 | 4.5:1 | 达到 |
| on-surface `#161C20` | surface-container-highest `#DCE4E9` | 卡片正文 | 13.36:1 | 4.5:1 | 达到 |
| on-surface-variant `#3B4952` | surface `#F4FAFF` | 次要文字 | 8.83:1 | 4.5:1 | 达到 |
| on-surface-variant `#3B4952` | surface-container `#E7EFF5` | 导航标签 | 7.99:1 | 4.5:1 | 达到 |
| on-surface-variant `#3B4952` | surface-container-high `#E1E9EF` | 卡片次要文字 | 7.57:1 | 4.5:1 | 达到 |
| primary `#00668A` | surface `#F4FAFF` | 文字按钮 / 强调文字 | 6.11:1 | 4.5:1 | 达到 |
| primary `#00668A` | surface-container-high `#E1E9EF` | 凸起点（填充） | 5.23:1 | 3:1 | 达到 |
| on-primary `#FFFFFF` | primary `#00668A` | 填充按钮文字 / 点内编号 | 6.43:1 | 4.5:1 | 达到 |
| on-primary-container `#001E2C` | primary-container `#C4E7FF` | 选中标签 | 13.27:1 | 4.5:1 | 达到 |
| on-secondary-container `#001E2C` | secondary-container `#C5E7FE` | 色调按钮 / 选中芯片 | 13.29:1 | 4.5:1 | 达到 |
| on-tertiary-container `#21143A` | tertiary-container `#EBDCFF` | 第三色容器 | 13.23:1 | 4.5:1 | 达到 |
| tertiary `#685683` | surface-container-high `#E1E9EF` | 漏点虚线圈 | 5.27:1 | 3:1 | 达到 |
| error `#B4271F` | surface-container-high `#E1E9EF` | 多点外圈 | 5.26:1 | 3:1 | 达到 |
| on-error-container `#380C00` | error-container `#FFDAD3` | 多点内编号 / 错误容器 | 13.29:1 | 4.5:1 | 达到 |
| on-error `#FFFFFF` | error `#B4271F` | 错误按钮文字 | 6.46:1 | 4.5:1 | 达到 |
| error `#B4271F` | primary `#00668A` | 多点外圈与命中点（仅记录） | 1.01:1 | 1:1 | 达到 |
| outline `#6A7983` | surface `#F4FAFF` | 控件边框 / 禁用文字 | 4.27:1 | 3:1 | 达到 |
| outline `#6A7983` | surface-container-high `#E1E9EF` | 空点细圈 | 3.66:1 | 3:1 | 达到 |
| on-surface-variant `#3B4952` | secondary-container `#C5E7FE` | 导航选中指示 | 7.18:1 | 4.5:1 | 达到 |
| outline-variant `#B9C9D4` | surface-container-high `#E1E9EF` | 仅装饰分隔线（参考） | 1.38:1 | — | 不用于控件 |

## teal（#2F6F8F）· 深色

surface `#0D1418` · on-surface `#DCE4E9` · primary `#7DD0FF`

| 前景 | 背景 | 用途 | 对比度 | 要求 | 结果 |
|---|---|---|---|---|---|
| on-surface `#DCE4E9` | surface `#0D1418` | 正文 | 14.44:1 | 4.5:1 | 达到 |
| on-surface `#DCE4E9` | surface-container-high `#252B2F` | 卡片正文 | 11.14:1 | 4.5:1 | 达到 |
| on-surface `#DCE4E9` | surface-container-highest `#2F363A` | 卡片正文 | 9.54:1 | 4.5:1 | 达到 |
| on-surface-variant `#B9C9D4` | surface `#0D1418` | 次要文字 | 10.94:1 | 4.5:1 | 达到 |
| on-surface-variant `#B9C9D4` | surface-container `#1A2024` | 导航标签 | 9.69:1 | 4.5:1 | 达到 |
| on-surface-variant `#B9C9D4` | surface-container-high `#252B2F` | 卡片次要文字 | 8.44:1 | 4.5:1 | 达到 |
| primary `#7DD0FF` | surface `#0D1418` | 文字按钮 / 强调文字 | 10.92:1 | 4.5:1 | 达到 |
| primary `#7DD0FF` | surface-container-high `#252B2F` | 凸起点（填充） | 8.42:1 | 3:1 | 达到 |
| on-primary `#003549` | primary `#7DD0FF` | 填充按钮文字 / 点内编号 | 7.69:1 | 4.5:1 | 达到 |
| on-primary-container `#C4E7FF` | primary-container `#004C69` | 选中标签 | 7.25:1 | 4.5:1 | 达到 |
| on-secondary-container `#C5E7FE` | secondary-container `#294B5D` | 色调按钮 / 选中芯片 | 7.19:1 | 4.5:1 | 达到 |
| on-tertiary-container `#EBDCFF` | tertiary-container `#4F3F69` | 第三色容器 | 7.21:1 | 4.5:1 | 达到 |
| tertiary `#D3BDF0` | surface-container-high `#252B2F` | 漏点虚线圈 | 8.40:1 | 3:1 | 达到 |
| error `#FFB4A5` | surface-container-high `#252B2F` | 多点外圈 | 8.41:1 | 3:1 | 达到 |
| on-error-container `#FFDAD3` | error-container `#93000B` | 多点内编号 / 错误容器 | 7.22:1 | 4.5:1 | 达到 |
| on-error `#690000` | error `#FFB4A5` | 错误按钮文字 | 7.70:1 | 4.5:1 | 达到 |
| error `#FFB4A5` | primary `#7DD0FF` | 多点外圈与命中点（仅记录） | 1.00:1 | 1:1 | 达到 |
| outline `#84939D` | surface `#0D1418` | 控件边框 / 禁用文字 | 5.88:1 | 3:1 | 达到 |
| outline `#84939D` | surface-container-high `#252B2F` | 空点细圈 | 4.53:1 | 3:1 | 达到 |
| on-surface-variant `#B9C9D4` | secondary-container `#294B5D` | 导航选中指示 | 5.48:1 | 4.5:1 | 达到 |
| outline-variant `#3B4952` | surface-container-high `#252B2F` | 仅装饰分隔线（参考） | 1.54:1 | — | 不用于控件 |

## indigo（#4F5BB5）· 浅色

surface `#F9F9FF` · on-surface `#1B1B20` · primary `#4F57A6`

| 前景 | 背景 | 用途 | 对比度 | 要求 | 结果 |
|---|---|---|---|---|---|
| on-surface `#1B1B20` | surface `#F9F9FF` | 正文 | 16.35:1 | 4.5:1 | 达到 |
| on-surface `#1B1B20` | surface-container-high `#E8E7EF` | 卡片正文 | 13.97:1 | 4.5:1 | 达到 |
| on-surface `#1B1B20` | surface-container-highest `#E2E2E9` | 卡片正文 | 13.31:1 | 4.5:1 | 达到 |
| on-surface-variant `#464552` | surface `#F9F9FF` | 次要文字 | 8.96:1 | 4.5:1 | 达到 |
| on-surface-variant `#464552` | surface-container `#EEEDF5` | 导航标签 | 8.09:1 | 4.5:1 | 达到 |
| on-surface-variant `#464552` | surface-container-high `#E8E7EF` | 卡片次要文字 | 7.66:1 | 4.5:1 | 达到 |
| primary `#4F57A6` | surface `#F9F9FF` | 文字按钮 / 强调文字 | 6.17:1 | 4.5:1 | 达到 |
| primary `#4F57A6` | surface-container-high `#E8E7EF` | 凸起点（填充） | 5.27:1 | 3:1 | 达到 |
| on-primary `#FFFFFF` | primary `#4F57A6` | 填充按钮文字 / 点内编号 | 6.47:1 | 4.5:1 | 达到 |
| on-primary-container `#00174B` | primary-container `#E2DFFF` | 选中标签 | 13.26:1 | 4.5:1 | 达到 |
| on-secondary-container `#19192F` | secondary-container `#E2DFFE` | 色调按钮 / 选中芯片 | 13.28:1 | 4.5:1 | 达到 |
| on-tertiary-container `#3A0520` | tertiary-container `#FFD8E6` | 第三色容器 | 13.27:1 | 4.5:1 | 达到 |
| tertiary `#874C64` | surface-container-high `#E8E7EF` | 漏点虚线圈 | 5.27:1 | 3:1 | 达到 |
| error `#B4271F` | surface-container-high `#E8E7EF` | 多点外圈 | 5.26:1 | 3:1 | 达到 |
| on-error-container `#380C00` | error-container `#FFDAD3` | 多点内编号 / 错误容器 | 13.29:1 | 4.5:1 | 达到 |
| on-error `#FFFFFF` | error `#B4271F` | 错误按钮文字 | 6.46:1 | 4.5:1 | 达到 |
| error `#B4271F` | primary `#4F57A6` | 多点外圈与命中点（仅记录） | 1.00:1 | 1:1 | 达到 |
| outline `#777683` | surface `#F9F9FF` | 控件边框 / 禁用文字 | 4.26:1 | 3:1 | 达到 |
| outline `#777683` | surface-container-high `#E8E7EF` | 空点细圈 | 3.64:1 | 3:1 | 达到 |
| on-surface-variant `#464552` | secondary-container `#E2DFFE` | 导航选中指示 | 7.26:1 | 4.5:1 | 达到 |
| outline-variant `#C6C5D4` | surface-container-high `#E8E7EF` | 仅装饰分隔线（参考） | 1.39:1 | — | 不用于控件 |

## indigo（#4F5BB5）· 深色

surface `#131318` · on-surface `#E2E2E9` · primary `#C2C1FF`

| 前景 | 背景 | 用途 | 对比度 | 要求 | 结果 |
|---|---|---|---|---|---|
| on-surface `#E2E2E9` | surface `#131318` | 正文 | 14.36:1 | 4.5:1 | 达到 |
| on-surface `#E2E2E9` | surface-container-high `#2A292F` | 卡片正文 | 11.18:1 | 4.5:1 | 达到 |
| on-surface `#E2E2E9` | surface-container-highest `#35343A` | 卡片正文 | 9.56:1 | 4.5:1 | 达到 |
| on-surface-variant `#C6C5D4` | surface `#131318` | 次要文字 | 10.88:1 | 4.5:1 | 达到 |
| on-surface-variant `#C6C5D4` | surface-container `#1F1F24` | 导航标签 | 9.64:1 | 4.5:1 | 达到 |
| on-surface-variant `#C6C5D4` | surface-container-high `#2A292F` | 卡片次要文字 | 8.47:1 | 4.5:1 | 达到 |
| primary `#C2C1FF` | surface `#131318` | 文字按钮 / 强调文字 | 10.90:1 | 4.5:1 | 达到 |
| primary `#C2C1FF` | surface-container-high `#2A292F` | 凸起点（填充） | 8.49:1 | 3:1 | 达到 |
| on-primary `#102A72` | primary `#C2C1FF` | 填充按钮文字 / 点内编号 | 7.75:1 | 4.5:1 | 达到 |
| on-primary-container `#E2DFFF` | primary-container `#33408B` | 选中标签 | 7.22:1 | 4.5:1 | 达到 |
| on-secondary-container `#E2DFFE` | secondary-container `#45445D` | 色调按钮 / 选中芯片 | 7.25:1 | 4.5:1 | 达到 |
| on-tertiary-container `#FFD8E6` | tertiary-container `#6C344C` | 第三色容器 | 7.26:1 | 4.5:1 | 达到 |
| tertiary `#F7B4CD` | surface-container-high `#2A292F` | 漏点虚线圈 | 8.49:1 | 3:1 | 达到 |
| error `#FFB4A5` | surface-container-high `#2A292F` | 多点外圈 | 8.46:1 | 3:1 | 达到 |
| on-error-container `#FFDAD3` | error-container `#93000B` | 多点内编号 / 错误容器 | 7.22:1 | 4.5:1 | 达到 |
| on-error `#690000` | error `#FFB4A5` | 错误按钮文字 | 7.70:1 | 4.5:1 | 达到 |
| error `#FFB4A5` | primary `#C2C1FF` | 多点外圈与命中点（仅记录） | 1.00:1 | 1:1 | 达到 |
| outline `#908F9D` | surface `#131318` | 控件边框 / 禁用文字 | 5.82:1 | 3:1 | 达到 |
| outline `#908F9D` | surface-container-high `#2A292F` | 空点细圈 | 4.53:1 | 3:1 | 达到 |
| on-surface-variant `#C6C5D4` | secondary-container `#45445D` | 导航选中指示 | 5.51:1 | 4.5:1 | 达到 |
| outline-variant `#464552` | surface-container-high `#2A292F` | 仅装饰分隔线（参考） | 1.53:1 | — | 不用于控件 |

## green（#3F7D4E）· 浅色

surface `#F4FBF5` · on-surface `#181D19` · primary `#2C6A3D`

| 前景 | 背景 | 用途 | 对比度 | 要求 | 结果 |
|---|---|---|---|---|---|
| on-surface `#181D19` | surface `#F4FBF5` | 正文 | 16.25:1 | 4.5:1 | 达到 |
| on-surface `#181D19` | surface-container-high `#E3EAE4` | 卡片正文 | 13.96:1 | 4.5:1 | 达到 |
| on-surface `#181D19` | surface-container-highest `#DDE4DE` | 卡片正文 | 13.21:1 | 4.5:1 | 达到 |
| on-surface-variant `#3E4A40` | surface `#F4FBF5` | 次要文字 | 8.84:1 | 4.5:1 | 达到 |
| on-surface-variant `#3E4A40` | surface-container `#E9F0EA` | 导航标签 | 8.02:1 | 4.5:1 | 达到 |
| on-surface-variant `#3E4A40` | surface-container-high `#E3EAE4` | 卡片次要文字 | 7.60:1 | 4.5:1 | 达到 |
| primary `#2C6A3D` | surface `#F4FBF5` | 文字按钮 / 强调文字 | 6.17:1 | 4.5:1 | 达到 |
| primary `#2C6A3D` | surface-container-high `#E3EAE4` | 凸起点（填充） | 5.30:1 | 3:1 | 达到 |
| on-primary `#FFFFFF` | primary `#2C6A3D` | 填充按钮文字 / 点内编号 | 6.49:1 | 4.5:1 | 达到 |
| on-primary-container `#002107` | primary-container `#B0F2BC` | 选中标签 | 13.33:1 | 4.5:1 | 达到 |
| on-secondary-container `#0A200E` | secondary-container `#CEEAD2` | 色调按钮 / 选中芯片 | 13.32:1 | 4.5:1 | 达到 |
| on-tertiary-container `#002023` | tertiary-container `#96F1FA` | 第三色容器 | 13.21:1 | 4.5:1 | 达到 |
| tertiary `#006971` | surface-container-high `#E3EAE4` | 漏点虚线圈 | 5.26:1 | 3:1 | 达到 |
| error `#B4271F` | surface-container-high `#E3EAE4` | 多点外圈 | 5.28:1 | 3:1 | 达到 |
| on-error-container `#380C00` | error-container `#FFDAD3` | 多点内编号 / 错误容器 | 13.29:1 | 4.5:1 | 达到 |
| on-error `#FFFFFF` | error `#B4271F` | 错误按钮文字 | 6.46:1 | 4.5:1 | 达到 |
| error `#B4271F` | primary `#2C6A3D` | 多点外圈与命中点（仅记录） | 1.00:1 | 1:1 | 达到 |
| outline `#6E7A70` | surface `#F4FBF5` | 控件边框 / 禁用文字 | 4.27:1 | 3:1 | 达到 |
| outline `#6E7A70` | surface-container-high `#E3EAE4` | 空点细圈 | 3.67:1 | 3:1 | 达到 |
| on-surface-variant `#3E4A40` | secondary-container `#CEEAD2` | 导航选中指示 | 7.23:1 | 4.5:1 | 达到 |
| outline-variant `#BCCABE` | surface-container-high `#E3EAE4` | 仅装饰分隔线（参考） | 1.39:1 | — | 不用于控件 |

## green（#3F7D4E）· 深色

surface `#0F1510` · on-surface `#DDE4DE` · primary `#95D5A1`

| 前景 | 背景 | 用途 | 对比度 | 要求 | 结果 |
|---|---|---|---|---|---|
| on-surface `#DDE4DE` | surface `#0F1510` | 正文 | 14.30:1 | 4.5:1 | 达到 |
| on-surface `#DDE4DE` | surface-container-high `#262B27` | 卡片正文 | 11.13:1 | 4.5:1 | 达到 |
| on-surface `#DDE4DE` | surface-container-highest `#313631` | 卡片正文 | 9.53:1 | 4.5:1 | 达到 |
| on-surface-variant `#BCCABE` | surface `#0F1510` | 次要文字 | 10.86:1 | 4.5:1 | 达到 |
| on-surface-variant `#BCCABE` | surface-container `#1C211D` | 导航标签 | 9.60:1 | 4.5:1 | 达到 |
| on-surface-variant `#BCCABE` | surface-container-high `#262B27` | 卡片次要文字 | 8.46:1 | 4.5:1 | 达到 |
| primary `#95D5A1` | surface `#0F1510` | 文字按钮 / 强调文字 | 10.85:1 | 4.5:1 | 达到 |
| primary `#95D5A1` | surface-container-high `#262B27` | 凸起点（填充） | 8.45:1 | 3:1 | 达到 |
| on-primary `#003916` | primary `#95D5A1` | 填充按钮文字 / 点内编号 | 7.71:1 | 4.5:1 | 达到 |
| on-primary-container `#B0F2BC` | primary-container `#0F5227` | 选中标签 | 7.21:1 | 4.5:1 | 达到 |
| on-secondary-container `#CEEAD2` | secondary-container `#354C39` | 色调按钮 / 选中芯片 | 7.27:1 | 4.5:1 | 达到 |
| on-tertiary-container `#96F1FA` | tertiary-container `#004F55` | 第三色容器 | 7.23:1 | 4.5:1 | 达到 |
| tertiary `#7AD4DE` | surface-container-high `#262B27` | 漏点虚线圈 | 8.44:1 | 3:1 | 达到 |
| error `#FFB4A5` | surface-container-high `#262B27` | 多点外圈 | 8.46:1 | 3:1 | 达到 |
| on-error-container `#FFDAD3` | error-container `#93000B` | 多点内编号 / 错误容器 | 7.22:1 | 4.5:1 | 达到 |
| on-error `#690000` | error `#FFB4A5` | 错误按钮文字 | 7.70:1 | 4.5:1 | 达到 |
| error `#FFB4A5` | primary `#95D5A1` | 多点外圈与命中点（仅记录） | 1.00:1 | 1:1 | 达到 |
| outline `#879489` | surface `#0F1510` | 控件边框 / 禁用文字 | 5.84:1 | 3:1 | 达到 |
| outline `#879489` | surface-container-high `#262B27` | 空点细圈 | 4.55:1 | 3:1 | 达到 |
| on-surface-variant `#BCCABE` | secondary-container `#354C39` | 导航选中指示 | 5.49:1 | 4.5:1 | 达到 |
| outline-variant `#3E4A40` | surface-container-high `#262B27` | 仅装饰分隔线（参考） | 1.55:1 | — | 不用于控件 |

## terracotta（#B5603A）· 浅色

surface `#FFF8F5` · on-surface `#211A17` · primary `#974723`

| 前景 | 背景 | 用途 | 对比度 | 要求 | 结果 |
|---|---|---|---|---|---|
| on-surface `#211A17` | surface `#FFF8F5` | 正文 | 16.33:1 | 4.5:1 | 达到 |
| on-surface `#211A17` | surface-container-high `#F0E6E2` | 卡片正文 | 13.98:1 | 4.5:1 | 达到 |
| on-surface `#211A17` | surface-container-highest `#EAE1DD` | 卡片正文 | 13.32:1 | 4.5:1 | 达到 |
| on-surface-variant `#52443D` | surface `#FFF8F5` | 次要文字 | 8.88:1 | 4.5:1 | 达到 |
| on-surface-variant `#52443D` | surface-container `#F6ECE8` | 导航标签 | 8.03:1 | 4.5:1 | 达到 |
| on-surface-variant `#52443D` | surface-container-high `#F0E6E2` | 卡片次要文字 | 7.60:1 | 4.5:1 | 达到 |
| primary `#974723` | surface `#FFF8F5` | 文字按钮 / 强调文字 | 6.17:1 | 4.5:1 | 达到 |
| primary `#974723` | surface-container-high `#F0E6E2` | 凸起点（填充） | 5.28:1 | 3:1 | 达到 |
| on-primary `#FFFFFF` | primary `#974723` | 填充按钮文字 / 点内编号 | 6.48:1 | 4.5:1 | 达到 |
| on-primary-container `#311400` | primary-container `#FFDBCC` | 选中标签 | 13.21:1 | 4.5:1 | 达到 |
| on-secondary-container `#2D1507` | secondary-container `#FFDBCC` | 色调按钮 / 选中芯片 | 13.30:1 | 4.5:1 | 达到 |
| on-tertiary-container `#1C1D00` | tertiary-container `#E4E6B0` | 第三色容器 | 13.26:1 | 4.5:1 | 达到 |
| tertiary `#5E6232` | surface-container-high `#F0E6E2` | 漏点虚线圈 | 5.24:1 | 3:1 | 达到 |
| error `#B4271F` | surface-container-high `#F0E6E2` | 多点外圈 | 5.27:1 | 3:1 | 达到 |
| on-error-container `#380C00` | error-container `#FFDAD3` | 多点内编号 / 错误容器 | 13.29:1 | 4.5:1 | 达到 |
| on-error `#FFFFFF` | error `#B4271F` | 错误按钮文字 | 6.46:1 | 4.5:1 | 达到 |
| error `#B4271F` | primary `#974723` | 多点外圈与命中点（仅记录） | 1.00:1 | 1:1 | 达到 |
| outline `#84746D` | surface `#FFF8F5` | 控件边框 / 禁用文字 | 4.25:1 | 3:1 | 达到 |
| outline `#84746D` | surface-container-high `#F0E6E2` | 空点细圈 | 3.64:1 | 3:1 | 达到 |
| on-surface-variant `#52443D` | secondary-container `#FFDBCC` | 导航选中指示 | 7.22:1 | 4.5:1 | 达到 |
| outline-variant `#D5C3BB` | surface-container-high `#F0E6E2` | 仅装饰分隔线（参考） | 1.39:1 | — | 不用于控件 |

## terracotta（#B5603A）· 深色

surface `#19120E` · on-surface `#EAE1DD` · primary `#FFB596`

| 前景 | 背景 | 用途 | 对比度 | 要求 | 结果 |
|---|---|---|---|---|---|
| on-surface `#EAE1DD` | surface `#19120E` | 正文 | 14.38:1 | 4.5:1 | 达到 |
| on-surface `#EAE1DD` | surface-container-high `#2F2826` | 卡片正文 | 11.23:1 | 4.5:1 | 达到 |
| on-surface `#EAE1DD` | surface-container-highest `#3A3330` | 卡片正文 | 9.62:1 | 4.5:1 | 达到 |
| on-surface-variant `#D5C3BB` | surface `#19120E` | 次要文字 | 10.89:1 | 4.5:1 | 达到 |
| on-surface-variant `#D5C3BB` | surface-container `#251E1B` | 导航标签 | 9.65:1 | 4.5:1 | 达到 |
| on-surface-variant `#D5C3BB` | surface-container-high `#2F2826` | 卡片次要文字 | 8.51:1 | 4.5:1 | 达到 |
| primary `#FFB596` | surface `#19120E` | 文字按钮 / 强调文字 | 10.85:1 | 4.5:1 | 达到 |
| primary `#FFB596` | surface-container-high `#2F2826` | 凸起点（填充） | 8.47:1 | 3:1 | 达到 |
| on-primary `#581E00` | primary `#FFB596` | 填充按钮文字 / 点内编号 | 7.69:1 | 4.5:1 | 达到 |
| on-primary-container `#FFDBCC` | primary-container `#7A2F0C` | 选中标签 | 7.26:1 | 4.5:1 | 达到 |
| on-secondary-container `#FFDBCC` | secondary-container `#5C4034` | 色调按钮 / 选中芯片 | 7.26:1 | 4.5:1 | 达到 |
| on-tertiary-container `#E4E6B0` | tertiary-container `#454A1C` | 第三色容器 | 7.22:1 | 4.5:1 | 达到 |
| tertiary `#C8CA95` | surface-container-high `#2F2826` | 漏点虚线圈 | 8.50:1 | 3:1 | 达到 |
| error `#FFB4A5` | surface-container-high `#2F2826` | 多点外圈 | 8.49:1 | 3:1 | 达到 |
| on-error-container `#FFDAD3` | error-container `#93000B` | 多点内编号 / 错误容器 | 7.22:1 | 4.5:1 | 达到 |
| on-error `#690000` | error `#FFB4A5` | 错误按钮文字 | 7.70:1 | 4.5:1 | 达到 |
| error `#FFB4A5` | primary `#FFB596` | 多点外圈与命中点（仅记录） | 1.00:1 | 1:1 | 达到 |
| outline `#9E8D86` | surface `#19120E` | 控件边框 / 禁用文字 | 5.83:1 | 3:1 | 达到 |
| outline `#9E8D86` | surface-container-high `#2F2826` | 空点细圈 | 4.55:1 | 3:1 | 达到 |
| on-surface-variant `#D5C3BB` | secondary-container `#5C4034` | 导航选中指示 | 5.52:1 | 4.5:1 | 达到 |
| outline-variant `#52443D` | surface-container-high `#2F2826` | 仅装饰分隔线（参考） | 1.55:1 | — | 不用于控件 |

# 玻璃风格对比度（填充 × 最不利背景点）

玻璃填充 = 浅色 surface-container-lowest / 深色 surface-container-high，不透明度 0.6，叠在背景上；背景最不利点 = 纯 surface、各色块峰值（色块不透明度 浅 0.36 / 深 0.34）及其叠加处。
模糊只会让背景更平均，不会比峰值更极端，故取峰值为下界。无 backdrop-filter 时填充不透明度 0.94（更不透明，对比度只会更好）。
凸起点为实心主色（不透明）；选中的分段 / 主按钮 / 容器色块在玻璃风格下仍是实心色，对比度同上面的 Material 表。

## 玻璃 · teal · 浅色

| 前景 | 用途 | 最不利背景点 | 合成底色 | 对比度（最小） | 要求 | 结果 |
|---|---|---|---|---|---|---|
| on-surface `#161C20` | 正文 | blob-primary | `#D7E8EE` | 13.65:1 | 4.5:1 | 达到 |
| on-surface-variant `#3B4952` | 次要文字 | blob-primary | `#D7E8EE` | 7.37:1 | 4.5:1 | 达到 |
| primary `#00668A` | 文字按钮 / 强调文字 | blob-primary | `#D7E8EE` | 5.10:1 | 4.5:1 | 达到 |
| outline `#6A7983` | 空点细圈 / 控件边 | blob-primary | `#D7E8EE` | 3.56:1 | 3:1 | 达到 |
| tertiary `#685683` | 漏点虚线圈 | blob-primary | `#D7E8EE` | 5.13:1 | 3:1 | 达到 |
| error `#B4271F` | 多点外圈 | blob-primary | `#D7E8EE` | 5.13:1 | 3:1 | 达到 |
| on-surface `#161C20` | 直接放在背景上的文字（标题、分组名） | blob-primary | `#9CC5D5` | 9.30:1 | 4.5:1 | 达到 |
| on-surface-variant `#3B4952` | 直接放在背景上的文字（标题、分组名） | blob-primary | `#9CC5D5` | 5.03:1 | 4.5:1 | 达到 |

## 玻璃 · teal · 深色

| 前景 | 用途 | 最不利背景点 | 合成底色 | 对比度（最小） | 要求 | 结果 |
|---|---|---|---|---|---|---|
| on-surface `#DCE4E9` | 正文 | blob-secondary | `#313B41` | 8.90:1 | 4.5:1 | 达到 |
| on-surface-variant `#B9C9D4` | 次要文字 | blob-secondary | `#313B41` | 6.75:1 | 4.5:1 | 达到 |
| primary `#7DD0FF` | 文字按钮 / 强调文字 | blob-secondary | `#313B41` | 6.73:1 | 4.5:1 | 达到 |
| outline `#84939D` | 空点细圈 / 控件边 | blob-secondary | `#313B41` | 3.62:1 | 3:1 | 达到 |
| tertiary `#D3BDF0` | 漏点虚线圈 | blob-secondary | `#313B41` | 6.72:1 | 3:1 | 达到 |
| error `#FFB4A5` | 多点外圈 | blob-secondary | `#313B41` | 6.73:1 | 3:1 | 达到 |
| on-surface `#DCE4E9` | 直接放在背景上的文字（标题、分组名） | blob-primary | `#335467` | 6.26:1 | 4.5:1 | 达到 |
| on-surface-variant `#B9C9D4` | 直接放在背景上的文字（标题、分组名） | blob-primary | `#335467` | 4.75:1 | 4.5:1 | 达到 |

## 玻璃 · indigo · 浅色

| 前景 | 用途 | 最不利背景点 | 合成底色 | 对比度（最小） | 要求 | 结果 |
|---|---|---|---|---|---|---|
| on-surface `#1B1B20` | 正文 | blob-primary | `#E4E5F2` | 13.71:1 | 4.5:1 | 达到 |
| on-surface-variant `#464552` | 次要文字 | blob-primary | `#E4E5F2` | 7.52:1 | 4.5:1 | 达到 |
| primary `#4F57A6` | 文字按钮 / 强调文字 | blob-primary | `#E4E5F2` | 5.17:1 | 4.5:1 | 达到 |
| outline `#777683` | 空点细圈 / 控件边 | blob-primary | `#E4E5F2` | 3.57:1 | 3:1 | 达到 |
| tertiary `#874C64` | 漏点虚线圈 | blob-primary | `#E4E5F2` | 5.17:1 | 3:1 | 达到 |
| error `#B4271F` | 多点外圈 | blob-primary | `#E4E5F2` | 5.16:1 | 3:1 | 达到 |
| on-surface `#1B1B20` | 直接放在背景上的文字（标题、分组名） | blob-tertiary | `#D0BBC7` | 9.49:1 | 4.5:1 | 达到 |
| on-surface-variant `#464552` | 直接放在背景上的文字（标题、分组名） | blob-tertiary | `#D0BBC7` | 5.20:1 | 4.5:1 | 达到 |

## 玻璃 · indigo · 深色

| 前景 | 用途 | 最不利背景点 | 合成底色 | 对比度（最小） | 要求 | 结果 |
|---|---|---|---|---|---|---|
| on-surface `#E2E2E9` | 正文 | blob-primary | `#393845` | 8.92:1 | 4.5:1 | 达到 |
| on-surface-variant `#C6C5D4` | 次要文字 | blob-primary | `#393845` | 6.76:1 | 4.5:1 | 达到 |
| primary `#C2C1FF` | 文字按钮 / 强调文字 | blob-primary | `#393845` | 6.77:1 | 4.5:1 | 达到 |
| outline `#908F9D` | 空点细圈 / 控件边 | blob-primary | `#393845` | 3.62:1 | 3:1 | 达到 |
| tertiary `#F7B4CD` | 漏点虚线圈 | blob-primary | `#393845` | 6.77:1 | 3:1 | 达到 |
| error `#FFB4A5` | 多点外圈 | blob-primary | `#393845` | 6.75:1 | 3:1 | 达到 |
| on-surface `#E2E2E9` | 直接放在背景上的文字（标题、分组名） | blob-tertiary | `#614A56` | 6.21:1 | 4.5:1 | 达到 |
| on-surface-variant `#C6C5D4` | 直接放在背景上的文字（标题、分组名） | blob-tertiary | `#614A56` | 4.71:1 | 4.5:1 | 达到 |

## 玻璃 · green · 浅色

| 前景 | 用途 | 最不利背景点 | 合成底色 | 对比度（最小） | 要求 | 结果 |
|---|---|---|---|---|---|---|
| on-surface `#181D19` | 正文 | blob-tertiary | `#D7E8E8` | 13.51:1 | 4.5:1 | 达到 |
| on-surface-variant `#3E4A40` | 次要文字 | blob-tertiary | `#D7E8E8` | 7.35:1 | 4.5:1 | 达到 |
| primary `#2C6A3D` | 文字按钮 / 强调文字 | blob-tertiary | `#D7E8E8` | 5.13:1 | 4.5:1 | 达到 |
| outline `#6E7A70` | 空点细圈 / 控件边 | blob-tertiary | `#D7E8E8` | 3.55:1 | 3:1 | 达到 |
| tertiary `#006971` | 漏点虚线圈 | blob-tertiary | `#D7E8E8` | 5.09:1 | 3:1 | 达到 |
| error `#B4271F` | 多点外圈 | blob-tertiary | `#D7E8E8` | 5.11:1 | 3:1 | 达到 |
| on-surface `#181D19` | 直接放在背景上的文字（标题、分组名） | blob-tertiary | `#9CC6C5` | 9.20:1 | 4.5:1 | 达到 |
| on-surface-variant `#3E4A40` | 直接放在背景上的文字（标题、分组名） | blob-tertiary | `#9CC6C5` | 5.00:1 | 4.5:1 | 达到 |

## 玻璃 · green · 深色

| 前景 | 用途 | 最不利背景点 | 合成底色 | 对比度（最小） | 要求 | 结果 |
|---|---|---|---|---|---|---|
| on-surface `#DDE4DE` | 正文 | blob-secondary | `#333B34` | 8.94:1 | 4.5:1 | 达到 |
| on-surface-variant `#BCCABE` | 次要文字 | blob-secondary | `#333B34` | 6.79:1 | 4.5:1 | 达到 |
| primary `#95D5A1` | 文字按钮 / 强调文字 | blob-secondary | `#333B34` | 6.78:1 | 4.5:1 | 达到 |
| outline `#879489` | 空点细圈 / 控件边 | blob-secondary | `#333B34` | 3.65:1 | 3:1 | 达到 |
| tertiary `#7AD4DE` | 漏点虚线圈 | blob-secondary | `#333B34` | 6.77:1 | 3:1 | 达到 |
| error `#FFB4A5` | 多点外圈 | blob-secondary | `#333B34` | 6.79:1 | 3:1 | 达到 |
| on-surface `#DDE4DE` | 直接放在背景上的文字（标题、分组名） | blob-secondary | `#465448` | 6.19:1 | 4.5:1 | 达到 |
| on-surface-variant `#BCCABE` | 直接放在背景上的文字（标题、分组名） | blob-secondary | `#465448` | 4.70:1 | 4.5:1 | 达到 |

## 玻璃 · terracotta · 浅色

| 前景 | 用途 | 最不利背景点 | 合成底色 | 对比度（最小） | 要求 | 结果 |
|---|---|---|---|---|---|---|
| on-surface `#211A17` | 正文 | blob-primary | `#F0E3DD` | 13.66:1 | 4.5:1 | 达到 |
| on-surface-variant `#52443D` | 次要文字 | blob-primary | `#F0E3DD` | 7.43:1 | 4.5:1 | 达到 |
| primary `#974723` | 文字按钮 / 强调文字 | blob-primary | `#F0E3DD` | 5.16:1 | 4.5:1 | 达到 |
| outline `#84746D` | 空点细圈 / 控件边 | blob-primary | `#F0E3DD` | 3.56:1 | 3:1 | 达到 |
| tertiary `#5E6232` | 漏点虚线圈 | blob-primary | `#F0E3DD` | 5.12:1 | 3:1 | 达到 |
| error `#B4271F` | 多点外圈 | blob-primary | `#F0E3DD` | 5.15:1 | 3:1 | 达到 |
| on-surface `#211A17` | 直接放在背景上的文字（标题、分组名） | blob-primary | `#DAB8A9` | 9.32:1 | 4.5:1 | 达到 |
| on-surface-variant `#52443D` | 直接放在背景上的文字（标题、分组名） | blob-primary | `#DAB8A9` | 5.06:1 | 4.5:1 | 达到 |

## 玻璃 · terracotta · 深色

| 前景 | 用途 | 最不利背景点 | 合成底色 | 对比度（最小） | 要求 | 结果 |
|---|---|---|---|---|---|---|
| on-surface `#EAE1DD` | 正文 | blob-secondary | `#423732` | 8.94:1 | 4.5:1 | 达到 |
| on-surface-variant `#D5C3BB` | 次要文字 | blob-secondary | `#423732` | 6.77:1 | 4.5:1 | 达到 |
| primary `#FFB596` | 文字按钮 / 强调文字 | blob-secondary | `#423732` | 6.74:1 | 4.5:1 | 达到 |
| outline `#9E8D86` | 空点细圈 / 控件边 | blob-secondary | `#423732` | 3.62:1 | 3:1 | 达到 |
| tertiary `#C8CA95` | 漏点虚线圈 | blob-secondary | `#423732` | 6.76:1 | 3:1 | 达到 |
| error `#FFB4A5` | 多点外圈 | blob-secondary | `#423732` | 6.76:1 | 3:1 | 达到 |
| on-surface `#EAE1DD` | 直接放在背景上的文字（标题、分组名） | blob-tertiary | `#55513C` | 6.21:1 | 4.5:1 | 达到 |
| on-surface-variant `#D5C3BB` | 直接放在背景上的文字（标题、分组名） | blob-tertiary | `#55513C` | 4.70:1 | 4.5:1 | 达到 |

玻璃风格最低实测对比度：3.55:1（green/light/outline）

未达到要求的配对数：0
