---
name: yuppy-wechat-download
description: 识别到是微信公众号文章链接时，自动调用下载微信公众号文章并转换为 Markdown 格式。
---

## 微信公众号文章下载 Skill

识别到是微信公众号文章链接时，自动下载微信公众号文章并转换为 Markdown 格式。

## 功能
- 提取公众号名称
- 提取文章标题、作者、**真实发布时间**
- 将正文内容转换为 Markdown 格式
- 保留图片链接（使用微信 CDN 原始链接）
- **提取视频链接**（生成可播放的视频 URL）
- 自动保存为 `.md` 文件

## 使用方法

用户输入微信公众号链接（以 `https://mp.weixin.qq.com/s/` 开头），skill 会自动下载并转换。

### 命令行使用

```bash
python3 .claude/skills/wechat-download/scripts/download.py <文章链接>
python3 .claude/skills/wechat-download/scripts/download.py <文章链接> -o <输出目录>
```

### 示例

```bash
# 下载到当前目录
python3 .claude/skills/wechat-download/scripts/download.py https://mp.weixin.qq.com/s/_iaiwdraikWZGd49O4zocQ

# 下载到指定目录
python3 .claude/skills/wechat-download/scripts/download.py https://mp.weixin.qq.com/s/_iaiwdraikWZGd49O4zocQ -o ~/Downloads
```

## 依赖

- requests
- beautifulsoup4
- html2text

安装依赖：
```bash
pip3 install requests beautifulsoup4 html2text --break-system-packages
```

## 输出格式

**文件命名**: `发布时间_标题.md` (例如: `20260108_文章标题.md`)

**生成的 Markdown 文件格式**:

```markdown
# 文章标题

**作者**: 公众号名称
**发布时间**: YYYY年MM月DD日 HH:MM
**原始链接**: https://mp.weixin.qq.com/s/...

---

文章正文内容...

![图片描述](https://mmbiz.qpic.cn/...)

[视频链接: https://mp.weixin.qq.com/mp/videoplayer?action=play&vid=xxxxxx]
```

## 注意事项

- 图片使用微信 CDN 原始链接，可以直接在 Markdown 阅读器中查看
- 视频生成可播放链接，格式为 `[视频链接: https://mp.weixin.qq.com/mp/videoplayer?action=play&vid=xxx]`
- 文件名会自动清理特殊字符
- 如果文件名冲突，会自动添加序号
