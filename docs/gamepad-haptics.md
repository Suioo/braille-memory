# 手柄：震动（2.7.0）与操控（2.8.0）

## 结构

- `src/core/haptics.js`（`BMHapticsCore`，不碰 DOM）：事件分级（tick / correct / wrong / streak / ramp）、把事件变成「步骤序列」、限流与抢占（新序列取代旧序列，tick 最小间隔 45 ms、播放其他序列时丢弃 tick，不排队）、从多个手柄中选「最后有输入」且支持震动的那个。参数全部来自 `data/config.json` 的 `haptics.gamepad`。
- `src/platform/gamepad-haptics.js`（`BMPadHaptics`）：
  - Windows（Electron）与普通浏览器：Gamepad API 的 `vibrationActuator.playEffect('dual-rumble' | 'trigger-rumble')`。只在有手柄连接且页面可见时以 100 ms 间隔轮询（用于判断最后输入）；失焦、隐藏、拔出时 `reset()`。
  - 安卓：本地 Capacitor 插件 `GamepadHaptics`（`android/app/src/main/java/local/braillememory/GamepadHapticsPlugin.java`，无第三方依赖）。`MainActivity` 把按键 / 摇杆事件交给插件记录「最后输入的设备」，插件用 `InputDevice.getVibratorManager()`（API 31+，需两个可调幅度的马达，第 0 个当强马达、第 1 个当弱马达）或 `InputDevice.getVibrator()`（较旧系统，单马达，强弱取较大值）震动。清单增加 `VIBRATE` 权限。
- 设置开关 `padHaptics`（默认开）仅在 `BMPadHaptics.state.supported` 为真时显示。

## 为什么安卓用原生插件

Android WebView 只把按键事件转给 Gamepad 实现，摇杆等 motion 事件不进入 Gamepad API，`navigator.getGamepads()` 不可靠，所以不依赖它。

## Windows 支持（依据 Chromium 152 源码 `device/gamepad`）

| 手柄 | USB | 蓝牙 | 说明 |
|---|---|---|---|
| Xbox One / Series / Elite | 双马达 + 扳机马达（列表内型号） | 双马达 + 扳机马达（列表内型号） | WGI 后端；型号不在列表则只有双马达 |
| DualShock 4（05c4 / 09cc / SCUF） | 双马达 | 双马达 | RawInput 后端；官方无线适配器（0ba0）不支持 |
| DualSense | ✗ | ✗ | Chromium 在 WGI 中忽略 PS5 手柄，RawInput 也没有其震动实现 → 无 `vibrationActuator`，应用不显示开关 |
| Switch Pro | 双马达（由 LRA 模拟） | 双马达（由 LRA 模拟） | Nintendo 后端 |
| Joy-Con（一代） | — | 双马达（模拟） | 仅蓝牙；左右各一个手柄，同一总线上左右都连时 Chromium 合并为一个「Joy-Con L+R」 |
| Switch 2 Pro / Joy-Con 2 | 未调研、未适配 | | 有则按双马达，否则静默无震动 |

以上来自源码阅读，实机结果以实测为准。

## 安卓支持

取决于系统驱动是否把手柄的马达暴露为 `InputDevice` 的 Vibrator。Xbox / DualShock 4 / DualSense / Switch Pro 在较新系统上通常可由内核驱动暴露，但**未在本环境验证**；Joy-Con 一代的安卓驱动不一定暴露马达。不暴露时开关不显示。

## 精细震动（WebHID HD Rumble）：不做

Switch Pro / Joy-Con 的 HD Rumble 需要向设备写入非官方逆向得到的震动编码（社区资料如 dekuNukem/Nintendo_Switch_Reverse_Engineering 的 rumble_data_table）。不做的原因：Chromium 已经占用这些 HID 设备并自己发送输出包，WebHID 再写会冲突；Electron 需要自己处理 HID 授权；安卓没有对应能力；协议没有官方文档，风险大于收益。故只用双马达。

## 注意

- Gamepad API 要求手柄先按键才会出现，之前没有开关也不报错。
- 所有异常静默吞掉；不支持的手柄静默无震动。


# 手柄操控（2.8.0）

## 结构

- `src/core/padnav.js`（`BMPadNav`，纯逻辑，有测试）：Gamepad 快照 → 动作事件的状态机（边沿触发、死区、连发、不补发积压），以及按屏幕位置就近选择焦点（`pickNext`）、循环切换（`cycle`）。
- `src/platform/gamepad-input.js`（`BMPadInput`）：读手柄并喂给状态机。Electron / 浏览器用 `navigator.getGamepads()`：只在有手柄连接且页面可见时轮询（窗口有焦点用 `requestAnimationFrame`，失焦降到 250 ms 且不产生事件，后台不轮询）。安卓用本地插件的 `pad` 事件（见下），只有手柄按着方向时才开 33 ms 定时器用于连发。
- `src/ui/gamepad-nav.js`（`BMPadUI`）：把动作变成页面操作（移动焦点、点击、返回、翻面……），并管理焦点范围和焦点框。
- `src/app.js`：`ctx.currentView()` / `ctx.back()`；只在非截图模式初始化。
- 各页面可选地提供 `onPad(action)` 处理自己的手柄动作（翻盲文题 / 逐方题的多方输入、课程学习卡）；没提供或返回 false 时走通用处理。

