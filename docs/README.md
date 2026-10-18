# 盲文记忆（Windows 桌面版）

汉语现行盲文点位记忆练习。Electron 44，纯 HTML/CSS/JS（无打包器、无框架、无额外 npm 依赖）。
界面为 Material Design 3 风格；盲文点位只来自 `data/braille_table.csv`。

## 运行

在项目根 `D:\braille-memory`：

```
npx electron .          # 或 npm start
```

存档在 `%APPDATA%\盲文记忆\progress.json`（Electron 按 productName 生成的 userData 目录）。
调试时用临时目录，避免碰真实存档：

```
npx electron . --user-data=D:\tmp\bm-test
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
npx electron . --e2e=round-done --user-data=D:\tmp\bm-test   # 跑一遍流程并真实写存档后退出
node tools/contrast.js                  # 重新生成 docs/contrast.md
npx electron . --shot=learn-mirror --out=a.png --size=412x915 --font-scale=1.3 --style=glass   # 模拟安卓文字缩放 130%；截图时控制台输出 overflow 自检结果
```

截图模式自动使用临时数据目录且不写盘。页面预设名见 `src/app.js` 的 `SHOTS`。

## 文件结构

| 路径 | 内容 |
|---|---|
| `main.js` | 主进程：窗口（720×960，最小 480×640）、IPC、存档、截图 / 冒烟参数 |
| `preload.js` | `window.bm`：boot / saveProgress / setTheme / 截图回调（contextIsolation + sandbox） |
| `data/braille_table.csv` | 字表（id, symbol, dots, source, category）——唯一点位来源 |
| `data/config.json` | 每课符号数、选项数、计分、题量、自动下题、防误触、闯关阈值 |
| `src/core/` | backup（记录导出 / 导入校验 / 撤销）、csv（解析校验）、cell（布局/判分）、config、pick（随机/加权/选项）、timer、progress（计分/存档模型）、round（练习/复习/错题）、course（分课/评星/单课流程）、palette（M3 配色/对比度） |
| `src/main/store.js` | 原子写入 + 损坏备份 |
| `src/ui/` | dom（工具/图标）、theme（配色写入 CSS 变量）、widgets（M3 部件、盲文方） |
| `src/views/` | learn、practice、course、me（4 个标签页）；round、result、lesson、lesson-result（全屏页）；common |
| `src/app.js` | 路由、底部导航、键盘、存档、截图预设 |
| `src/styles.css` | M3 样式与动效 |
| `tests/` | node --test 测试 |
| `tools/` | shots.js、contrast.js |
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

页面只通过 `preload.js` 暴露的 `window.bm`（boot / saveProgress / setTheme / 截图回调）与平台交互；
存档读写只在主进程 `src/main/store.js`。以后做 Capacitor（Android）时只需替换这一层适配。
