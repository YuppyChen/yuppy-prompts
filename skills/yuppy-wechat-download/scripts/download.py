#!/usr/bin/env python3
"""
微信公众号文章下载 Skill
下载微信公众号文章并转换为 Markdown 格式

功能:
- 按公众号名称自动分类存储
- 文件命名格式: 发布时间_标题.md
- 使用文章真实发布时间（非下载时间）
- 自动创建目录结构

依赖:
- requests
- beautifulsoup4
- html2text

安装: pip install requests beautifulsoup4 html2text
"""

import re
import json
import sys
import os
import argparse
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse, unquote

try:
    import requests
    from bs4 import BeautifulSoup
    import html2text
except ImportError as e:
    print(f"错误: 缺少依赖库。请运行: pip install requests beautifulsoup4 html2text")
    sys.exit(1)


class WeChatArticleDownloader:
    """微信公众号文章下载器"""

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
        })

    def fetch_article(self, url):
        """获取文章内容"""
        print(f"正在获取文章: {url}")

        try:
            response = self.session.get(url, timeout=30)
            response.raise_for_status()
            response.encoding = 'utf-8'

            soup = BeautifulSoup(response.text, 'html.parser')

            # 提取文章数据
            article = {
                'title': self._extract_title(soup),
                'author': self._extract_author(soup),
                'publish_time': self._extract_publish_time(soup),
                'content': self._extract_content(soup),
                'original_url': url
            }

            return article

        except Exception as e:
            print(f"获取文章失败: {e}")
            return None

    def _extract_title(self, soup):
        """提取标题"""
        selectors = [
            '#activity-name',
            '.rich_media_title',
            'h1.rich_media_title',
            'meta[property="og:title"]'
        ]

        for selector in selectors:
            element = soup.select_one(selector)
            if element:
                if element.name == 'meta':
                    return element.get('content', '').strip()
                return element.get_text(strip=True)

        return "未知标题"

    def _extract_author(self, soup):
        """提取作者/公众号名"""
        selectors = [
            '#js_name',
            '.rich_media_meta_nickname a',
            'meta[property="og:article:author"]'
        ]

        for selector in selectors:
            element = soup.select_one(selector)
            if element:
                if element.name == 'meta':
                    return element.get('content', '').strip()
                return element.get_text(strip=True)

        return "未知作者"

    def _extract_publish_time(self, soup):
        """提取发布时间"""
        selectors = [
            '#publish_time',
            '.rich_media_meta_text em',
            'meta[property="article:published_time"]',
            '.publish_time',
            'meta[name="publish_time"]'
        ]

        for selector in selectors:
            element = soup.select_one(selector)
            if element:
                if element.name == 'meta':
                    time_str = element.get('content', '').strip()
                else:
                    time_str = element.get_text(strip=True)

                if time_str:
                    # 过滤掉非时间的内容
                    if re.search(r'\d{4}', time_str):  # 包含年份
                        return time_str
                    if any(x in time_str for x in ['年', '月', '日', '-', ':']):
                        return time_str

        # 尝试从 .rich_media_meta_text 中提取（包含公众号名和时间）
        meta_text = soup.select_one('.rich_media_meta_text')
        if meta_text:
            text = meta_text.get_text(strip=True)
            # 查找时间模式 (如 "2024-07-30" 或 "2024年7月30日")
            time_match = re.search(r'(\d{4}[-年]\d{1,2}[-月]\d{1,2}[日]?)', text)
            if time_match:
                return time_match.group(1)

        # 如果无法从页面获取，尝试从 script 标签中解析
        script_tags = soup.find_all('script')
        for script in script_tags:
            if script.string:
                # 尝试多种时间戳字段名
                time_patterns = [
                    r'publish_time\s*:\s*["\']?(\d{10,13})["\']?',
                    r'createTime\s*:\s*["\']?(\d{10,13})["\']?',
                    r'dt\s*:\s*["\']?(\d{10,13})["\']?',
                    r'msg_time\s*:\s*["\']?(\d{10,13})["\']?',
                    r'time\s*:\s*["\']?(\d{10,13})["\']?',
                ]
                for pattern in time_patterns:
                    match = re.search(pattern, script.string)
                    if match:
                        try:
                            timestamp = int(match.group(1))
                            # 处理毫秒级时间戳
                            if timestamp > 1000000000000:
                                timestamp = timestamp // 1000
                            # 如果是秒级时间戳
                            if timestamp > 1000000000:
                                dt = datetime.fromtimestamp(timestamp)
                                return dt.strftime('%Y年%m月%d日 %H:%M')
                        except:
                            pass

        # 返回 None 表示未获取到真实发布时间
        return None

    def _format_publish_time(self, publish_time):
        """格式化发布时间为文件名友好的格式"""
        if not publish_time:
            return "unknown_time"

        # 尝试解析各种时间格式
        time_formats = [
            '%Y年%m月%d日 %H:%M',
            '%Y-%m-%d %H:%M',
            '%Y/%m/%d %H:%M',
            '%Y%m%d %H:%M'
        ]

        for fmt in time_formats:
            try:
                dt = datetime.strptime(publish_time, fmt)
                return dt.strftime('%Y%m%d_%H%M')
            except ValueError:
                continue

        # 如果无法解析，返回原值（清理特殊字符）
        return re.sub(r'[^\w\-:]', '', publish_time)

    def _extract_content(self, soup):
        """提取正文内容"""
        content_el = soup.select_one('#js_content')
        if not content_el:
            return ""

        # 处理图片 - 将 data-src 替换为实际 src
        for img in content_el.find_all('img'):
            data_src = img.get('data-src')
            if data_src:
                img['src'] = data_src

        # 处理视频 - 提取视频链接
        for video in content_el.find_all('iframe'):
            vid = video.get('vid', '') or video.get('data-mpvid', '')
            src = video.get('src', '') or video.get('data-src', '')

            # 构建视频链接
            video_url = ""
            if vid:
                # 微信视频链接格式
                video_url = f"https://mp.weixin.qq.com/mp/videoplayer?action=play&vid={vid}"
            elif src and 'mp.weixin.qq.com' in src:
                video_url = src

            if video_url:
                video_link = soup.new_tag('p')
                video_link.string = f'[视频链接: {video_url}]'
                video.replace_with(video_link)
            else:
                # 没有链接的情况下保留 vid
                if vid:
                    video_tag = soup.new_tag('p')
                    video_tag.string = f'[视频ID: {vid}]'
                    video.replace_with(video_tag)

        # 处理 mp-video 标签（新版微信视频标签）
        for mp_video in content_el.find_all('mp-video'):
            vid = mp_video.get('vid', '') or mp_video.get('data-vid', '')
            if vid:
                video_url = f"https://mp.weixin.qq.com/mp/videoplayer?action=play&vid={vid}"
                video_link = soup.new_tag('p')
                video_link.string = f'[视频链接: {video_url}]'
                mp_video.replace_with(video_link)

        # 使用 html2text 转换为 Markdown
        h = html2text.HTML2Text()
        h.ignore_links = False
        h.ignore_images = False
        h.ignore_emphasis = False
        h.body_width = 0

        markdown_content = h.handle(str(content_el))

        # 清理多余的空行
        markdown_content = re.sub(r'\n{3,}', '\n\n', markdown_content)

        return markdown_content.strip()

    def sanitize_filename(self, filename):
        """清理文件名，移除不合法字符"""
        # 移除不合法字符
        filename = re.sub(r'[<>:"/\\|?*]', '', filename)
        filename = filename.strip()
        # 限制长度
        if len(filename) > 150:
            filename = filename[:150]
        if not filename:
            filename = "untitled"
        return filename

    def save_markdown(self, article, base_output_dir):
        """
        保存为 Markdown 文件
        按公众号名称创建文件夹，文件名为 发布时间_标题.md
        """
        if base_output_dir is None:
            base_output_dir = os.getcwd()

        base_output_path = Path(base_output_dir)
        base_output_path.mkdir(parents=True, exist_ok=True)

        # 获取公众号名称（清理文件夹名）
        author = self.sanitize_filename(article['author'])
        if not author:
            author = "未知公众号"

        # 创建公众号文件夹
        author_dir = base_output_path / author
        author_dir.mkdir(parents=True, exist_ok=True)

        # 格式化发布时间
        formatted_time = self._format_publish_time(article['publish_time'])

        # 生成文件名: 发布时间_标题.md
        title = self.sanitize_filename(article['title'])
        filename = f"{formatted_time}_{title}.md"

        # 构建 Markdown 内容
        markdown_content = f"""# {article['title']}

**作者**: {article['author']}
**发布时间**: {article['publish_time']}
**原始链接**: {article['original_url']}

---

{article['content']}
"""

        # 保存文件
        output_file = author_dir / filename

        # 处理文件名冲突
        counter = 1
        while output_file.exists():
            output_file = author_dir / f"{formatted_time}_{title}_{counter}.md"
            counter += 1

        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(markdown_content)

        return output_file


