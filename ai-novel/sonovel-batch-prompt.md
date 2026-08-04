# SoNovel 小说批量下载执行提示词

你是执行型 Agent。不要只提供教程或命令，请直接完成环境校验、SoNovel 安装检查、番茄书源生成、冒烟测试、顺序批量下载、排错和最终验证。持续执行直到达到成功标准，或遇到无法自行解决的明确外部阻塞。

整个任务只有以下四个用户变量。注释位于每个变量赋值的同行末尾，执行时不要把 `#` 后的注释当作变量值：

```text
INPUT_JSON="输入通过油猴脚本下载的 json 文件的本地存放路径"
OUTPUT_DIR="输入你要存放的下载的本地路径"
CHAPTER_LIMIT=5 # 每本书下载的编号章节数；必须是正整数
BOOK_LIMIT="" # 只处理 .items 按原顺序排列的前几本；留空表示处理全部，填写时必须是正整数
```

不要要求用户再提供项目目录、SoNovel 路径、书源路径、书籍数量或 Book ID。除上述四个变量外，其余路径和参数由 Agent 自动发现或生成。

## 一、任务目标与范围

1. 严格读取 `INPUT_JSON` 中 `.items` 数组的全部记录。
2. 使用 `.bookId` 生成番茄官网详情页：

   `https://fanqienovel.com/page/{bookId}`

3. 计算本次处理范围：
   - `BOOK_LIMIT` 留空：处理 `.items` 全部记录；
   - `BOOK_LIMIT=N`：处理 `.items[0:N]`；
   - `N` 大于数组长度：处理全部记录并在 manifest 记录该情况；
   - `N` 为 0、负数、非整数或非数字：停止并报告变量错误；
   - 范围外记录仍保留在 manifest 中，状态设为 `skipped`，并写明 `skipReason`；
   - 先按数组位置截取前 N 条，再在所选范围内按 `bookId` 去重。
4. 使用 SoNovel 下载范围内每个唯一 Book ID 的前 `CHAPTER_LIMIT` 个编号章节。
5. 将 TXT、项目配置、番茄书源、日志、备份和清单保存到 `OUTPUT_DIR`。
6. 逐本校验章节数、顺序、UTF-8、字体混淆、HTML、二进制残留和错误日志。
7. 不自动 git commit，不自动 push。

### “前 CHAPTER_LIMIT 章”的定义

- 按番茄官网目录 DOM 顺序提取；
- 标题需要匹配 `第\s*\d+\s*章`，即兼容“第1章”“第1 章”“第 1章”；
- 比较章节标题时可规范化“第、数字、章”附近的空白，但不能改变标题正文；
- 全书统一取前 `CHAPTER_LIMIT` 条，不是每卷分别取；
- 第一卷不足时继续从后续分卷提取；
- 详情页顶部“最近更新”不能计入；
- “序章”“楔子”等非编号章节不计入当前规则；
- 截断必须发生在过滤出全书所有编号章节之后。

### 成功标准

- 顶层成功 TXT 数量等于 manifest 中 `success` 数量；
- 每个成功 TXT 正好包含 `CHAPTER_LIMIT` 个编号章节；
- 成功 TXT 的标题及顺序与官网目录前 `CHAPTER_LIMIT` 条一致；
- 每个 TXT 可严格解码为 UTF-8；
- 不含 U+E000–U+F8FF 私用区字符、U+FFFD、NUL、异常控制字符、图片文件头或 HTML；
- 每个成功项都有独立 CLI 日志和章节下载日志；
- 成功项日志中不存在真实 `[ERROR]` 记录、异常堆栈或 JavaScript 编译异常；
- SoNovel 的普通提示行“请检查是否有 `[ERROR]` 级别的日志”只是提示，不算错误记录；
- 真实错误至少包括以 `[ERROR]` 开头的日志行、`Exception:`、`SyntaxError:`、Javet 编译异常和正文为空；
- 不把只有书名、作者、简介的空壳 TXT 计为成功；
- manifest 条目数始终等于原始 `.items | length`；
- 范围外、重复项使用 `skipped`，不能遗留 `pending` 或 `downloading`；
- 生成 `download-manifest.json`；
- 不能只相信 SoNovel 的退出码、“完成”提示或进度条。SoNovel 某些解析异常仍可能返回退出码 0。

