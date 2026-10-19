# 参与贡献

感谢你愿意改进「盲文记忆」！提交之前请先读完本文，并遵守[行为准则](CODE_OF_CONDUCT.md)。

## 数据铁律（最重要）

本项目教的是盲文点位，**错一个点就会教错人**。因此：

- 盲文点位只来自 `data/braille_table.csv` 与 `data/braille_extra.csv`；规则、写法与例词只来自 `data/rules.json`；拼音还原规则只来自 `data/pinyin_map.json`。代码里不写死任何点位。
- 这些数据的依据只有一个：**《国家通用盲文方案》（GF 0019—2018）**。任何对 `data/` 的新增或修改，都必须在 issue / PR 里**注明标准的页码**（必要时附条款编号与原文写法），由维护者对照标准原文核实后才会合并。
- **不接受凭记忆、凭经验、凭其他资料或工具（包括 AI 生成）修改点位和规则**的提交。拿不准时请提 issue 并附页码，不要直接改数据。
- 标准原文 PDF 不入库，请不要把它或其截图提交到仓库。
- 拼音库与自动标注只能提供拼音和分词，盲文由 `src/core/translate.js` 按规则计算，从不由它们给出。

## 开发环境

- Node.js 22 或更高版本
- `npm ci` 安装依赖；`npm start` 以 Electron 开发运行；`npm run pack` 打包 Windows 目录版
- Android 构建需要 JDK 21 与 Android SDK，见 [README](README.md#从源码构建)；日常开发和提交 PR 不需要
- 调试时用临时数据目录，避免碰真实存档：`npx electron . --user-data=<临时目录>`
- 开发说明与文件结构见 [docs/README.md](docs/README.md)

项目是纯 HTML / CSS / JS（无打包器、无框架）。纯逻辑放在 `src/core/`（不碰 DOM，Node 与浏览器通用），界面放在 `src/ui/` 与 `src/views/`。

## 测试

```
npm test
```

- 提交前必须全绿；改动前后各跑一次。
- 纯逻辑要有对应的 `tests/*.test.js`；夹具从真实数据文件推出，不要在测试里手写点位。
- 测试和截图只使用临时数据，不要读写真实存档。

## 界面约定

- 界面语言为中文，文字保持极简；按钮文字 2–4 个字。
- 以下既有处理不要回退：点按高亮透明（`-webkit-tap-highlight-color: transparent`）、卡片翻转在 90° 处切换正反面、hover 样式只写在 `(hover: hover) and (pointer: fine)` 下、触屏设备不自动聚焦、`linear()` 缓动只写在 `@supports` 内、`prefers-reduced-motion` 下动效瞬间完成、卡片布局基于容器单位、控件原位更新且设置页滚动位置保持。
- 界面改动请在 375 px 宽度、浅色 / 深色、Material / 玻璃两种风格下各看一遍。

## 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)，一条提交只做一件事：

```
<类型>(<范围>): <简短说明>
```

常用类型：`feat`（新功能）、`fix`（修复）、`docs`（文档）、`refactor`（重构）、`test`（测试）、`chore`（构建与杂项）、`data`（数据，须附页码）。示例：

```
feat(texts): 文本练习增加计时成绩
fix(about): 修复真机长按触发失败
docs: 更新构建说明
```

改版本号时，`package.json`、`package-lock.json` 根部的 `version` 与 `android/app/build.gradle` 的 `versionCode` / `versionName` 要一起改。

## 分支与 PR 流程

1. Fork 本仓库，从 `main` 新建分支（如 `fix/xxx`、`feat/xxx`、`docs/xxx`）。**不要直接向 `main` 推送。**
2. 完成改动，运行 `npm test`，确认全绿。
3. 提交并推送到你的分支，向 `main` 发起 Pull Request，按模板填写：改动说明、测试结果，以及是否涉及 `data/`（涉及则必须附标准页码）。
4. 维护者评审；请根据意见修改，合并时一般使用 squash 或 rebase。

## 报告问题

- 一般问题与功能建议：直接提 issue。
- 点位 / 规则错误：请使用“点位 / 规则错误”模板，写明符号或规则编号、正确写法和标准页码。
- 安全问题：不要公开提 issue，见 [SECURITY.md](SECURITY.md)。

## 不要提交的内容

`private/`、密钥库（`*.keystore`、`*.jks`）、`android/keystore.properties`、`local.properties`、令牌、密钥，以及任何个人联系方式。这些都已写入 `.gitignore`，请不要用 `git add -f` 绕过。
