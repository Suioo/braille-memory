# 手柄：震动（2.7.0 / 2.8.1）与操控（2.8.0 / 2.8.1）

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
| DualSense / DualSense Edge | 双马达（WebHID，2.8.1） | 双马达（WebHID，2.8.1） | Chromium 在 WGI 中忽略 PS5 手柄，RawInput 也没有其震动实现 → Gamepad API 里没有 `vibrationActuator`；改由应用用 WebHID 直接发输出报告，见下节。WebHID 通道不可用时不显示开关 |
| Switch Pro | 双马达（由 LRA 模拟） | 双马达（由 LRA 模拟） | Nintendo 后端 |
| Joy-Con（一代） | — | 双马达（模拟） | 仅蓝牙；左右各一个手柄，同一总线上左右都连时 Chromium 合并为一个「Joy-Con L+R」 |
| Switch 2 Pro / Joy-Con 2 | 未调研、未适配 | | 有则按双马达，否则静默无震动 |

以上来自源码阅读，实机结果以实测为准。

**DualShock 4 的蓝牙震动（2.8.1 核对 Chromium 152 源码 `dualshock4_controller.cc`）**：RawInput 后端无法区分总线，靠 HID「版本号」判断——`0x0100` = USB（发 0x05 号报告），`0` = 蓝牙（发 0x11 号报告 + CRC32，种子 0xA2，与 DualSense 同一算法），其余值按未知处理，走 USB 报告。所以蓝牙下**取决于 Windows 蓝牙栈上报的版本号是不是 0**：是则正常；不是则 Chromium 会发 USB 格式的报告，手柄收不到 → 没有震动（此时手柄仍会被识别、开关仍显示，这是 Chromium 一侧的限制，应用无法绕开）。这一点无法在云端环境验证，需要你用 DualShock 4 蓝牙实测。USB 不受影响。

## 安卓支持

取决于系统驱动是否把手柄的马达暴露为 `InputDevice` 的 Vibrator。Xbox / DualShock 4 / Switch Pro 在较新系统上通常可由内核驱动暴露，但**未在本环境验证**；Joy-Con 一代的安卓驱动不一定暴露马达；DualSense 见下节。不暴露时开关不显示（最后操作的手柄不能震、另一个手柄能震时，开关显示且震动给那个能震的手柄，与插件里 `target()` 的选择一致）。

### 安卓上的 DualSense：不做

- 现有插件通过 `InputDevice.getVibratorManager()`（API 31+）/ `getVibrator()` 拿马达，这条路只有在**内核驱动把手柄注册成带力反馈（FF_RUMBLE）的输入设备**时才有马达。DualSense 的力反馈来自 Linux 内核的 `hid-playstation` 驱动（要求内核开启 `CONFIG_HID_PLAYSTATION` 与力反馈 `CONFIG_PLAYSTATION_FF`）；很多厂商内核没有开启，或者 DualSense 只被通用 HID 驱动接管（能收按键和摇杆，不能震）——此时插件的 `getState()` 里该设备 `motors = 0`，应用不显示「手柄震动」开关，不假装能用。
- 能不能震因此取决于机型的内核配置和 Android 版本（`VibratorManager` 需要 API 31+，`hid-playstation` 在较新的 GKI 内核里才可能启用），**无法在应用里改变**，也没有在真机上验证。
- 用 USB Host API 直接给 DualSense 发输出报告：不可靠，不做。拿到设备要先弹系统的 USB 权限对话框（每次插拔都要）；更关键的是系统内核驱动已经占着 HID 接口，要自己发报告就得 `claimInterface(force)` 把内核驱动卸下来，卸掉以后这支手柄**在安卓里就没有按键 / 摇杆输入了**（要自己读中断端点重做一遍输入），还要求手机支持 OTG；蓝牙下没有对应接口。代价远大于收益。

## DualSense 震动（Windows，2.8.1）

结构：`src/core/dualsense.js`（`BMDualSenseCore`，纯逻辑：报告格式、CRC32、强度换算、白名单，有测试）+ `src/platform/dualsense-hid.js`（`BMDualSense`，WebHID 设备管理）+ `src/platform/gamepad-haptics.js`（把 DualSense 接进现有触感事件）。按键 / 摇杆仍走 Gamepad API，不受影响。

