#!/usr/bin/env python3
import sys
import os
import re
import requests
from urllib.parse import unquote
import json

def get_real_url(short_url):
    """Get the real URL from Douyin short URL"""
    headers = {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1'
    }
    try:
        response = requests.get(short_url, headers=headers, allow_redirects=True, timeout=10)
        return response.url
    except Exception as e:
        print(f"Error getting real URL: {e}")
        return None

def extract_video_id(url):
    """Extract video ID from URL"""
    match = re.search(r'/video/(\d+)', url)
    if match:
        return match.group(1)
    return None

def download_douyin_video(share_url, output_dir="douyin"):
    """Download Douyin video from share URL"""
    print(f"Processing URL: {share_url}")

    # Get real URL
    real_url = get_real_url(share_url)
    if not real_url:
        print("Failed to get real URL")
        return False

    print(f"Real URL: {real_url}")

    # Extract video ID
    video_id = extract_video_id(real_url)
    if not video_id:
        print("Failed to extract video ID")
        return False

    print(f"Video ID: {video_id}")

    # Try to get video info using API
    api_url = f"https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids={video_id}"

    headers = {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1',
        'Referer': real_url
    }

    try:
        response = requests.get(api_url, headers=headers, timeout=10)
        data = response.json()

        if data.get('status_code') != 0:
            print("API returned error status")
            return False

        item_list = data.get('item_list', [])
        if not item_list:
            print("No video found in response")
            return False

        video_info = item_list[0]

        # Try to get video URL (without watermark first)
        video_url = None

        # Method 1: Try play_addr (no watermark)
        if 'video' in video_info and 'play_addr' in video_info['video']:
            url_list = video_info['video']['play_addr'].get('url_list', [])
            if url_list:
                video_url = url_list[0]

        # Method 2: Try download_addr
        if not video_url and 'video' in video_info and 'download_addr' in video_info['video']:
            url_list = video_info['video']['download_addr'].get('url_list', [])
            if url_list:
                video_url = url_list[0]

        if not video_url:
            print("Failed to extract video URL from API response")
            return False

        print(f"Video URL found: {video_url[:100]}...")

        # Get video description for filename
        desc = video_info.get('desc', 'douyin_video')
        # Clean filename
        desc = re.sub(r'[^\w\s-]', '', desc)[:50]
        desc = re.sub(r'[-\s]+', '_', desc)

        # Create output directory
        os.makedirs(output_dir, exist_ok=True)

        # Download video
        output_file = os.path.join(output_dir, f"{desc}_{video_id}.mp4")

        print(f"Downloading to: {output_file}")

        video_response = requests.get(video_url, headers=headers, stream=True, timeout=30)
        total_size = int(video_response.headers.get('content-length', 0))

        with open(output_file, 'wb') as f:
            if total_size == 0:
                f.write(video_response.content)
            else:
                downloaded = 0
                for chunk in video_response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        downloaded += len(chunk)
                        done = int(50 * downloaded / total_size)
                        sys.stdout.write(f"\r[{'=' * done}{' ' * (50-done)}] {downloaded}/{total_size} bytes")
                        sys.stdout.flush()

        print(f"\n✓ Video downloaded successfully: {output_file}")
        return True

    except Exception as e:
        print(f"Error downloading video: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 douyin_downloader.py <douyin_url> [output_dir]")
        sys.exit(1)

    url = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else "douyin"

    success = download_douyin_video(url, output_dir)
    sys.exit(0 if success else 1)
