# 盲文记忆 — 开发说明

汉语现行盲文点位记忆练习。Electron（Windows）与 Capacitor（Android），纯 HTML/CSS/JS（无打包器、无框架）；运行时依赖只有 pinyin-pro（复制在 `src/vendor/`）与几个 Capacitor 插件，见 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)。
界面为 Material Design 3 风格；盲文点位只来自 `data/braille_table.csv`。

## 运行

先 `npm ci` 安装依赖，然后在项目根目录：

```
npx electron .          # 或 npm start
```

存档在 `%APPDATA%\盲文记忆\progress.json`（Electron 按 productName 生成的 userData 目录）；自定义文本库在同目录 `texts.json`（网页/安卓为 localStorage `braille-memory.texts`），仅本机。
调试时用临时目录，避免碰真实存档：

```
npx electron . --user-data=<临时目录>
```

## 测试

```
npm test                 # = node --test "tests/**/*.test.js"
```

- 纯逻辑在 `src/core/*.js`（不碰 DOM），用 Node 自带测试运行器测试；夹具从真实 CSV 推出。
- `tests/store.test.js` 只在系统临时目录读写。

## 截图与冒烟

```
node tools/shots.js                     # 全部页面 × 浅/深 × 720x960/480x640 + 陶土种子 → docs/shots/
npx electron . --shot=practice-wrong --out=a.png --theme=dark --size=480x640 [--seed=green]
npx electron . --e2e=round-done --user-data=<临时目录>   # 跑一遍流程并真实写存档后退出
node tools/contrast.js                  # 重新生成 docs/contrast.md
npx electron . --shot=learn-mirror --out=a.png --size=412x915 --font-scale=1.3 --style=glass   # 模拟安卓文字缩放 130%；截图时控制台输出 overflow 自检结果
```

截图模式自动使用临时数据目录且不写盘。页面预设名见 `src/app.js` 的 `SHOTS`。

## 文件结构

| 路径 | 内容 |
|---|---|
| `main.js` | 主进程：窗口（720×960，最小 480×640）、IPC、存档、截图 / 冒烟参数 |
| `preload.js` | `window.bm`：boot / saveProgress / setTheme / 截图回调（contextIsolation + sandbox） |
| `data/braille_table.csv` | 字表（id, symbol, dots, source, category）——主表点位来源 |
| `data/braille_extra.csv` | 扩展符号表（id, symbol, cells, source, category, note；cells 以空格分隔各方）：多方标点、字母符号、数字、英语字母；缺失时扩展功能隐藏 |
| `data/rules.json` | 规则数据（rules[]：id、cat、page、text、可选 note / forms / examples，以及引擎执行用的 apply）；缺失时规则相关入口隐藏 |
| `data/pinyin_map.json` | 拼音还原表（y/w、iu/ui/un、j/q/x 后 u→ü、v→ü、声母 / 韵母别名、声调符号、标点字符→符号名、数号规则）；引擎不另写任何拼音常量 |
| `data/config.json` | 每课符号数、选项数、计分、题量、自动下题、防误触、闯关阈值 |
| `src/core/` | backup（记录导出 / 导入校验 / 撤销）、seq（多方符号判分与扎写排列）、ext（扩展符号分组与选项）、ext-round（扩展符号练习轮次）、rules（规则数据校验）、pinyin（拼音解析）、translate（翻盲文引擎）、rule-items（规则 / 词句题目库与错因定位）、rule-round（规则 / 词句练习轮次）、csv（解析校验）、cell（布局/判分）、config、pick（随机/加权/选项）、timer、progress（计分/存档模型）、round（练习/复习/错题）、course（分课/评星/单课流程）、palette（M3 配色/对比度） |
| `src/main/store.js` | 原子写入 + 损坏备份 |
| `src/ui/` | dom（工具/图标）、theme（配色写入 CSS 变量）、widgets（M3 部件、盲文方） |
| `src/views/` | learn、practice、course、me（4 个标签页）；round、result、lesson、lesson-result（全屏页）；common；ext（扩展符号的学习 / 练习内容）、extround（扩展符号答题）、rules（规则卡学习与词句练习内容）、ruleround（规则 / 词句答题） |
| `src/app.js` | 路由、底部导航、键盘、存档、截图预设 |
| `src/styles.css` | M3 样式与动效 |
| `tests/` | node --test 测试 |
| `tools/` | shots.js、contrast.js、build-www.js、android-build.js（调试版 / `--release` 正式签名版） |
| `docs/` | design.md（设计）、progress.md、report.md、contrast.md、shots/、samples/（W0 黑白旧样张，已作废） |

