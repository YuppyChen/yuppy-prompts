---
name: douyin-video-downloader
description: Download videos from Douyin (抖音) URLs. Use this skill when the user provides a Douyin video URL and wants to download it. The skill navigates to the video page using Chrome, extracts the video download URL, and downloads the video to the douyin directory.
---

# Douyin Video Downloader

## Overview

Download videos from Douyin (抖音) by providing a video page URL. This skill automates the process of navigating to the video page, extracting the direct download link, and saving the video locally.

## Workflow

When the user invokes this skill with `/douyin <url>`:

1. **Navigate to the video page** using chrome-mcp-stdio MCP tools
2. **Extract the video download URL** from the page
3. **Download the video** to the `douyin` directory in the project root

## Step-by-Step Process

### 1. Navigate to the Douyin URL

Use `chrome_navigate` to open the Douyin URL:

```
chrome_navigate with url parameter set to the provided Douyin URL
```

Wait a moment for the page to load (you can use a simple wait or check if the video element is present).

### 2. Extract Video URL from the Page

Use `chrome_get_web_content` to get the HTML content and extract the video URL:

```
chrome_get_web_content with:
- htmlContent: true
- tabId: the tab ID from step 1
```

Then parse the HTML content to find video URLs:
- Look for `<video>` tags with `src` attributes
- Look for `<source>` tags within `<video>` elements
- Search for `.mp4` URLs in the HTML using regex pattern: `https://[^"'\s]+\.mp4[^"'\s]*`

The video URLs are typically found in:
- Direct `src` attributes on video/source elements
- Embedded in the page HTML as CDN URLs (e.g., `v5-dy-o-abtest.zjcdn.com`, `v5-hl-szyd-ov.zjcdn.com`)

Extract the first valid video URL found in the content.

### 3. Download the Video with curl

Once you have the video URL, create the output directory and download:

```bash
# Create output directory
mkdir -p douyin

# Download with curl
curl -o "douyin/video_$(date +%s).mp4" "<video_url>" \
  -H "User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15" \
  -H "Referer: https://www.douyin.com/" \
  --progress-bar
```

Use a timestamped filename or extract a meaningful name from the page title.

### 4. Verify Download

Check that the file was downloaded successfully:

```bash
ls -lh douyin/
```

Inform the user of the download location and file size.

## Tips

- Mobile User-Agent works better for Douyin videos
- Video URLs may expire quickly, download immediately after extraction
- If one method fails, try the network capture approach
- Some videos may require the Referer header to download
