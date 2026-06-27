import argparse
import subprocess
import os
import uuid
import json
import base64
import time
from datetime import datetime
import requests

def extract_thumbnail(video_path, thumb_path):
    print("📸 Extracting HD Thumbnail...")
    # Grabs a frame at 00:00:02 in 720p HD
    cmd = [
        'ffmpeg', '-y', '-i', video_path, 
        '-ss', '00:00:02', '-vframes', '1', 
        '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2',
        thumb_path
    ]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print("✅ Thumbnail extracted!")

def upload_to_github_release(repo, token, file_path, tag_name):
    print(f"🚀 Uploading video to GitHub Releases (this may take a minute)...")
    headers = {"Authorization": f"token {token}", "Accept": "application/vnd.github.v3+json"}
    
    # 1. Create Release
    release_data = {"tag_name": tag_name, "name": f"Video Release {tag_name}", "body": "Video storage"}
    res = requests.post(f"https://api.github.com/repos/{repo}/releases", headers=headers, json=release_data)
    res.raise_for_status()
    release_id = res.json()["id"]
    upload_url = res.json()["upload_url"].split("{")[0]

    # 2. Upload Asset
    file_name = os.path.basename(file_path)
    with open(file_path, 'rb') as f:
        headers["Content-Type"] = "video/mp4"
        upload_res = requests.post(f"{upload_url}?name={file_name}", headers=headers, data=f)
        upload_res.raise_for_status()
    
    download_url = upload_res.json()["browser_download_url"]
    print("✅ Video uploaded!")
    return download_url

def commit_file_to_repo(repo, token, file_path_in_repo, content_bytes, commit_message):
    url = f"https://api.github.com/repos/{repo}/contents/{file_path_in_repo}"
    headers = {"Authorization": f"token {token}", "Accept": "application/vnd.github.v3+json"}
    
    data = {
        "message": commit_message,
        "content": base64.b64encode(content_bytes).decode('utf-8'),
        "branch": "main"
    }
    res = requests.put(url, headers=headers, json=data)
    res.raise_for_status()

def main():
    parser = argparse.ArgumentParser(description="Upload video to StreamVault")
    parser.add_argument('-f', '--file', required=True, help="Path to MP4 video file")
    parser.add_argument('-t', '--token', required=True, help="GitHub Personal Access Token")
    parser.add_argument('-r', '--repo', required=True, help="GitHub Repo (e.g., username/video-player)")
    parser.add_argument('--title', default="StreamVault Video", help="Title for the video page")
    args = parser.parse_args()

    video_id = str(uuid.uuid4())[:8]
    thumb_path = f"{video_id}.jpg"
    
    # Extract thumbnail
    extract_thumbnail(args.file, thumb_path)

    # Upload Video to Release
    video_url = upload_to_github_release(args.repo, args.token, args.file, f"v_{video_id}")

    username = args.repo.split('/')[0]
    repo_name = args.repo.split('/')[1]
    base_url = f"https://{username}.github.io/{repo_name}"

    # Read template and replace variables
    with open("video-template.html", "r", encoding="utf-8") as f:
        html_content = f.read()

    html_content = html_content.replace("{{TITLE}}", args.title)
    html_content = html_content.replace("{{VIDEO_URL}}", video_url)
    html_content = html_content.replace("{{THUMBNAIL_URL}}", f"{base_url}/thumbnails/{thumb_path}")
    html_content = html_content.replace("{{PAGE_URL}}", f"{base_url}/videos/{video_id}.html")
    html_content = html_content.replace("{{DATE}}", datetime.now().strftime("%B %d, %Y"))

    # Commit HTML page
    print("📝 Generating webpage...")
    commit_file_to_repo(args.repo, args.token, f"videos/{video_id}.html", html_content.encode('utf-8'), f"Add video page {video_id}")
    
    # Commit Thumbnail
    print("🖼️ Uploading thumbnail...")
    with open(thumb_path, "rb") as f:
        commit_file_to_repo(args.repo, args.token, f"thumbnails/{thumb_path}", f.read(), f"Add thumbnail {video_id}")
    
    # Cleanup local thumb
    os.remove(thumb_path)

    print("\n🎉 ALL DONE! Your video will be live in ~60 seconds.")
    print(f"🔗 Share this link on WhatsApp: {base_url}/videos/{video_id}.html")

if __name__ == "__main__":
    main()