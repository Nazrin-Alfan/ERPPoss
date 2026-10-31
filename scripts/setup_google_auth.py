import urllib.request, json, os, sys
from pathlib import Path

def activate_google_auth(client_id, client_secret):
    env_file = Path(os.environ.get('LOCALAPPDATA', '')) / 'hermes' / '.env'
    token = ''
    if env_file.exists():
        for line in env_file.read_text(encoding='utf-8').splitlines():
            if line.startswith('SUPABASE_ACCESS_TOKEN='):
                token = line.split('=', 1)[1].strip()

    if not token:
        print("ERROR: SUPABASE_ACCESS_TOKEN not found in vault")
        sys.exit(1)

    payload = json.dumps({
        'external_google_enabled': True,
        'external_google_client_id': client_id.strip(),
        'external_google_secret': client_secret.strip(),
        'site_url': 'https://erpposs.pages.dev',
        'uri_allow_list': 'https://erpposs.pages.dev/**,http://localhost:5173/**'
    }).encode('utf-8')

    req = urllib.request.Request(
        'https://api.supabase.com/v1/projects/jutidxobdedygmjngmcq/config/auth',
        data=payload,
        headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
        method='PATCH'
    )
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        print("SUCCESS: Google Auth activated!")
        print("external_google_enabled:", data.get('external_google_enabled'))
        print("external_google_client_id:", data.get('external_google_client_id'))

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python setup_google_auth.py <client_id> <client_secret>")
        sys.exit(1)
    activate_google_auth(sys.argv[1], sys.argv[2])
