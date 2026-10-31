"""
Secure Supabase MCP Token Injector for Hermes Agent.
Safely stores the SUPABASE_ACCESS_TOKEN into $LOCALAPPDATA/hermes/.env
without leaking it into git, history, or chat transcripts.
"""

import sys
import os
import getpass
from pathlib import Path
import subprocess

def get_hermes_env_path() -> Path:
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        env_path = Path(local_app_data) / "hermes" / ".env"
    else:
        env_path = Path.home() / ".hermes" / ".env"
    return env_path

def set_supabase_token(token: str) -> bool:
    token = token.strip()
    if not token:
        print("[ERROR] Token tidak boleh kosong!")
        return False
    
    env_path = get_hermes_env_path()
    env_path.parent.mkdir(parents=True, exist_ok=True)
    
    lines = []
    found = False
    if env_path.exists():
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.startswith("SUPABASE_ACCESS_TOKEN="):
                    lines.append(f"SUPABASE_ACCESS_TOKEN={token}\n")
                    found = True
                else:
                    lines.append(line)
    
    if not found:
        if lines and not lines[-1].endswith("\n"):
            lines.append("\n")
        lines.append(f"SUPABASE_ACCESS_TOKEN={token}\n")
        
    with open(env_path, "w", encoding="utf-8") as f:
        f.writelines(lines)
        
    print(f"[SUCCESS] Token Supabase berhasil disimpan ke vault: {env_path}")
    return True

if __name__ == "__main__":
    if len(sys.argv) > 1:
        token_input = sys.argv[1]
    else:
        token_input = getpass.getpass("Masukkan Supabase Personal Access Token (input tersembunyi): ")
        
    if set_supabase_token(token_input):
        print("[INFO] Menguji konektivitas MCP Supabase...")
        res = subprocess.run(
            ["/c/code/hermes-agent/venv/Scripts/hermes.exe", "mcp", "test", "supabase"],
            capture_output=True,
            text=True
        )
        print(res.stdout)
        if res.returncode == 0:
            print("[SUCCESS] MCP Supabase berhasil terhubung 100%!")
        else:
            print(res.stderr)
