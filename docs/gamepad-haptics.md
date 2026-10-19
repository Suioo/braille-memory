# 手柄震动（2.7.0）

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