## 二、读取项目约束

1. 将 `INPUT_JSON` 和 `OUTPUT_DIR` 规范化为绝对路径。
2. 从 `OUTPUT_DIR` 开始逐级向上查找适用的 `AGENTS.md`。
3. 找到后完整读取并遵守。
4. 不修改与本任务无关的文件。
5. 不覆盖用户已有的有效结果。
6. 已存在但未通过当前校验的文件移入：

   `OUTPUT_DIR/_incomplete-backup/`

7. 不直接删除既有文件；重试失败产物和旧日志也应可恢复地归档。
8. 不打印 Secret、Cookie、令牌或敏感环境变量。
9. 下载工作目录必须是 `OUTPUT_DIR`，不能从 SoNovel 安装目录运行下载。

## 三、校验四个变量和输入 JSON

1. 检查 `INPUT_JSON` 存在、可读且是普通文件。
2. 严格解析 JSON，禁止容忍尾随垃圾。
3. 检查 `.items` 是数组。
4. 每项至少包含：
   - `.rank`
   - `.title`
   - `.bookId`
5. `.author` 和 `.url` 可以为空。
6. `bookId` 必须作为字符串处理，禁止转成浮点数或 JavaScript `Number`。
7. `bookId` 必须只包含 ASCII 数字：`^[0-9]+$`。
8. 校验 `CHAPTER_LIMIT` 为正整数。
9. 按前述规则校验并解析 `BOOK_LIMIT`。
10. 输出：
    - `.items | length`
    - `.count`
    - 实际处理范围数量
    - 前三项的 rank、title、author、bookId
11. `.count` 与 `.items | length` 不同时，以数组长度为准并记录差异。
12. bookId 重复时：
    - 所选范围内同一个 bookId 只下载一次；
    - manifest 保留每条原始排名记录；
    - 首次出现项正常处理，后续重复项设为 `skipped`；
    - `skipReason` 指向首次处理的排名；
    - 最终报告列出重复项。
13. 不要把 JSON 中 novelcatch 或其他第三方 URL 交给 SoNovel。

## 四、完整检查 SoNovel 安装

不要假设 `sonovel` 命令一定可用。

### A. 环境记录

记录但不泄露敏感信息：

- 操作系统；
- CPU 架构；
- 当前 Shell；
- `OUTPUT_DIR` 是否可写；
- `OUTPUT_DIR` 所在磁盘可用空间。

### B. 查找命令

依次检查：

- `sonovel`
- `so-novel`
- `so-novel-cli`

macOS/Linux 使用 `command -v`、`type -a`、`which`。Windows 使用 `where.exe` 和 PowerShell `Get-Command`。

### C. 校验命令真实性

对每个候选命令检查：

1. 是否是符号链接；
2. 符号链接最终目标是否存在；
3. 是否有执行权限；
4. 是否确实属于 SoNovel；
5. 依次尝试 `--version`、`-v`、`--help`、`-h`；
6. 至少能输出版本或帮助才算可用；
7. 从本机帮助确认 URL、输出格式等 CLI 参数，不凭记忆猜测。

注意：链接目标存在不代表命令可用。部分 macOS 启动脚本会执行：

```bash
cd "$(dirname "$0")"
```

当脚本经 `~/.local/bin/so-novel` 符号链接调用时，`$0` 可能仍是链接路径，导致脚本错误地到 `~/.local/bin/runtime` 查找 Java。必须实际执行命令验证，不能只检查链接目标。

### D. 处理启动脚本故障

命令存在但不能启动时：

