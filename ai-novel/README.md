# AI 小说流水线（ai-novel）

中文名：**AI 小说流水线** · 目录 slug：`ai-novel`（链接友好）

两步流水线：**抓榜出 JSON** → **Agent 按提示词批量下前 N 章**。

| 文件 | 说明 |
|------|------|
| `novelcatch-rank-scraper.user.js` | 油猴：榜单页一键导出 JSON |
| `sonovel-batch-prompt.md` | 给 Agent 的批量下载执行规格 |
| `samples-20260731-history-top10-ch10/` | 成品样例：历史脑洞 TOP10 × 前 10 章 |

---

## 一、抓榜（油猴脚本）

**文件：** `novelcatch-rank-scraper.user.js`

### 安装

1. 浏览器安装 [Tampermonkey](https://www.tampermonkey.net/)（或兼容扩展）
2. 新建脚本，粘贴本文件全部内容并保存
3. 脚本仅在 `novelcatch.com/rank*` 生效

### 使用

1. 打开目标榜单页，例如：
   - 男频阅读榜 / 新书榜
   - 女频阅读榜 / 新书榜
   - 巅峰榜
   - 并选好分类（历史古代、玄幻等）
2. 页面右下角出现红色 **「下载 JSON」** 按钮
3. 点一下 → 自动滚底加载 → 下载 JSON

### 输出

- 文件名：`YYYYMMDD-榜单名-分类.json`  
  例：`20260803-男频阅读榜-历史古代.json`
- 核心字段：每本书的 `rank`、`title`、`author`、`bookId`、`url` 等
- **下一步下载只用 `bookId`（番茄书 ID）**，不要把 novelcatch 链接交给 SoNovel


---

## 二、批量下载（SoNovel + Agent）

**文件：** `sonovel-batch-prompt.md`  
把该文件整段交给执行型 Agent（Claude / Codex 等），并填好文首四个变量。

### 四个变量（必填）

```text
INPUT_JSON="油猴下载的 JSON 本地绝对路径"
OUTPUT_DIR="下载结果存放目录（绝对路径）"
CHAPTER_LIMIT=5          # 每本只下前 N 个「第X章」编号章节
BOOK_LIMIT=""            # 只处理榜单前几本；留空=全部
```

### Agent 会自动做的事

| 步骤 | 内容 |
|------|------|
| 1 | 校验 JSON / SoNovel 安装 |
| 2 | 在 `OUTPUT_DIR` 写项目级配置与番茄书源 `rules/fanqie.json` |
| 3 | 用 `https://fanqienovel.com/page/{bookId}` 按本顺序下载 |
| 4 | 先冒烟测第一本，通过后再批量 |
| 5 | 校验 UTF-8、章节数、字体混淆、错误日志 |
| 6 | 写出 `download-manifest.json` 与 `logs/` |

### 成功长什么样

```text
OUTPUT_DIR/
  001-书名(BookID).txt
  002-书名(BookID).txt
  ...
  download-manifest.json
  logs/
  .sonovel-config.ini
  rules/fanqie.json
```

- 每本成功 TXT ≈ 正好 `CHAPTER_LIMIT` 个编号章（序章/楔子不计入）
- 不自动 git commit / push

### 本机前置

- 已安装 **SoNovel**（或 Agent 可从官方 Release 安装）
- `OUTPUT_DIR` 可写、磁盘空间足够
- 网络能访问番茄小说官网

---

## 三、示例成果目录（对照用）

目录：`samples-20260731-history-top10-ch10/`（历史脑洞 TOP10 · 前 10 章）

这是一次完整流水线跑完后的**成品样例**，命名约定：

| 片段 | 含义 |
|------|------|
| `20260731` | 抓取 / 下载日期 |
| `history` | 榜单题材（历史脑洞） |
| `top10` | `BOOK_LIMIT=10`，只下榜单前 10 本 |
| `ch10` | `CHAPTER_LIMIT=10`，每本只保留前 10 个编号章 |

### 目录里有什么

```text
samples-20260731-history-top10-ch10/
  全民县令：我看广告无限刷资源(极品花生酱).txt
  大唐：我有一间诸天杂货铺(夜的旋律).txt
  大明死囚教嘉靖修仙怎练成体修？(喜欢猫的校长).txt
  大明：开局筋斗云，老朱馋哭了！(大总管9527).txt
  天幕直播语文课，古人破防了(vwvwvw).txt
  天幕直播：长乐公主被我吓哭了(行云流).txt
  天幕：开局播放口水三国(叫我大良造).txt
  废物皇子，天幕曝光我是千古一帝(何太苦).txt
  我是太子李承乾？禅让！提桶跑路(慢胖菠萝头).txt
  秦始皇：朕有华夏全明星阵容(雪岭云杉).txt
```

- 共 **10 本** TXT，对应榜单 TOP10
- 每本正文含 **第1章 … 第10章**（与 `CHAPTER_LIMIT=10` 一致）
- 文件名形态：`书名(作者).txt`（早期跑批的 SoNovel 默认命名）

### 和「规范成功目录」的差异

按当前 `sonovel-batch-prompt.md`，新任务更推荐：

```text
OUTPUT_DIR/
  001-书名(BookID).txt
  002-书名(BookID).txt
  download-manifest.json
  logs/
  .sonovel-config.ini
  rules/fanqie.json
```

本示例目录**只保留了最终 TXT**，未入库 manifest / 日志 / 配置；读正文、对题材样本时直接打开即可。  
另有小样目录 `20260731-历史古代前5章/`（3 本、前 5 章、带 `01-` 序号前缀），用途相同，体量更小。

### 新建任务时怎么命名 OUTPUT_DIR

推荐英文 slug（链接、路径都干净）：

```text
YYYYMMDD-<topic>-top{N}-ch{M}
# 例：20260803-history-top10-ch5
```

对应变量：`BOOK_LIMIT=N`，`CHAPTER_LIMIT=M`。中文题材名可写在 README / 笔记里，不必塞进路径。

---

## 四、推荐最短路径

```text
1. 油猴打开 novelcatch 榜单 → 点「下载 JSON」
2. 把 JSON 放到本机（例如桌面或项目目录）
3. 复制 sonovel-batch-prompt.md 全文给 Agent
4. 改四个变量，例如（对照 history top10 ch10 样例）：

   INPUT_JSON="/Users/你/Downloads/20260731-m-read-history.json"
   OUTPUT_DIR=".../ai-novel/20260803-history-top10-ch10"
   CHAPTER_LIMIT=10
   BOOK_LIMIT=10

5. 让 Agent 跑到结束，核对 manifest 里 success / failed / skipped
6. 成品形态可与 samples-20260731-history-top10-ch10/ 对照
```

---

## 五、常见问题

| 现象 | 处理 |
|------|------|
| 没有「下载 JSON」按钮 | 确认在 `/rank` 页、脚本已启用 |
| 抓到 0 本 | 等页面加载完再点；换分类/刷新后再试 |
| SoNovel 找不到 | 按提示词让 Agent 查 `so-novel` / `app.jar`，勿换其他下载器 |
| 章节数不够 / 乱码 | 看 `logs/*`；字体映射失败或目录解析变了需修 `fanqie.json` |
| 想重跑 | 把坏结果挪走或让 Agent 进 `_incomplete-backup/`，勿直接覆盖有效 TXT |

---

## 六、文件一览

| 文件 / 目录 | 作用 |
|-------------|------|
| `novelcatch-rank-scraper.user.js` | 榜单页一键导出 JSON |
| `sonovel-batch-prompt.md` | 给 Agent 的完整执行规格（勿当人类长教程读） |
| `samples-20260731-history-top10-ch10/` | 成品样例：历史脑洞 TOP10 × 前 10 章 TXT |
| `README.md` | 人读的最短操作路径 |
