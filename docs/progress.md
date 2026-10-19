# 进度

> 视觉方向变更（用户要求）：纯黑白「辣眼睛」→ **Material Design 3（Material You）**：
> 种子色色调板 + M3 角色变量、顶部应用栏 + 底部导航（学习/练习/闯关/设置）、胶囊按钮、筛选芯片、
> 分段按钮（阅读/镜像）、开关、tonal 容器。W0 黑白样张（docs/samples/）已作废，仅留作记录。

| 阶段 | 状态 | 说明 |
|---|---|---|
| W0 样张 | 完成（已被 M3 取代） | docs/samples/*.png |
| W1 核心逻辑 | 完成 | src/core/{csv,cell,config,pick,timer,progress,round,course,palette}.js、src/main/store.js |
| W2 页面 | 完成 | 8 个页面全部 M3（见下表） |
| W3 动效 | 完成 | 状态层、点位回弹、翻卡、共享轴 / 淡入穿透、勾号描边、漏点错开、导航指示器、开关、星点；减少动态 → 瞬时 |
| W4 验证 | 完成 | 52 个测试全过；138 张截图（23 页 × 浅/深 × 2 尺寸 + 陶土种子）已检查并修正；`--e2e` 冒烟验证存档写入/读入/损坏备份 |
| W5 文档 | 完成 | README.md、report.md、contrast.md、design.md（M3 版） |

## 页面

| 页面 | 文件 | 状态 |
|---|---|---|
| 学习（标签） | src/views/learn.js | 完成 |
| 练习（标签） | src/views/practice.js | 完成 |
| 闯关 / 课程图（标签） | src/views/course.js | 完成 |
| 设置 / 统计 + 设置项（标签） | src/views/me.js | 完成 |
| 答题（练习/复习/错题） | src/views/round.js | 完成 |
| 一轮结果 | src/views/result.js | 完成 |
| 单课（学→练→测） | src/views/lesson.js | 完成 |
| 课结果 | src/views/lesson-result.js | 完成 |

## 截图检查中修掉的问题

- 课结果过关后不显示「下一课」（判断改为看本次结果）。
- 结果页大片空白（内容垂直居中）。
- 选错选项双层边框（只留虚线框）。
- 单课学习卡被挤成窄条（卡片容器改为横向拉伸）。
- 单课学习阶段出现空计时框、结果占位挤压卡片（学习/复习卡时隐藏）。
- 陶土种子深色下「命中」与「多点」颜色接近（多点改为 error-container 实心 + 粗 error 外圈）。
- 480×640 下课程图进度条被压成 0 高、提示符号贴住盲文方。

## 图标与迷你预览点图（2026-10-17）

| 项 | 状态 | 说明 |
|---|---|---|
| 应用图标 | 完成 | tools/make-icon.js（Electron 离屏渲染）+ tools/icon-lib.js（SVG、超椭圆、自写 ICO）；点位取 CSV 第一行；build/icon.{svg,png,ico}；窗口图标 src/assets/icon.ico；16 px 小号版加大点距 |
| exe 图标 | 完成 | package.json win.icon + signExecutable:false；npm run pack 未产生新下载（Electron zip 来自本机缓存，未拉取 winCodeSign）；docs/shots/exe-icon.png |
| 迷你预览点图 | 完成 | widgets.miniCellEl / symbolChip；core cellLayout 共用布局；学习卡背面、选符号题、揭晓后的点点位题与单课练/测、结果芯片 |
| 测试 | 58 通过 | 新增 tests/icon.test.js（ICO、PNG 头、SVG 点数）与 cellLayout / 镜像测试 |
| 截图 | 完成 | learn-back、practice-choose、practice-wrong、practice-correct、lesson-study、lesson-test-reveal（浅/深 × 720×960/480×640），另 result、lesson-result、practice-wrong-mirror、learn-mirror 重拍；icon-preview.png、exe-learn-back.png |

截图中修掉：480×640 学习卡背面内容溢出卡片；选符号题迷你点图顶到进度条（改为放在大方格左侧）。

## Android（Capacitor 8.5.2）+ Material 3 Expressive（进行中）

| 步骤 | 状态 | 说明 |
|---|---|---|
| npm 安装 | 完成 | @capacitor/core、cli、android = 8.5.2（devDependencies，精确版本）；连带 52 个 cli 传递依赖 |
| 平台适配 | 完成 | src/platform/web-store.js（localStorage，先写 .tmp 再换、损坏存 .corrupt）、src/platform/web.js（无 Electron preload 时提供 window.bm）；BMTheme.setMode |
| www 组装 | 完成 | tools/build-www.js（src 不含 src/main + data 逐字节复制，校验 sha256） |
| 返回键 | 完成 | app.js 用 history API：离开根标签「学习」时保留一条历史，popstate = Esc |
| Android 工程 | 完成 | npx cap add android（模板默认：compile/target 36、min 24、AGP 8.13.0、Gradle 8.14.3）；capacitor.config.json（SystemBars insetsHandling=css、viewport-fit cover 提示） |
| 首次构建 | 进行中 | tools/android-build.js（只在子进程设 JAVA_HOME/ANDROID_HOME），日志 dist/android-build.log |
| 测试 | 65 通过 | 新增 web-store.test.js（假 localStorage）、build-www.test.js（字表逐字节） |

## Material 3 Expressive 视觉/动效升级（2026-10-18）

- 动效：CSS linear() 弹簧（fast 800/0.6 用于按压/选中/点位；default 380/0.8 用于页面/卡片；effects 1600/1.0 用于透明度/颜色），时长 200–480 ms；减少动态仍瞬时。
- 形状变形：按钮/图标按钮/芯片/分段按钮/卡片/导航指示器按下变圆角方，选中更圆；盲文点由 circle 改为 rect(rx)，按下 rx 47→30 再弹回，静止仍为正圆。
- 更大更粗：主按钮 72 px、普通 56 px；符号/关键数字/顶栏标题加大加粗；卡片更大圆角；答题页底部操作区为浮动工具栏。
- 截图：docs/shots/expressive/（412x915，浅/深，6 页）。测试 65 通过。
- 产物：dist\win-unpacked\盲文记忆.exe；dist\盲文记忆-debug.apk（versionCode 2 / 1.1）。无新增下载。

## 记录导出 / 导入 / 撤销 与 正式签名（2.1.0，2026-10-18）

| 项 | 状态 | 说明 |
|---|---|---|
| 导出 / 导入 / 撤销 | 完成 | 「设置 → 记录」；src/core/backup.js；导入先校验再确认，覆盖前自动备份、失败自动恢复；提示「导入 N 项，跳过 M 项」 |
| 平台层 | 完成 | Electron：保存 / 打开对话框 + IPC；安卓：@capacitor/filesystem 8.1.4 + @capacitor/share 8.0.3（精确版本）；页面只调用 window.bm |
| 测试 | 107 通过 | 新增 backup.test.js、web-backup.test.js |
| 正式签名 | 完成（本机打包） | android/app/build.gradle 读 android/keystore.properties；npm run android:release 打包并用 apksigner 验证；密钥与配置均在 git 忽略范围内，云端不生成、不接触 |
| 版本 | 2.1.0 | package.json version、build.gradle versionName 2.1.0，versionCode 14 |

## 导航滑动指示块与动画排查（2.2.0，2026-10-18）

| 项 | 状态 | 说明 |
|---|---|---|
| 底部导航 | 完成 | 选中底板是会滑动的指示块：点按从上一标签滑入，按住拖动吸附、松手才跳转；宽窗口里标签收拢在 560 px 内 |
| 分段按钮触屏拖动 | 已修 | 触屏隐式捕获导致拖动一开始就被取消；现在忽略冒泡上来的 lostpointercapture |
| 键盘切标签 | 已修 | 用 Enter / 空格切换后焦点留在当前导航项 |
| 课程卡符号预览 | 已改 | 最多两行显示（不缩小字号），超出才省略 |
| 排查 | 完成 | 无头浏览器：风格 × 浅深 × 1000 / 375 px，覆盖翻卡、切标签、答题反馈、设置项、课程页；未发现翻卡残影 / 闪空、版面跳动 |
| 未修 | 记录 | 切换 Material ↔ 玻璃时设置列表瞬间位移 8 px（整页换肤，无过渡） |
| 版本 | 2.2.0 | versionCode 15 |

## 扩展符号：数据层与引擎（阶段 0 / A1 / A2）

| 项 | 状态 | 说明 |
|---|---|---|
| 阶段 0 | 完成 | 已有星星的课永远解锁（主表增补 8 个声母后课程表中间插入 声母#3、声母#4，旧课不再被重新锁住） |
| A1 数据层 | 完成 | csv.js `parseExtra` / `loadExtra`（各方点位校验、id 与主表不冲突、缺失文件 = 功能隐藏）；Electron / Web 启动时载入；build-www 复制 braille_extra.csv |
| A2 引擎 | 完成 | seq.js（逐方判分；扎写时整串从右往左、各方内部左右列互换）、ext.js（歧义组、同类别选项）、ext-round.js（点位题 / 选点位 / 选符号）；存档 v2 `ext` 单独存放，v1 与旧导出文件兼容 |
| 界面 | 未做 | 阶段 A3；规则 / 词句（B、C）等 rules.json 引擎阶段 |

## 扩展符号界面（阶段 A3，2.3.0）

| 项 | 状态 | 说明 |
|---|---|---|
| 「基础 \| 扩展」 | 完成 | 学习页、练习页顶部的分段控件（复用带拖动的分段按钮，内容就地切换）；没有扩展表时整个不显示 |
| 扩展学习 | 完成 | 类别芯片（全部 + 标点 / 字母符号 / 数字 / 英语字母）、可翻的学习卡（正面符号 + 类别，背面各方大方格 + 第几方 + 点位 + 备注）；扎写视角整串从右往左、各方内部左右互换 |
| 扩展练习 | 完成 | 点位题（逐方输入，上一方 / 下一方 / 提交，揭晓时逐方标对错、可点小格看该方的漏点 / 多点）、看符号选点位、看点位选符号；复习 / 错题 / 结果页；写分只写 `progress.ext` |
| 顺带修复 | 完成 | 结果页答错的符号多时芯片会撑出卡片（`.weak-card` 里的芯片行改为在卡内换行，基础与扩展都受益） |
| 检查 | 完成 | 无头浏览器：风格 × 浅深 × 1000 / 375 px 共 8 种组合走完学习、练习、三种题型、复习 / 错题、结果页，无横向溢出、无控制台报错；无扩展表时入口隐藏且基础功能不变 |

## 规则数据与翻盲文引擎（阶段 B1 / B2，未做界面）

| 项 | 状态 | 说明 |
|---|---|---|
| B1 rules.js | 完成 | 载入并校验 rules.json（apply.type 与字段、forms 点位、例词结构、规则编号引用）；构建时一并复制 rules.json、pinyin_map.json；缺失时 `ctx.translator` 为 null、规则入口隐藏 |
| B2 pinyin.js | 完成 | 带调拼音 → 词 / 音节（声母、韵母、声调）；拼音知识全部来自 pinyin_map.json，汉字数用来选出唯一切分，歧义时返回「不支持」 |
| B2 translate.js | 完成 | 只执行带 apply 的规则：音节顺序、zhi…si 省韵母、y/w 还原、按声母省写声调及例外音节、逐音节规则、10.2.7 关闭省写、10.2.8 人工标记、按汉字简写与 11.2 例外、数、标点、词间空方；每一方带来源（表 / 规则编号） |
| 自检 | 完成 | rules.json 全部 forms 与引擎输出完全一致；全部例词（暂不支持的除外）均可翻译；省写 / 保留声调逐音节独立复核 |

## 规则 / 词句界面与进度（阶段 B3，2.4.0）

| 项 | 状态 | 说明 |
|---|---|---|
| 学习「规则」 | 完成 | 学习页分段控件加「规则」：类别芯片、规则卡（正面编号 / 类别 / 页码 / 例词迷你点位串；背面正文默认最多 3 行，可展开） |
| 练习「词句」 | 完成 | 练习页分段控件加「词句」：词句翻盲文（逐方输入，下一方 / 空方 / 删除 / 提交；揭晓逐方标对错，指出第一个出错的方与规则）、盲文读词（选汉字或拼音，选错时指出第几方不同与规则）、规则判断（声调写不写 / 简写不简写，按 apply 由引擎判定，数据撑不起的题型自动隐藏） |
| 进度 | 完成 | `progress.rules.items`（存档版本 3，读入 v1 / v2 与旧导出文件时原有记录逐字段保留）；接入复习 / 错题；导出导入一并包含 |
| 版面 | 完成 | 规则答题页题面与选项在揭晓前后位置不变，说明显示在下方，操作区贴底 |
| 检查 | 完成 | 无头浏览器：风格 × 浅深 × 1000 / 375 px 共 8 种组合走完规则卡、三种题型、复习 / 错题、结果页，无横向溢出、无控制台报错；缺少扩展表或 rules.json 时对应入口隐藏 |

## 界面折叠（P0）

| 项 | 状态 | 说明 |
|---|---|---|
| 「设置」分组 | 完成 | 外观、练习、数据、关于四组（AI 组随 AI 阶段加入），默认只展开「练习」；展开 / 折叠就地进行，状态记在本机（`braille-memory.ui`，不进存档、不导出）；折叠时内容不可聚焦（inert） |
| 错因说明 | 完成 | 揭晓时规则说明条默认折叠（只露编号 · 类别 · 页码），展开后是规则正文（默认 3 行，可再展开全文） |
| 测试 | 完成 | `tests/uistate.test.js`；无头浏览器检查折叠状态、控件节点不重建、重载后记住、清除确认流程、375 / 1000 px 无横向溢出 |

## 自定义文本练习（P1–P3，2.5.0）

| 项 | 状态 | 说明 |
|---|---|---|
| 数据 | 完成 | 文本库 `texts.json`（网页 / 安卓为 localStorage `braille-memory.texts`），只在本机；每句存 token（词：汉字 + 拼音，标点、数字、显式空方、不支持的原文）。盲文**不存**，每次由翻盲文引擎按 `data/` 规则算出 |
| 限额 | 完成 | .txt ≤ 200KB（严格 UTF-8）、每篇 ≤ 20000 字、≤ 50 篇、文本库 ≤ 1.5MB |
| 标注 | 完成 | 拼音库（pinyin-pro，懒加载）只给分词和带调拼音（本调、轻声不标）；界面一律标「自动标注，可能有误」。引擎不认的（拉丁字母、全角数字、符号、没有拼音的字、未收录标点）逐处标红并给原因，用户可「此处不练习」（仍可见）、补拼音、移除 |
| 详情 | 完成 | 逐句一行（原文 + 状态 + 标红原因）；「标注详情」默认折叠，展开后点词条：改拼音 / 拆开 / 并下一个 / 后加空方 / 此处不练习 / 补拼音 / 移除；改后立即重算该句状态 |
| 练习 | 完成 | 练习页分段加「文本」：范围芯片（全部 + 各篇）、练习 / 复习 / 错题、题量；整句翻盲文（复用词句答题页），开了「计时」显示本句用时；结果页含用时 / 均时 |
| 进度 | 完成 | `progress.texts.items`（存档版本 4），键 `t:<文本>#<句>`，签名含该句 token 与引擎算出的点位，文本或规则变了旧记录自动作废；删除文本一并删记录 |
| 导出 / 导入 | 完成 | 导出格式 2（可带 `texts`，仍接受格式 1）；导入文件无文本库时不动现有文本；导入前备份含文本库，撤销时按需还原 |

### 文本计时成绩（2.5.0 内补充，存档版本仍为 4）

| 项 | 说明 |
|---|---|
| 开关 | 沿用设置里的「计时」：开着才显示本句用时、记录用时与成绩；关着不记（正确率照常） |
| 每句 | `progress.texts.items[key]` 多 `lastMs`（最近一次）、`bestMs`（答对的最快）、`timed`（计时次数）；单句上限 30 分钟，防止空转 |
| 每轮 | 一轮结束时，每篇涉及的文本记一次成绩 `{at, n, ok, cells, ms}`（句数、答对数、方数、总用时），存 `progress.texts.runs[文本id]`，保留最近 10 次 |
| 指标 | 总用时、每方用时（总用时 / 方数）、每分钟方数（方数 / 分钟）、正确率（答对句数 / 作答句数）；「方」含空方 |
| 最好成绩 | 最佳速度 = 每分钟方数最高的一次，且正确率 ≥ 80%（太不准的不算）；另记最高正确率。破纪录时结果页标「新纪录」 |
| 显示 | 结果页（统计格 + 每篇一条折叠的「成绩」）、文本详情页顶部（折叠的「成绩」：最佳、最近几次的数字与迷你折线）、详情里每句的「最近 / 最快」 |
| 导出导入 | 在 `progress.texts` 里，随记录一起导出导入；导入后文本库里没有的文本，其成绩被清掉；删除文本一并删成绩 |

## 界面修改（2.5.1）

| 项 | 说明 |
|---|---|
| 规则标题 | 规则卡正面 / 背面标题行、错因说明条以 `rules.json` 的 `title` 为主标题，编号缩成旁边的小标签；没有 title 退回只显示编号；读屏名称带标题 |
| 「我的」→「设置」 | 底部导航与页面标题、读屏名称、文档里的叫法统一（「我的文本」不变） |
| 关于 | 显示「版本 2.5.1」（完整版本号） |
| 彩蛋 | 版本号 5 s 内点按 5 次，再按住约 1.5 s（或 Enter / Space）才显示联系方式；参数在 `core/about.js` 的 `SECRET`，复用 `createSecretSequence`；中途无任何提示 |
| 折叠动画 | （2.5.1 的 grid 版已被 2.5.2 取代，见下） |

## 折叠动画重做（2.5.2）

真机（OnePlus 13）上 2.5.1 的曲线前段过陡、收起时内容比高度先消失，改为 Web Animations API，所有折叠组件（`W.collapse`）共用：

| 项 | 展开 | 收起 |
|---|---|---|
| 高度 | 360 ms，`cubic-bezier(0.2,0,0,1)` | 260 ms，`cubic-bezier(0.3,0,0.2,1)` |
| 内容 | 与高度同时开始、同样时长：opacity 0→1，translateY −6px→0 | 整个 260 ms 同步：opacity 1→0，上移 4px |
| 箭头 | CSS 过渡，时长与曲线同上（展开 / 收起各用各的） | |

- 对 `height` 做「当前高度 ↔ 目标高度」的动画，动画期间容器 `overflow: clip`，结束回到 `height: auto`；下方内容随高度逐帧平滑移动。
- 连续点击：先读当前高度 / 透明度 / 位移再取消动画，从当前位置反向，时长按剩余距离缩短（不低于 120 ms），不闪跳。
- 减弱动效（或没有 Web Animations API）：瞬时完成。
- 无头浏览器逐帧记录：高度随时间与理想曲线最大偏差 ≤ 3 px，无突变；透明度、位移、箭头角度连续；连点反向处高度连续。

## 彩蛋真机修复（2.5.3）

OnePlus 13 上长按会触发 `pointercancel` / 系统长按手势，序列被清零。修复：

- 版本号按钮 `touch-action: none`、`user-select: none`、`-webkit-touch-callout: none`，阻止 `contextmenu` / `dragstart`；按下时 `setPointerCapture`。
- `pointercancel` 不再清零：只有手指相对按下点移动超过 10 px（或失焦）才取消；按住满时长由定时器（1.5 s + 10 ms）判定，所以系统取消后没有 `pointerup` 也能完成。到点仍未完成则整体清零。
- 两种手法都触发：(a) 点满 5 次后第 6 下按住 1.5 s；(b) 第 5 下直接按住 1.5 s 不松开（`core/about.js` 的 `poll` / `up` 支持；(b) 要求前 4 次点按到本次按下不超过 5 s）。
- 测试：`tests/about.test.js` 补充；CDP 触摸模拟（`Input.dispatchTouchEvent`）验证 a、b、长按期间 `pointercancel`（真实触发）、移动 6 px 仍完成、移动 30 px 取消、松手过早 / 点按不足 / 单击均不触发，按住过程中 DOM 无任何变化。

## 分词修复（2.5.4）

自动标注把每个汉字都当成独立的词、词间插空方：根因是误把 pinyin-pro 的 `segment()` 当分词器（它几乎一字一段）。现改为 `Intl.Segmenter` + 已知词表合并（见 `docs/pinyin-lib.md`），词内音节连写、词与词之间空方；「我们一起学习盲文。」→ 我们 / 一起 / 学习 / 盲文。测试：rules.json 的多音节例词（阅读、图书馆、中华人民共和国等）经标注后的分词与例词自身分写一致，格数与引擎直接翻译例词一致；上面那句的分词与拼音。已用旧版本添加的文本仍是逐字标注，需删除后重新添加（或在详情里「并下一个」）。

## 界面优化（2.6.0）

| 项 | 说明 |
|---|---|
| 启动画面 | `src/ui/splash.js`（DOM）+ `src/core/splash.js`（时间线 / 放行规则，有测试）。6 个点依次亮起 → 标题淡入 → 整屏淡出，名义总长 1.14 s（动画 920 ms + 淡出 220 ms）；淡出 = 动画播完与首页就绪中较晚者；点按 / Enter / 空格 / Esc / 返回键跳过；最多 3 s 强制；出错照常显示错误提示；减弱动效、截图 / e2e、非冷启动不播放。画面期间 `#app` inert + aria-hidden，画面本身 aria-hidden；消失后焦点回到页面。设置在数据加载之前同步取得（Electron `boot:early`，网页 `earlyBoot()`），配色即当前设置。 |
| 原生启动屏 | 安卓：`@capacitor/splash-screen`，`launchAutoHide:false`、淡出 0、纯色资源 `splash_color`（浅 / 深色取默认种子色的 surface，`values/colors.xml`、`values-night/colors.xml`）；网页启动画面绘制出来（两帧后）才 `hide()`。原生屏背景固定为默认种子色，设置里改了种子色时网页画面用设置的颜色。Electron：窗口 `backgroundColor` = 设置的 surface，`ready-to-show` 之后才 `show()`。 |
| 关于 | 简介（≤ 2 行）、版本号（彩蛋入口，逻辑不变）、项目地址（`core/about.js` 的 `validateOpenUrl` 白名单，Electron `open-external` IPC + `shell.openExternal`，安卓 `@capacitor/browser`）、小字。Electron 拦截 `will-navigate` / `will-frame-navigate` / `will-redirect`，`setWindowOpenHandler` 一律拒绝。失败时复制链接并提示。版本号与链接间距 20 px。 |
| 卡片翻面 | `makeFlip`（基础 / 扩展 / 规则三种卡共用）：点按（移动 ≤ 10 px、按下 ≤ 500 ms）翻面，role=button + aria-pressed，Enter / 空格；动画进行中忽略再次翻面；卡内按钮不触发翻面。 |
| 滑动选择 | `core/interact.js` 的 `createSlideSession`（状态机，有测试）+ `widgets.attachSlide`：分段按钮、底部导航、类别芯片共用。芯片行按住 150 ms 后才是选择（快速划动仍是滚动）；拖动中指示块跟手，松手才切换；pointercancel 恢复；上下拖远放弃；滚动 / 尺寸变化 / 旋转重新测量；拖动期间禁止滚动与选中文字；只处理 target 是容器本身的 `lostpointercapture`。 |
| 指示块 | 统一 `.slide-ind`：填满选项的胶囊（四周 4 px 内边距），`cubic-bezier(0.2,0,0,1)`，无回弹，宽高与位置同步；2.6.1 起：点按 / 松手归位 420 ms，拖动中吸附到手指所在项 260 ms（`.dragging` 下），快速划过多项从当前位置继续；减弱动效瞬时。芯片行用 `chipRow()` 构建（芯片选中后背景透明，由指示块着色）。 |

## 2.6.1 修复

- 拖动选择：不再「直接跟手无过渡」，改为吸附到所在项并带 260 ms 过渡（`--t-slide-drag`），归位 / 点按 420 ms（`--t-slide`）；轻震时机不变。
- 展开折叠组时内容左缩：根因是 `.page-body` 的竖向滚动条（8 px）随页面变高 / 变矮出现 / 消失。`scrollbar-gutter: stable both-edges` 预留位置（不支持的内核用 `overflow-y: scroll` 兜底）。无头浏览器（保留经典滚动条）逐帧记录展开、收起时折叠组左 / 右边缘与内容宽度：修复前右边缘随滚动条跳 8 px，修复后全程 0 px 变化（375 / 480 / 720 宽、两种风格、浅 / 深色）。折叠动画本身（时长、曲线）未改。
