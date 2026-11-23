"""Encode a recorded browser walkthrough as H.264 MP4 and verify a complete decode."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('folder', type=Path)
parser.add_argument('--ffmpeg', default=shutil.which('ffmpeg'))
args = parser.parse_args()
if not args.ffmpeg:
    parser.error('Supply --ffmpeg with an encoder supporting libx264.')

folder = args.folder.resolve()
source = folder / 'Game_Arena_Tycoon_Gameplay.webm'
destination = folder / 'Game_Arena_Tycoon_Gameplay.mp4'
subprocess.run([args.ffmpeg, '-y', '-i', str(source), '-an', '-c:v', 'libx264',
                '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p',
                '-vf', 'fps=25', '-movflags', '+faststart', str(destination)], check=True)
subprocess.run([args.ffmpeg, '-v', 'error', '-i', str(destination), '-f', 'null', '-'], check=True)

chapters = json.loads((folder / 'chapters.json').read_text(encoding='utf-8'))
for index, chapter in enumerate(chapters):
    if index not in [0, 1, 8, 10, 13, 14, 15, 16, 17, len(chapters) - 1]:
        continue
    subprocess.run([args.ffmpeg, '-y', '-v', 'error', '-ss', str(chapter['seconds'] + 1),
                    '-i', str(destination), '-frames:v', '1',
                    str(folder / f'frame-{index:02d}.jpg')], check=True)
print(json.dumps({'video': str(destination), 'bytes': destination.stat().st_size,
                  'chapters': len(chapters), 'decode_verified': True}, indent=2))
