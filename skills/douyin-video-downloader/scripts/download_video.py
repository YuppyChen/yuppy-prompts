#!/usr/bin/env python3
"""
Download video from URL to specified directory.
"""
import os
import sys
import requests
from pathlib import Path
from urllib.parse import urlparse, unquote


def download_video(video_url, output_dir="douyin", filename=None):
    """
    Download video from URL to output directory.

    Args:
        video_url: Direct video download URL
        output_dir: Directory to save the video (default: "douyin")
        filename: Optional filename (if not provided, will extract from URL)

    Returns:
        Path to downloaded file
    """
    # Create output directory if it doesn't exist
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    # Determine filename
    if not filename:
        # Try to get filename from URL
        parsed_url = urlparse(video_url)
        filename = unquote(os.path.basename(parsed_url.path))
        if not filename or filename == '':
            # Generate filename from timestamp
            import time
            filename = f"douyin_video_{int(time.time())}.mp4"

    # Ensure filename has proper extension
    if not filename.endswith(('.mp4', '.MP4')):
        filename += '.mp4'

    output_file = output_path / filename

    # Download the video
    print(f"Downloading video to: {output_file}")

    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }

    response = requests.get(video_url, headers=headers, stream=True)
    response.raise_for_status()

    # Write video to file
    total_size = int(response.headers.get('content-length', 0))
    downloaded = 0

    with open(output_file, 'wb') as f:
        for chunk in response.iter_content(chunk_size=8192):
            if chunk:
                f.write(chunk)
                downloaded += len(chunk)
                if total_size > 0:
                    percent = (downloaded / total_size) * 100
                    print(f"\rProgress: {percent:.1f}%", end='', flush=True)

    print(f"\n✅ Video downloaded successfully: {output_file}")
    return str(output_file)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 download_video.py <video_url> [output_dir] [filename]")
        sys.exit(1)

    video_url = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else "douyin"
    filename = sys.argv[3] if len(sys.argv) > 3 else None

    try:
        download_video(video_url, output_dir, filename)
    except Exception as e:
        print(f"❌ Error downloading video: {e}")
        sys.exit(1)