def download_article(url, output_dir="wechat"):
    """
    下载微信公众号文章

    操作流程:
    1. 检查是否有 output_dir 目录，没有就创建
    2. 下载公众号文章，在 output_dir 目录下按公众号名称创建文件夹
    3. 将文章保存为 发布时间_标题.md 放到公众号文件夹下
    """
    # 验证 URL
    if not re.match(r'https?://mp\.weixin\.qq\.com/s[/?]', url):
        print("错误: 不是有效的微信公众号文章链接")
        print("链接格式应为: https://mp.weixin.qq.com/s/... 或 https://mp.weixin.qq.com/s?...")
        return False

    print(f"Step 1: 检查/创建输出目录: {output_dir}")

    downloader = WeChatArticleDownloader()

    print(f"Step 2: 正在下载文章内容...")
    article = downloader.fetch_article(url)

    if not article:
        print("下载失败: 无法获取文章内容")
        return False

    print(f"  - 标题: {article['title']}")
    print(f"  - 公众号: {article['author']}")
    print(f"  - 发布时间: {article['publish_time']}")

    print(f"Step 3: 保存文章...")
    output_file = downloader.save_markdown(article, output_dir)

    print(f"\n✓ 文章已下载成功!")
    print(f"  保存位置: {output_file}")

    return True


def main():
    parser = argparse.ArgumentParser(
        description='下载微信公众号文章并按公众号分类存储',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
示例:
  # 下载到默认 wechat 目录
  python download.py https://mp.weixin.qq.com/s/_iaiwdraikWZGd49O4zocQ

  # 下载到指定目录
  python download.py https://mp.weixin.qq.com/s/_iaiwdraikWZGd49O4zocQ -o ~/my_wechat

  # 下载到当前目录的 articles 文件夹
  python download.py https://mp.weixin.qq.com/s/_iaiwdraikWZGd49O4zocQ -o articles

目录结构示例:
  wechat/
  ├── 机器之心/
  │   ├── 20260108_1730_拓宽百年奥运「赛场边界」，阿里云AI让人人皆可上场.md
  │   └── 20260107_1200_另一篇文章标题.md
  └── 其他公众号/
      └── 20260106_0800_文章标题.md
        '''
    )
    parser.add_argument('url', help='微信公众号文章链接')
    parser.add_argument('-o', '--output', help='输出目录 (默认: wechat)', default='wechat')

    args = parser.parse_args()

    download_article(args.url, args.output)


if __name__ == "__main__":
    main()