## 键位

只认 Gamepad API 的 `standard` 布局（浏览器不认识的手柄 `mapping` 为空，直接忽略）。standard 布局本身按**物理位置**排序，所以三家手柄是同一张表：

| 物理位置 | 动作 | Xbox | PlayStation | Switch Pro | Joy-Con（一代） |
|---|---|---|---|---|---|
| 右侧四键·下 | 确认（点击焦点） | A | × | B | 单只横握时的「下」键（由 Chromium 旋转后映射） |
| 右侧四键·右 | 返回 / 关闭确认行（同 Esc） | B | ○ | A | 「右」键 |
| 右侧四键·左 | X：学习卡翻面；翻盲文题 = 空方 | X | □ | Y | 「左」键 |
| 右侧四键·上 | Y：主按钮（提交 / 下一方 / 下一题 / 继续 / 开始） | Y | △ | X | 「上」键 |
| 左摇杆 / 十字键 | 按屏幕方向就近移动焦点；点位题在 6 个点位间移动 | ← | ← | ← | 摇杆（旋转后） |
| 左肩键 / 右肩键 | 切换页顶「基础 \| 扩展 \| 规则」分段；多方输入 = 上一方 / 下一方 | LB / RB | L1 / R1 | L / R | SL / SR |
| 左扳机 / 右扳机 | 类别芯片 上一个 / 下一个；翻盲文题里左扳机 = 退格 | LT / RT | L2 / R2 | ZL / ZR | ZL 或 ZR（只有一个） |
| 菜单键 | 打开设置 | Menu | Options | + | + |
| 视图键 | 在底部四个标签之间循环 | View | Create / Share | − | L 或 R |

说明：
- 方向键 / 摇杆只在页面上移动焦点；A 才点击。第一次按方向或确认时，如果焦点框还没显示，只负责把它显示出来（不误触）。
- 点位题里 A 切换当前点位；Y 提交；答错后 Y = 下一题。点位的方向与屏幕位置一致：扎写（镜像）视角下左右镜像排列，按「右」就到屏幕右边的那个点，与点号顺序无关。
- 多方输入：LB / RB 上一方 / 下一方；**X = 空方**（翻盲文题；逐方题每一方都要有点，没有空方）；LT 退格；Y 提交。X 在学习卡 / 课程卡片上是翻面，在翻盲文题里是空方，两者不在同一个页面，所以不冲突。
- 不是标准布局的手柄（浏览器 `mapping` 为空）和 Switch 2 Pro / Joy-Con 2 这次不处理：没有反应，也不会乱操作。

## 焦点规则

- 手柄一有输入，`<html>` 加 `data-input="pad"`，CSS 里所有 `:focus-visible` 的样式同时对 `html[data-input="pad"] :focus` 生效（焦点框与键盘一致）；鼠标 / 触屏 / 键盘按下后去掉。
- 范围：启动画面（任何键只用来跳过） > 带 `data-pad-layer` 的确认行（焦点只在里面，B 取消它，其余键不动底下的页面） > 当前页面（含底部标签）。
- 焦点被重画掉（自动下一题、换页）时，手柄模式下会自动落回合适位置：`data-autofocus` > 点位 > 可用的主按钮 > 页面内容里第一个。
- 焦点移到看不见的位置时用 `scrollIntoView({block:'nearest'})` 滚动到可见；那个方向没有可聚焦项且是上下方向时，滚动页面内容。
- 就近选择：按方向找中心在该方向一侧的候选，评分 = 边缘间距 + 2 × 垂直间距 + 0.3 × 中心偏移；垂直偏移超过前进量 2 倍且不重叠的先排除（上下方向没有别的候选时放宽）。

## 安卓：原生插件转发

WebView 对手柄只合成方向键 / Enter，摇杆完全不进网页，所以操控也走本地插件 `GamepadHaptics`（`android/app/src/main/java/local/braillememory/GamepadHapticsPlugin.java`）：

- `MainActivity.dispatchKeyEvent / dispatchGenericMotionEvent` 把手柄（`SOURCE_GAMEPAD` / `SOURCE_JOYSTICK`）的按键与摇杆交给插件；网页调用 `setInput({enabled:true})` 之后，这些事件由插件消耗（不再让 WebView 合成方向键 / Enter，避免重复触发）。系统返回键等非手柄键不受影响；网页没开启时保持 WebView 的默认行为。
- 插件整理成与 standard 布局一致的位掩码，用 `pad` 事件推送：`{ id, name, b, lx, ly, rx, ry }`；摇杆量化到 0.1、有变化才推送；设备拔出推 `{ id, gone: true }`；应用进入后台时清空状态。
- 键码映射：`BUTTON_A/B/X/Y` → 0/1/2/3（安卓按位置命名：A = 下方键），`L1/R1/L2/R2` → 4–7，`SELECT/START` → 8/9，`THUMBL/THUMBR` → 10/11，`DPAD_*` → 12–15，`MODE` → 16；十字键也可能来自 HAT 轴，扳机也可能来自 `LTRIGGER/RTRIGGER`（或 `BRAKE/GAS`）轴，右摇杆在 Z/RZ 与 RX/RY 之间取偏得更多的一组。
- 这部分 Java **没有在云端环境编译过**（环境里没有 Android SDK），需要你本机 `npm run android:build` 编译并真机验证。