1. 完整读取启动脚本。
2. 检查是否错误地按符号链接目录寻找程序文件。
3. 在合理范围查找：
   - `app.jar`
   - `sonovel*.jar`
   - 内置 Java Runtime
   - `config.ini`
   - `rules/`
4. macOS 优先范围：
   - `/Applications`
   - `$HOME/Applications`
   - `$HOME/.local/bin`
   - `$HOME/.local/share`
5. Linux 优先范围：
   - `$HOME/.local/bin`
   - `$HOME/.local/share`
   - `/opt`
   - `/usr/local/bin`
6. Windows 优先范围：
   - `%LOCALAPPDATA%`
   - `%APPDATA%`
   - `%ProgramFiles%`
   - `%USERPROFILE%`
7. 不对整个磁盘进行无边界搜索。

找到 `app.jar` 后：

1. 优先使用 SoNovel 自带 Java；
2. 否则验证系统 Java 与 JAR 的版本兼容性；
3. Java 属性必须放在 `-jar` 之前；
4. 从 `OUTPUT_DIR` 运行类似以下调用：

```text
ABSOLUTE_JAVA
  -XX:+UseZGC
  -XX:+ZGenerational
  -Dconfig.file=.sonovel-config.ini
  -Dmode=cli
  -jar ABSOLUTE_APP_JAR
  --help
```

5. 帮助或版本验证通过后，将其作为 Agent 内部 `SONOVEL_COMMAND`；
6. `SONOVEL_COMMAND` 不要求用户配置；
7. 下载时继续保持工作目录为 `OUTPUT_DIR`。

### E. 安装完整性

以下全部满足才算通过：

- 找到真实程序；
- 程序能输出帮助或版本；
- 确认是 SoNovel；
- 自定义 `-Dconfig.file` 能正常启动；
- 能读取工作目录下的项目级 `rules/`；
- `OUTPUT_DIR` 可写；
- 最终启动方式不是失效调用。

### F. 确实未安装时

只有命令、安装包和 `app.jar` 都找不到时才判断未安装。

如果未安装或损坏：

1. 只从 SoNovel 官方项目或官方 GitHub Release 安装；
2. 根据系统和 CPU 架构选择版本；
3. 不从网盘或第三方二进制站下载；
4. 需要管理员权限时先申请用户批准；
5. 安装后重新执行完整校验；
6. 不静默换用其他小说下载器；
7. 因权限、网络或官方资源不可用而失败时，报告具体阻塞点。

## 五、建立本次运行目录与配置

建立：

```text
OUTPUT_DIR/
  .sonovel-config.ini
  rules/
    fanqie.json
  logs/
  _incomplete-backup/
  download-manifest.json
  001-JSON书名(BookID).txt
  002-JSON书名(BookID).txt
  ...
```

要求：

1. SoNovel 工作目录必须是 `OUTPUT_DIR`。
2. 不修改 SoNovel 全局 `config.ini` 或全局 `rules/`。
3. 不修改历史任务中的 `fanqie.json`。
4. 下载格式为 TXT。
5. TXT 必须为 UTF-8。
6. `preserve-chapter-cache = 0`。
7. 不保留封面和章节缓存。
8. 单本章节并发为 2。
9. 一本完成后再处理下一本，不同时下载多本。

生成 `OUTPUT_DIR/.sonovel-config.ini`：

```ini
[global]
auto-update = 0
gh-proxy =
cf-bypass =

[download]
download-path = __OUTPUT_DIR_ABSOLUTE__
extname = txt
txt-encoding =
preserve-chapter-cache = 0
enable-progressbar = 1

[source]
language =
active-rules = fanqie.json
source-id =
search-limit = 30
search-filter = 1

[crawl]
concurrency = 2
min-interval = 300
max-interval = 800
enable-retry = 1
max-retries = 3
retry-min-interval = 2000
retry-max-interval = 4000

[web]
enabled = 0
port = 7765

[cookie]
qidian =

[proxy]
enabled = 0
host = 127.0.0.1
port = your port
```

