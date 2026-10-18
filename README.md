# 盲文记忆

汉语现行盲文点位记忆练习。纯 HTML/CSS/JS（无打包器、无框架），以 Electron（Windows）和 Capacitor（Android）运行。

## 功能

- 学习、练习、课程（分课、评星、闯关）、复习与错题，四个标签页
- 点位与符号互相识别：按点位作答，或在选项中选择；支持镜像（写）/ 正读（读）视图
- Material Design 3 风格，浅色 / 深色 / 跟随系统，可换主题色，另有玻璃风格
- 键盘与触屏均可操作，支持读屏与减弱动效
- 进度保存在本机，不联网；「我的」页可导出 / 导入记录（.json），导入前自动备份，可一键撤销

## 截图

（待补充）

## 运行

```
npm install
npm start        # Electron 开发运行
npm test         # node --test，纯逻辑测试
```

调试时可用临时数据目录避免碰真实存档：`npx electron . --user-data=<临时目录>`。更多开发说明见 `docs/README.md`。

## 构建

Windows 便携目录版（未签名）：

```
npm run pack     # 输出 dist/win-unpacked/盲文记忆.exe
```

首次运行未签名的 exe 时 Windows SmartScreen 可能提示“未知发布者”，选“更多信息 → 仍要运行”。

Android 调试 APK（需 JDK 21 与 Android SDK；以下路径仅为示例，按本机调整；改动 `package.json` 依赖或原生插件后先 `npm run android:sync`）：

```
set JAVA_HOME=D:\android-dev\jdk-21
set ANDROID_HOME=D:\android-dev\sdk
npm run android:sync
npm run android:build
```

正式签名版（可持续覆盖升级，只在本机打包）：先用 keytool 在 `private/` 生成密钥，复制 `android/keystore.properties.example` 为 `android/keystore.properties` 并填写（均已被 git 忽略，绝不提交），然后：

```
npm run android:release   # 输出 dist\盲文记忆-<版本号>.apk，并用 apksigner 验证签名
```

- 发新版时同时改 `package.json` 的 `version` 与 `android/app/build.gradle` 的 `versionName`（须一致，否则脚本拒绝打包），并递增 `versionCode`。
- 密钥与密码丢失 = 以后无法覆盖升级，请离线多处备份。
- 调试签名与正式签名不同：从调试版换装正式版需先卸载，卸载会清空本机记录，换装前先用「导出记录」备份。

## 记录导出 / 导入

「我的 → 记录」：

- **导出**：把完整进度（含设置；有自定义文本时一并带上，导出格式 2，仍可导入格式 1）存成 `braille-memory-YYYYMMDD.json`。Windows 用保存对话框；安卓写入缓存后调起系统分享面板（可选「保存到文件」）。
- **导入**：选文件后先校验格式与版本，再提示「导入 N 项，跳过 M 项」，确认才覆盖；字表签名与当前 CSV 不符的记录会被跳过。覆盖前自动备份当前记录，写入失败自动恢复。
- **撤销**：恢复到最近一次导入之前；下次导入会覆盖这份备份。

安卓依赖 `@capacitor/filesystem` 8.1.4 与 `@capacitor/share` 8.0.3（精确版本）。

## 数据来源

点位数据整理自 GF 0019—2018《国家通用盲文方案》，并经人工逐项核对，唯一来源是 `data/braille_table.csv`。
标准原文 PDF **不包含**在本仓库中。如发现错误请提 issue，修改数据前需对照标准原文核实。

## 可选：本机私有联系方式

在 `private/contact.json`（已被 git 忽略，不会入库）中放置 `{"label":"…","qq":"…","name":"…"}`，
构建时会被复制进应用；文件不存在则相应入口什么都不显示。

## 许可

MIT，见 `LICENSE`。
