import os
import subprocess
import sys
from pathlib import Path

env_file = Path(os.environ.get('LOCALAPPDATA', '')) / 'hermes' / '.env'
env_vars = os.environ.copy()

if env_file.exists():
    for line in env_file.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            env_vars[k.strip()] = v.strip()

print("Mendeploy bundle produksi ke Cloudflare Pages 'erpposs'...")
res = subprocess.run(
    ["npx", "wrangler", "pages", "deploy", "dist", "--project-name", "erpposs"],
    env=env_vars,
    shell=True,
    capture_output=True,
    text=True
)

print(res.stdout)
if res.stderr:
    print(res.stderr, file=sys.stderr)

sys.exit(res.returncode)
