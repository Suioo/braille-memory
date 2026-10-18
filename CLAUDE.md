# CLAUDE.md

盲文记忆：汉语现行盲文点位记忆练习。纯 HTML/CSS/JS，Electron（Windows）+ Capacitor 8（Android）。开发说明见 `docs/README.md`。

## 数据铁律（DATA IRON LAW）

- 盲文点位只来自 `data/braille_table.csv`。**绝不凭记忆生成、补全或“修正”任何盲文点位**。
- 新增 / 修改数据，只能在维护者对照标准原文（GF 0019—2018）核实之后进行。标准 PDF 不入库。
- 图标等装饰用点位也要运行时从 CSV 读取，代码里不写点位。

## 工作方式

- 改动前后都运行 `npm test`，必须全绿。
- 纯逻辑放 `src/core/`（不碰 DOM），要有 `tests/` 测试。
- 用户界面语言为中文；文字界面保持极简。
- 绝不提交 `private/`、keystore（`*.keystore` / `*.jks`）、`local.properties`、令牌或密钥；`private/contact.json` 仅本机。联系方式不得写入源码、字符串、测试或文档，也不得打印日志。
- 不要擅自 commit / push。

## 必须保留的既有修复

- 点按高亮透明：`-webkit-tap-highlight-color: transparent`
- 卡片翻转：90° 处切换正反面可见性 + 抬起（lift）
- hover 样式只在 `(hover: hover) and (pointer: fine)` 下生效
- 粗指针（触屏）设备上不自动聚焦
- `linear()` 缓动只写在 `@supports` 内
- 减弱动效：`prefers-reduced-motion` 的 `!important` 块
- 卡片布局基于容器（container）单位
- 控件原位更新，设置页滚动位置保持
- 「关于」彩蛋：版本号 7 次点按（7 s 内）+ 长按 2 s（或按住 Enter/Space），逻辑在 `src/core/about.js`，触发前无任何提示

## 构建速查

`npm run pack`（Windows 目录版）；`npm run android:sync` + `npm run android:build`（调试 APK）；`npm run android:release`（正式签名 APK → `dist\盲文记忆-<版本>.apk`，需本机 `android/keystore.properties` 与 `private/` 下的密钥，打包后自动 apksigner 验证）。版本号以 `package.json` 为准，另改 `android/app/build.gradle` 的 versionCode / versionName。
