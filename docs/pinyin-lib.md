# 拼音库（pinyin-pro）

- 用途：只给「分词 + 带调拼音」，**从不给点位**。盲文一律由 `translate.js` 按 `data/` 里的规则与字表计算。
- 版本：`pinyin-pro@3.29.5`（精确版本，MIT）。UMD 文件复制到 `src/vendor/pinyin-pro.js`，许可见 `src/vendor/pinyin-pro.LICENSE`，版本与 sha256 记录在 `src/vendor/VENDOR.json`。
- 更新：`npm run vendor`（从 node_modules 复制并重写记录）；`node tools/vendor.js --check` 校验；`npm test` 也会校验 sha256。
- 加载：第一次需要自动标注时才加载（`src/platform/pinyin-lib.js`），约 320KB；加载失败则只能手动输入拼音。
- 适配（`src/core/pinyin-provider.js`）：分词用 `segment`，拼音整段一次取出（多音字按上下文），关闭变调（`toneSandhi:false`）以得本调；轻声不标调；输出异常即报错，不猜。
- 准确度（对 `rules.json` 例词，133 个汉字词，124 个与规则例词一致）：不一致主要是轻声（看看 / 对不起 / 牡丹）、多音与生僻（呃 / 哦 / 嚄 / 啊）、叠词变调（弯弯曲曲 / 一刀切）。所以界面一律标注「自动标注，可能有误」，需要用户核对、可逐词改。
