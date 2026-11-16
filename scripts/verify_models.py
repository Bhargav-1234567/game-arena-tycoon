import os
import re
import glob

ts_files = glob.glob('src/**/*.ts', recursive=True)
model_urls = set()
pattern = re.compile(r"['\"`](/assets/models/[^'\"`]+\.glb)['\"`]")

for ts in ts_files:
    with open(ts, 'r', encoding='utf-8') as f:
        content = f.read()
        for match in pattern.findall(content):
            model_urls.add(match)

print(f"Total unique model paths referenced in TypeScript: {len(model_urls)}")
missing = []
for url in sorted(model_urls):
    rel_path = 'public' + url.replace('/', os.sep)
    if not os.path.exists(rel_path):
        missing.append((url, rel_path))
    else:
        size = os.path.getsize(rel_path)
        print(f"  [OK] {url} ({size} bytes)")

if missing:
    print("\nWARNING - MISSING FILES:")
    for m in missing:
        print("  [MISSING]", m[0])
else:
    print("\nALL MODEL PATHS EXIST ON DISK!")

