"""
Secure Cloudflare MCP Credentials Injector for Hermes Agent.
Safely stores CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID into $LOCALAPPDATA/hermes/.env
without leaking credentials into git or terminal history.
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

def set_cloudflare_credentials(api_token: str, account_id: str) -> bool:
    api_token = api_token.strip()
    account_id = account_id.strip()
    
    if not api_token:
        print("[ERROR] CLOUDFLARE_API_TOKEN tidak boleh kosong!")
        return False
    if not account_id:
        print("[ERROR] CLOUDFLARE_ACCOUNT_ID tidak boleh kosong!")
        return False
        
    env_path = get_hermes_env_path()
    env_path.parent.mkdir(parents=True, exist_ok=True)
    
    lines = []
    has_token = False
    has_account = False
    
    if env_path.exists():
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.startswith("CLOUDFLARE_API_TOKEN="):
                    lines.append(f"CLOUDFLARE_API_TOKEN={api_token}\n")
                    has_token = True
                elif line.startswith("CLOUDFLARE_ACCOUNT_ID="):
                    lines.append(f"CLOUDFLARE_ACCOUNT_ID={account_id}\n")
                    has_account = True
                else:
                    lines.append(line)
                    
    if not has_token:
        if lines and not lines[-1].endswith("\n"):
            lines.append("\n")
        lines.append(f"CLOUDFLARE_API_TOKEN={api_token}\n")
    if not has_account:
        if lines and not lines[-1].endswith("\n"):
            lines.append("\n")
        lines.append(f"CLOUDFLARE_ACCOUNT_ID={account_id}\n")
        
    with open(env_path, "w", encoding="utf-8") as f:
        f.writelines(lines)
        
    print(f"[SUCCESS] Kredensial Cloudflare berhasil disimpan ke vault: {env_path}")
    
    # Enable cloudflare mcp server in config.yaml
    hermes_bin = "/c/code/hermes-agent/venv/Scripts/hermes.exe"
    subprocess.run([hermes_bin, "config", "set", "mcp_servers.cloudflare.enabled", "true"], capture_output=True)
    
    return True

if __name__ == "__main__":
    if len(sys.argv) >= 3:
        token_input = sys.argv[1]
        account_input = sys.argv[2]
    else:
        print("--- Cloudflare MCP Vault Setup ---")
        token_input = getpass.getpass("Masukkan Cloudflare API Token (input tersembunyi): ")
        account_input = input("Masukkan Cloudflare Account ID: ").strip()
        
    if set_cloudflare_credentials(token_input, account_input):
        print("[INFO] Menguji konektivitas MCP Cloudflare...")
        hermes_bin = "/c/code/hermes-agent/venv/Scripts/hermes.exe"
        res = subprocess.run([hermes_bin, "mcp", "test", "cloudflare"], capture_output=True, text=True)
        print(res.stdout)
        if res.returncode == 0:
            print("[SUCCESS] MCP Cloudflare berhasil terhubung 100%!")
        else:
            print(res.stderr)