将 `__OUTPUT_DIR_ABSOLUTE__` 替换为规范化后的绝对路径。生成后重新读取配置，确认：

- `download-path` 精确等于 `OUTPUT_DIR`；
- `active-rules = fanqie.json`；
- `preserve-chapter-cache = 0`；
- `concurrency = 2`。

## 六、生成番茄项目级书源

不要等待用户提供 `fanqie.json`，也不要依赖 SoNovel 全局书源。

将下方模板写入：

`OUTPUT_DIR/rules/fanqie.json`

写入前，将所有字面量 `__CHAPTER_LIMIT__` 替换为 `CHAPTER_LIMIT` 的十进制整数。

这份规则相对旧模板的兼容修复：

- 使用标准 JavaScript 正则 `/g`，不要使用 SoNovel 1.11.0 无法识别的 `@command:g`；
- 标题使用 `第\s*\d+\s*章`，兼容官网章节号周围的空格；
- 先扫描所有 `chapter-item-title` 锚点，再单独提取 href，不依赖 href 和 class 的属性顺序；
- 排除文本不以编号章节开头的“最近更新”锚点；
- 全书过滤完成后统一 `.slice(0,CHAPTER_LIMIT)`；
- 相对章节 URL 转为绝对 URL。

```json
[
  {
    "url": "https://fanqienovel.com/",
    "name": "番茄小说官网（前__CHAPTER_LIMIT__章）",
    "comment": "按 Book ID 直连详情页，仅解析全书 DOM 顺序中的前 __CHAPTER_LIMIT__ 个编号章节，并还原网页端字体混淆。",
    "search": {
      "disabled": true
    },
    "book": {
      "url": "https://fanqienovel.com/page/(\\d+)",
      "bookName": ".info-name > h1",
      "author": ".author-name-text",
      "intro": ".page-abstract-content",
      "coverUrl": ".book-cover-img@src",
      "latestChapter": ".info-last-title"
    },
    "toc": {
      "baseUri": "https://fanqienovel.com",
      "list": "/html@js:const a=[...r.matchAll(/<a\\b([^>]*)>([\\s\\S]*?)<\\/a>/g)].map(m=>{const h=m[1].match(/\\bhref=\"(\\/reader\\/\\d+)\"/),c=/\\bclass=\"[^\"]*\\bchapter-item-title\\b[^\"]*\"/.test(m[1]),t=m[2].replace(/<!--[\\s\\S]*?-->/g,'').replace(/<[^>]*>/g,'').trim();return h&&c&&/^第\\s*\\d+\\s*章/.test(t)?[h[1],m[2]]:null}).filter(Boolean).slice(0,__CHAPTER_LIMIT__).map(m=>'<a href=\"https://fanqienovel.com'+m[0]+'\" class=\"chapter-item-title\">'+m[1]+'</a>');r='<html><body>'+a.join('')+'</body></html>';",
      "item": "body > a.chapter-item-title",
      "isDesc": false
    },
    "chapter": {
      "title": ".muye-reader-title",
      "content": ".muye-reader-content > div@js:const s=58344,a=['D','在','主','特','家','军','然','表','场','4','要','只','v','和','?','6','别','还','g','现','儿','岁','?','?','此','象','月','3','出','战','工','相','o','男','直','失','世','F','都','平','文','什','V','O','将','真','T','那','当','?','会','立','些','u','是','十','张','学','气','大','爱','两','命','全','后','东','性','通','被','1','它','乐','接','而','感','车','山','公','了','常','以','何','可','话','先','p','i','叫','轻','M','士','w','着','变','尔','快','l','个','说','少','色','里','安','花','远','7','难','师','放','t','报','认','面','道','S','?','克','地','度','I','好','机','U','民','写','把','万','同','水','新','没','书','电','吃','像','斯','5','为','y','白','几','日','教','看','但','第','加','候','作','上','拉','住','有','法','r','事','应','位','利','你','声','身','国','问','马','女','他','Y','比','父','x','A','H','N','s','X','边','美','对','所','金','活','回','意','到','z','从','j','知','又','内','因','点','Q','三','定','8','R','b','正','或','夫','向','德','听','更','?','得','告','并','本','q','过','记','L','让','打','f','人','就','者','去','原','满','体','做','经','K','走','如','孩','c','G','给','使','物','?','最','笑','部','?','员','等','受','k','行','一','条','果','动','光','门','头','见','往','自','解','成','处','天','能','于','名','其','发','总','母','的','死','手','入','路','进','心','来','h','时','力','多','开','已','许','d','至','由','很','界','n','小','与','Z','想','代','么','分','生','口','再','妈','望','次','西','风','种','带','J','?','实','情','才','这','?','E','我','神','格','长','觉','间','年','眼','无','不','亲','关','结','0','友','信','下','却','重','己','老','2','音','字','m','呢','明','之','前','高','P','B','目','太','e','9','起','稜','她','也','W','用','方','子','英','每','理','便','四','数','期','中','C','外','样','a','海','们','任'];r=[...r].map(c=>{const i=c.charCodeAt(0)-s;return i>=0&&i<a.length&&a[i]!=='?'?a[i]:c}).join('');",
      "paragraphTagClosed": true,
      "filterTxt": "",
      "filterTag": ""
    },
    "crawl": {
      "concurrency": 2,
      "minInterval": 300,
      "maxInterval": 800,
      "maxAttempts": 3,
      "retryMinInterval": 2000,
      "retryMaxInterval": 4000
    }
  }
]
```

