# 第三方许可声明（Third-party notices）

本项目自身以 GPL-3.0-or-later 许可证发布（见 [LICENSE](LICENSE)）。下面列出**打包进应用**的第三方组件及其许可证；版本以 `package-lock.json` 与 `src/vendor/VENDOR.json` 为准。

下面各第三方组件保留它们自己的许可证（均为宽松许可证，与 GPL-3.0 兼容），不因本项目改用 GPL 而改变；它们的版权与许可声明请原样保留。

## 随应用分发的代码

| 组件 | 版本 | 许可证 | 用在哪里 | 来源 |
|---|---|---|---|---|
| pinyin-pro | 3.29.5 | MIT | 自定义文本的拼音转换。UMD 文件原样复制在 `src/vendor/pinyin-pro.js`（sha256 记在 `src/vendor/VENDOR.json`），许可证全文见 `src/vendor/pinyin-pro.LICENSE` | <https://github.com/zh-lx/pinyin-pro> |
| Electron | 44.5.1 | MIT | Windows 桌面版运行时（内含 Chromium、Node.js 等，各自的许可证随 Electron 发行包中的 `LICENSE` 与 `LICENSES.chromium.html` 一并分发） | <https://github.com/electron/electron> |
| @capacitor/core | 8.5.2 | MIT | Android 版：原生桥与 Web 运行时 | <https://github.com/ionic-team/capacitor> |
| @capacitor/android | 8.5.2 | MIT | Android 版：原生容器 | <https://github.com/ionic-team/capacitor> |
| @capacitor/filesystem | 8.1.4 | MIT | Android 版：导出记录时写入缓存文件 | <https://github.com/ionic-team/capacitor-filesystem> |
| @capacitor/share | 8.0.3 | MIT | Android 版：导出记录时调起系统分享 | <https://github.com/ionic-team/capacitor-plugins> |
| @capacitor/haptics | 8.0.2 | MIT | Android 版：震动反馈 | <https://github.com/ionic-team/capacitor-plugins> |
| @capacitor/browser | 8.0.5 | MIT | Android 版：用系统浏览器打开「设置 → 关于」里的项目地址 | <https://github.com/ionic-team/capacitor-plugins> |
| @capacitor/splash-screen | 8.0.2 | MIT | Android 版：控制原生启动屏的背景色与隐藏时机 | <https://github.com/ionic-team/capacitor-plugins> |
| @capacitor/app | 8.1.2 | MIT | Android 版：系统返回键 / 返回手势交给应用自己的返回逻辑 | <https://github.com/ionic-team/capacitor-plugins> |

Android 版还通过 Gradle 引入 AndroidX（appcompat、coordinatorlayout、core-splashscreen 等）、Kotlin 协程等库，它们按各自的开源许可证（主要为 Apache License 2.0）分发，版本见 `android/variables.gradle` 与各插件的 `build.gradle`；具体许可证以各库的发布页为准。

## 仅用于开发与构建（不随应用分发）

| 组件 | 版本 | 许可证 |
|---|---|---|
| electron-builder | 26.15.3 | MIT |
| @capacitor/cli | 8.5.2 | MIT |

## 设计与数据

- 界面遵循 Material Design 3 的设计语言；未使用其官方资源文件。
- 盲文点位与规则依据《国家通用盲文方案》（GF 0019—2018）整理；标准原文不包含在本仓库中。

## pinyin-pro 许可证全文

```
MIT License

Copyright (c) 2022-present zh-lx

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