- **权限（`main.js`）**：`session.setDevicePermissionHandler` 只允许 `deviceType === 'hid'`、来自应用自己的页面（`file:`）、vendorId = `0x054C` 且 productId 是 DualSense（`0x0CE6`）或 DualSense Edge（`0x0DF2`）的设备；`setPermissionCheckHandler` 只让应用自己的窗口使用 `hid`（其余权限保持 Electron 默认，例如剪贴板）；`select-hid-device` 不弹选择框，有 DualSense 就直接选它，否则取消。页面用 `navigator.hid.getDevices()` 直接拿到已授权的设备。白名单函数 `isAllowedHid` 有测试（DualShock 4、别家同号、Switch Pro 全部拒绝）。
- **走哪条路**：看设备的 HID 描述符——有输出报告 `0x31` 走蓝牙，有 `0x02` 走 USB，都没有就不支持（静默无震动）。报告大小取描述符。
- **USB**：输出报告 `0x02`，共 63 字节 = 报告号 + 47 字节 common + 15 字节保留；`sendReport(0x02, data)` 的 data 不含报告号。
- **蓝牙**：输出报告 `0x31`，共 78 字节 = 报告号 + `seq_tag`（高 4 位是每发一次加 1 的序号，0–15 循环；低 4 位 0）+ `tag`（`0x10`）+ 47 字节 common + 24 字节保留 + 4 字节 CRC32（小端）。CRC32 是标准 zlib CRC-32，输入 = 种子字节 `0xA2` + 报告前 74 字节（含报告号）。蓝牙下先读一次 feature 报告 `0x05`（手柄据此切到完整报告模式，内核驱动同样这么做）。
- **common 段**（偏移从 common 起点算）：`[0] valid_flag0`、`[1] valid_flag1`、`[2] motor_right`（弱 / 高频）、`[3] motor_left`（强 / 低频）、`[38] valid_flag2`。震动：`valid_flag0 |= 0x02`（选经典震动）；固件「更新版本」≥ 2.21（`0x0215`，读 feature 报告 `0x20` 的第 44 字节，WebHID 返回的数据不含报告号时是第 43 字节）用新方式 `valid_flag2 |= 0x04`，更早用旧方式 `valid_flag0 |= 0x01`；DualSense Edge 恒为新方式；读不到固件版本时两种标志都置。灯光、音频、扳机的 valid 位一律不置，不会动它们。
- **强度**：触感步骤的强 / 弱（0..1，沿用 `data/config.json` 的 `haptics.gamepad`）线性换算到 0..255，强 → `motor_left`，弱 → `motor_right`。输出报告没有「持续多久」，所以每步的时长到了就发一次全 0 的报告关掉；失焦 / 隐藏 / 断开也发全 0。
- **发送**：同一时间只有一个写入在途，期间来的新值只保留最后一个（不排队）；任何失败（发送被拒、设备断开、描述符不认识、打开失败）都静默：`BMDualSense.ready` 变 false，设置里的「手柄震动」开关随之隐藏，按键操控与答题不受影响。
- **同时连着多个 DualSense** 时，WebHID 与 Gamepad API 的设备无法一一对应，只会震第一个。
- **注意**：Windows 上其它程序（Steam 输入、DS4Windows 等）占着手柄时，写入可能失败或互相覆盖；失败时静默无震动。

### 自适应扳机（R2 阻力）：不做

设置里的「扳机反馈」开关没有做。原因：(1) 本次指定的协议依据 Linux 内核 `hid-playstation.c` 没有实现自适应扳机，里面没有扳机效果的字段定义（common 段里对应的是 `reserved2`），没有可核对的权威来源；(2) 效果模式字节、参数含义只在社区逆向文档里流传，彼此不完全一致，也没有办法在云端环境验证；(3) 参数错了可能让扳机出现很大的阻力，硬件风险得不偿失。等有可靠依据再做。

## 资料来源