## 键盘

1–6 按点位编号切换点（与镜像无关）；1–4 选符号；Enter 提交/继续/翻面；空格翻面；←/→ 换卡或移动焦点；Esc 返回；Tab 遍历控件。

## 图标

```
npm run icon            # = electron tools/make-icon.js
```

- 点位取自 `data/braille_table.csv` 的**第一条数据行**（运行时读取，代码里不写点位），图标上的盲文方纯属装饰。
- 颜色：默认种子（青蓝）浅色方案的 primary-container（底）与 primary（点）；≤ 24 px 用放大点、不画空点的小号版。
- 输出：`build/icon.svg`（源）、`build/icon-small.svg`、`build/icon-<16…256>.png`、`build/icon.png`（256）、
  `build/icon.ico`（7 个尺寸，ICO 容器由 `tools/icon-lib.js` 自写）、`src/assets/icon.{ico,png}`（窗口/任务栏）、
  `docs/shots/icon-preview.png`。

## 打包（便携目录版）

```
npm run pack            # electron-builder --win dir → dist\win-unpacked\盲文记忆.exe
```

- `win.icon = build/icon.ico`，`win.signExecutable = false`（不签名，但写入图标与版本信息；本机 electron-builder 26 用 resedit 完成，未下载 winCodeSign）。
- Electron 运行时 zip 取自本机缓存 `%LOCALAPPDATA%\electron\Cache`。
- 检查：`dist\win-unpacked\盲文记忆.exe --shot=learn-back --out=a.png`。

## 平台适配

页面只通过 `window.bm` 与平台交互，不直接调用 Electron 或 Capacitor：

- Electron：`preload.js` 暴露 `window.bm`，存档读写在主进程 `src/main/store.js`。
- Web / Capacitor（Android）：`src/platform/web.js` 在没有 preload 时提供同一套 API，存档用 `src/platform/web-store.js`（localStorage）；原生能力经 `Capacitor.nativePromise` 调用（haptics、filesystem、share）。
- API：boot / saveProgress / setTheme / 截图回调 / exportRecord / pickRecord / saveBackup / loadBackup / clearBackup。

### 记录导出 / 导入 / 撤销

- 纯逻辑 `src/core/backup.js`：`buildExport`、`parseImport`（格式 / 版本 / 大小校验，再交给 `normalizeProgress` 清洗）、`applyImport`（先备份、失败自动恢复）、`undoImport`。
- 导出文件：`{app, kind, format, exportedAt, appVersion, progress}`，`progress` 即完整存档。
- Electron：`dialog.showSaveDialog / showOpenDialog`；撤销备份是 userData 下的 `progress.backup.json`。
- Android / Web：导出走 Filesystem（缓存目录）+ Share，导入用文件选择；撤销备份存在单独的 localStorage 键 `braille-memory.progress.backup`。
- 测试：`tests/backup.test.js`、`tests/web-backup.test.js`。

## Android 构建与签名

```
npm run android:sync       # 组装 www/ 并 cap sync（改了原生插件后必须运行）
npm run android:build      # 调试 APK → dist\盲文记忆-debug.apk
npm run android:release    # 正式签名 APK → dist\盲文记忆-<版本>.apk，并用 apksigner 验证
```

- 正式签名读 `android/keystore.properties`（模板 `keystore.properties.example`；该文件与 `private/` 下的密钥都已被 git 忽略，只在本机）。配置缺失时调试版照常构建，打正式版会报错。
- 版本号：`package.json` 的 `version` 与 `android/app/build.gradle` 的 `versionName` 必须一致（脚本检查），`versionCode` 每次发布递增（脚本不检查，需手动确认）。
- 验证结果写入 `dist\android-verify.txt`；验证失败或仍是调试证书则不复制到 dist。