规则生成后必须：

1. 使用 JSON 解析器验证合法性，如 `jq empty`；
2. 确认不存在 `__CHAPTER_LIMIT__`；
3. 确认存在 `.slice(0,实际数字)`；
4. 确认使用 `/g` 而不是 `@command:g`；
5. 确认标题模式包含可选空白；
6. 确认 `active-rules` 为 `fanqie.json`；
7. 不缩短字体映射数组；
8. 不把数组中的 `?` 替换为猜测字符；
9. 通过冒烟测试和私用区扫描验证静态映射仍适用。

## 七、创建和维护 manifest

在下载前立即创建：

`OUTPUT_DIR/download-manifest.json`

manifest 条目数等于原始 `.items | length`，不只包含本次范围。

每项至少记录：

```json
{
  "rank": 1,
  "bookId": "7414011485757639704",
  "jsonTitle": "冒姓琅琊",
  "jsonAuthor": "已拆解",
  "officialTitle": null,
  "officialAuthor": null,
  "detailUrl": "https://fanqienovel.com/page/7414011485757639704",
  "requestedChapters": 5,
  "downloadedChapters": 0,
  "expectedChapterTitles": [],
  "expectedChapterUrls": [],
  "chapterTitles": [],
  "outputFile": null,
  "fileSize": 0,
  "logFile": null,
  "chapterLogFile": null,
  "status": "pending",
  "error": null,
  "skipReason": null
}
```

status 只能使用：

- `pending`
- `downloading`
- `success`
- `failed`
- `skipped`

要求：

1. 范围外项在开始下载前设为 `skipped`；
2. 重复 bookId 的后续项设为 `skipped`；
3. 处理一本前原子更新为 `downloading`；
4. 每本完成或失败后立即原子更新；
5. 不等全部下载结束才生成 manifest；
6. 程序中断后必须把残留 `downloading` 恢复为 `failed` 或按明确原因设为 `skipped`；
7. bookId 始终保持字符串。

## 八、先获取官网元数据和预期目录

每本下载前：