- Linux 内核 `drivers/hid/hid-playstation.c`（DualSense：报告号 / 大小、common 结构体、CRC 种子 `0xA2`、震动标志位、`update_version` 与 2.21 阈值、`motor_left = strong`、`motor_right = weak`）：<https://github.com/torvalds/linux/blob/master/drivers/hid/hid-playstation.c>
- Chromium 152 `device/gamepad/dualshock4_controller.cc`、`raw_input_gamepad_device_win.cc`、`hid_writer_win.cc`（DualShock 4 的 USB / 蓝牙报告与总线判断）、`nintendo_controller.cc`（Switch Pro / Joy-Con 的标准布局映射与横握旋转）、`gamepad_id_list.cc`。
- Electron 文档：`session.setDevicePermissionHandler`、`select-hid-device`（WebHID 权限）。


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

### Switch 手柄的键位（2.8.1）：按键帽字母 / 按物理位置

先核实了排布，避免「换两次」：Chromium 的 `nintendo_controller.cc` 把 Switch Pro 的 `button_b`（下方）放在 standard 序号 0（PRIMARY）、`button_a`（右边）放序号 1、`button_y`（左边）序号 2、`button_x`（上方）序号 3——**本身就是按物理位置排的**，所以不需要先「还原」再交换。安卓的 `KEYCODE_BUTTON_A/B/X/Y` 同样按位置命名（A = 下方键），插件按它们原样转成序号 0–3。

「设置 → 练习 → Switch 手柄按键」（只在检测到 Switch Pro / Joy-Con 时显示，在「手柄震动」下面）：

| 模式 | 确认 | 返回 | 翻面 / 空方（X） | 主按钮（Y） |
|---|---|---|---|---|
| 按键帽字母（默认） | A（右） | B（下） | Y（左） | X（上） |
| 按物理位置（同 2.8.0） | B（下） | A（右） | Y（左） | X（上） |

可以看到只有 A / B 两个键互换：Switch 的 Y 在左、X 在上，位置上本来就对应 Xbox 的 X（左，翻面）和 Y（上，主按钮），所以两种模式下 X / Y 的功能相同。

- Pro / 合并成一个的 Joy-Con（`Joy-Con L+R`，也包括充电握把）：序号 0 / 1 互换。
- 单只横握：Chromium 把右 Joy-Con 旋转成标准布局，序号 0 / 1 / 2 / 3 = A / X / B / Y，所以「按键帽字母」时 A = 确认、B = 返回、Y = 翻面、X = 主按钮；左 Joy-Con 没有字母键（是方向键形状的四个键），两种模式相同。
- 识别：Windows 看 Gamepad `id` 里的 `Vendor: 057e Product: …`（`2009` Pro、`2006` 左、`2007` 右、`200e` 握把 / 合并）；安卓看 `InputDevice` 的 vendorId / productId（插件的 `pad` 事件带 `v` / `p`）。Xbox、PlayStation 不受影响。
- 安卓上 Switch Pro 的 A / B 键码取决于系统自带的键值映射（`.kl`）和内核驱动，**没有在真机上验证**；如果你的机型上和上表相反，把模式切到另一个即可。
- 切换在运行时生效（每次按键都读当前设置）。

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


## 焦点框（2.8.1）

处在滚动容器 / `overflow` 裁切容器里的可聚焦元素，外画的焦点框会被裁掉（例如横向滚动的类别芯片行）。2.8.1 起：

- 类别芯片、词槽条里的词槽、迷你点图按钮、顶栏图标按钮的焦点框画在元素内部（`outline-offset: -3px`），跟随元素圆角，不偏移；键盘 `:focus-visible` 与手柄 `html[data-input="pad"] :focus` 是同一组规则，样式一致。
- 芯片设置了 `scroll-margin-inline`，芯片行设置了 `scroll-padding-inline`：焦点移到行首 / 行尾的芯片时（键盘或手柄）会完整滚动到可见位置。
- 检查方法：无头浏览器对「学习 / 练习（基础、扩展、词句、文本）/ 闯关 / 设置（全部展开）/ 点位题 / 选符号题 / 翻盲文题 / 课程」逐个聚焦所有可聚焦元素，量焦点框的外沿是否超出任何 `overflow` 非 visible 的祖先；两种风格 × 深浅色 × 375 / 800 px 共 1552 个焦点目标，修复前芯片和顶栏返回按钮被裁，修复后为 0。
