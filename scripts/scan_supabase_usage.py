import os
import re
import json

src_dir = 'src'
results = []

from_pattern = re.compile(r"supabase\s*\.\s*from\(\s*['\"]([^'\"]+)['\"]\s*\)([^;\n]+)?", re.MULTILINE)
rpc_pattern = re.compile(r"supabase\s*\.\s*rpc\(\s*['\"]([^'\"]+)['\"]", re.MULTILINE)

table_usages = {}

for root, _, files in os.walk(src_dir):
    for f in files:
        if f.endswith(('.jsx', '.js')) and not f.endswith('.test.jsx') and not f.endswith('.test.js'):
            filepath = os.path.join(root, f)
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as fp:
                content = fp.read()
                
            matches = from_pattern.findall(content)
            for tbl, chain in matches:
                if tbl not in table_usages:
                    table_usages[tbl] = []
                table_usages[tbl].append({
                    'file': filepath,
                    'chain': chain.strip()[:100] if chain else ''
                })
                
            rpc_matches = rpc_pattern.findall(content)
            for rpc in rpc_matches:
                if 'RPC:' + rpc not in table_usages:
                    table_usages['RPC:' + rpc] = []
                table_usages['RPC:' + rpc].append({'file': filepath, 'chain': 'rpc'})

print("=== TABLES AND RPCS REFERENCED IN FRONTEND ===")
for k in sorted(table_usages.keys()):
    files = sorted(list(set(u['file'] for u in table_usages[k])))
    print(f"- {k} ({len(table_usages[k])} calls across {len(files)} files):")
    for f in files[:4]:
        print(f"    {f}")
    if len(files) > 4:
        print(f"    ... and {len(files) - 4} more")