1. 请求 `detailUrl`。
2. 提取官网当前书名和作者。
3. 按详情页 DOM 顺序收集所有 `chapter-item-title` 锚点。
4. 只保留标题匹配 `^第\s*\d+\s*章` 的条目。
5. 排除“最近更新”。
6. 将相对 `/reader/{id}` 转为绝对 URL。
7. 全局截取前 `CHAPTER_LIMIT` 条。
8. 将标题和 URL 写入 manifest 的 `expectedChapterTitles`、`expectedChapterUrls`。
9. 如果官网提取不足 `CHAPTER_LIMIT` 条，不能继续把不完整结果计为成功；记录具体原因。

## 九、单本冒烟测试

不要直接批量跑所选范围。

先处理所选范围内第一个非重复项：

1. manifest 状态设为 `downloading`。
2. 从 `OUTPUT_DIR` 启动 `SONOVEL_COMMAND`。
3. 显式使用 `.sonovel-config.ini`。
4. 确认项目级 `rules/fanqie.json` 被读取。
5. 使用本机帮助确认的 URL 和 TXT 参数。
6. 将完整 CLI 输出保存为唯一日志：

   `logs/排名-BookID.log`

7. SoNovel 自己生成的章节日志应立即移动或复制为：

   `logs/排名-BookID-chapters.log`

8. 不允许多个书籍共用同一个按书名和日期生成的日志文件。
9. 不只检查退出码；即使退出码为 0，也要扫描：
   - `JavetCompilationException`
   - `SyntaxError`
   - `Exception:`
   - 真实 `[ERROR]` 行
10. 日志必须报告 `共计 CHAPTER_LIMIT 章`。
11. 检查实际 TXT。

冒烟测试必须满足：

- TXT 存在且大小合理；
- 严格 UTF-8；
- 正好 `CHAPTER_LIMIT` 个编号章节标题；
- 实际章节标题与预先提取的官网目录逐条一致；
- 第一章是目录第一条；
- 最后一章是目录第 `CHAPTER_LIMIT` 条；
- 章节日志没有真实 `[ERROR]`；
- 无 U+E000–U+F8FF；
- 无 U+FFFD；
- 无 NUL 和异常控制字符；
- 无 PNG/JPEG/GIF 等图片文件头；
- 无 `<p>`、`</p>`、`<html>`、`<div>` 等 HTML；
- 正文不是只包含元数据的空壳；
- 抽查正文没有明显乱码。

冒烟失败时：

1. 先保存失败日志；
2. 把不完整 TXT 移入 `_incomplete-backup/`；
3. 检查 `共计` 章节数；
4. 若出现 Javet 正则编译异常，检查是否误用了 `@command:g`；
5. 若章节数少于要求，检查标题是否包含“第1 章”“第 1章”等空格；
6. 检查锚点属性顺序是否改变；
7. 检查章节 URL 是否为空及是否已转绝对 URL；
8. 检查是否从 `OUTPUT_DIR` 启动；
9. 检查实际加载的是否是本次 `fanqie.json`；
10. 检查原始章节页是否仍含私用区字体，以及映射后 TXT 是否清零；
11. 有限修复并重新测试第一本；
12. 冒烟通过前不能开始后续下载。

## 十、顺序批量下载

冒烟通过后：

1. 按 `.items` 原顺序处理选定范围；
2. 已成功的冒烟项不重复下载；
3. 一本完成后再处理下一本；
4. 不并行下载多本；
5. 每本详情页固定为：

   `https://fanqienovel.com/page/{bookId}`

6. 下载前设为 `downloading`；
7. 下载后立即执行全部单本校验；
8. 通过后设为 `success`；
9. 失败后：
   - 保存独立日志；
   - 不完整 TXT 移入 `_incomplete-backup/`；
   - 状态设为 `failed`；
   - 写入具体 error；
   - 继续下一本；
10. 不无限重试；
11. 不把空壳或少章 TXT 计为成功；
12. 捕获中断信号；中断后不得遗留 `downloading`。

## 十一、文件名、书名与作者变化

1. bookId 是主要身份标识。
2. 同时记录 JSON 与官网当前的书名和作者。
3. 不因书名不同更换 Book ID。
4. SoNovel 可能先生成“官网书名(官网作者).txt”，验证后再规范命名。
5. 最终文件名：

   `排名-JSON书名(BookID).txt`

6. 排名至少补齐 3 位；超过 999 本时按总数量位数扩展。
7. 替换非法字符：

   `/ \ : * ? " < > |`

8. TXT 内部保留 SoNovel 获取的官网现名。
9. manifest 记录改名和作者变化。
10. 最终报告列出所有变化项。
11. 文件名必须唯一包含对应 Book ID。

## 十二、单本验证实现要求

每个成功候选 TXT 检查：

1. 用严格模式 UTF-8 解码，不能使用自动替换模式。
2. 文件不得小于合理阈值；几百字节元数据壳直接失败。
3. 以行首正则 `^第\s*\d+\s*章` 提取章节标题。
4. 数量精确等于 `CHAPTER_LIMIT`。
5. 将空白规范化后与 `expectedChapterTitles` 逐条比较。
6. 扫描 U+E000–U+F8FF。
7. 扫描 U+FFFD。
8. 扫描 NUL 和非文本控制字符。
9. 扫描 PNG `89 50 4E 47 0D 0A 1A 0A`。
10. 扫描 JPEG `FF D8 FF`，必要时也检查 GIF。
11. 扫描常见 HTML 标签。
12. 扫描明显 mojibake，但避免对正常小说文本做武断猜测。
13. 检查 CLI 日志和章节日志：
    - `^\[ERROR\]`
    - `Exception:`
    - `SyntaxError:`
    - Javet 异常
14. 普通提示中引用 `[ERROR]` 这个词不算实际错误。
15. 验证文件名可唯一映射回 bookId。

## 十三、最终任务级校验

1. manifest 条目数等于原始 `.items | length`。
2. `success + failed + skipped + pending + downloading` 等于 manifest 条目数。
3. 结束时 `pending = 0`、`downloading = 0`。
4. 范围外项全部是 `skipped`。
5. 所选范围内没有被静默遗漏的项。
6. 顶层成功 TXT 数量等于 `success` 数量。
7. 每个 success 都有唯一 TXT、CLI 日志和章节日志。
8. 所有成功 TXT 重新独立执行一次完整验证。
9. 输出目录没有章节缓存、封面缓存或临时下载目录。
10. `fanqie.json` 中实际 `.slice(0,N)` 等于 `CHAPTER_LIMIT`。
11. `fanqie.json` 中没有 `__CHAPTER_LIMIT__`。
12. `.sonovel-config.ini` 的 `download-path` 精确等于 `OUTPUT_DIR`。
13. `active-rules` 精确等于 `fanqie.json`。
14. 不误写其他任务文件。
15. 失败尝试和范围调整产生的多余文件只移动到备份，不删除。

## 十四、最终汇报

完成后报告：

1. SoNovel 安装校验：
   - 操作系统
   - CPU 架构
   - SoNovel 版本
   - 原始命令是否正常
   - 是否存在断链或功能性失效的符号链接
   - 最终启动方式
2. JSON 原始书籍总数。
3. 本次 `BOOK_LIMIT` 的解析结果和实际处理数量。
4. 去重后的 Book ID 数量。
5. success、failed、skipped 数量。
6. `OUTPUT_DIR` 的绝对路径和可点击链接。
7. 所选范围内每本书的：
   - 排名
   - Book ID
   - JSON 书名
   - 官网现名
   - 下载章节数
   - 文件大小
   - 校验结果
8. 书名或作者变化。
9. 是否在番茄原始网页检测到字体混淆。
10. 当前静态映射是否有效。
11. 成功日志是否存在真实 `[ERROR]`。
12. 失败项及具体原因。
13. 跳过项及原因，包括范围外和重复项。
14. 是否全部达到当前四个变量定义的成功标准。
15. 明确说明没有执行 git commit 或 push。

不要只给出命令后停止。不要静默切换下载器。
