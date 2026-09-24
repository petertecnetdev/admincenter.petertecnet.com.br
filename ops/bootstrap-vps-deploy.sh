#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

DEPLOY_USER="${DEPLOY_USER:-deploy}"
DEPLOY_GROUP="www-data"
DEPLOY_HOME="/home/${DEPLOY_USER}"
KEY_FILE="${KEY_FILE:-/root/petertecnet-actions-deploy}"

if ! getent group "$DEPLOY_GROUP" >/dev/null 2>&1; then
  echo "Required group '$DEPLOY_GROUP' does not exist." >&2
  exit 2
fi

if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$DEPLOY_USER"
fi

usermod -aG "$DEPLOY_GROUP" "$DEPLOY_USER"

install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$DEPLOY_HOME/.ssh"
touch "$DEPLOY_HOME/.ssh/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_HOME/.ssh/authorized_keys"
chmod 600 "$DEPLOY_HOME/.ssh/authorized_keys"

if [[ ! -f "$KEY_FILE" ]]; then
  ssh-keygen \
    -t ed25519 \
    -N '' \
    -C 'github-actions@petertecnet' \
    -f "$KEY_FILE" >/dev/null
fi

PUBLIC_KEY="$(cat "${KEY_FILE}.pub")"
if ! grep -qxF "$PUBLIC_KEY" "$DEPLOY_HOME/.ssh/authorized_keys"; then
  printf '%s\n' "$PUBLIC_KEY" >> "$DEPLOY_HOME/.ssh/authorized_keys"
fi

chown "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_HOME/.ssh/authorized_keys"
chmod 600 "$DEPLOY_HOME/.ssh/authorized_keys"

if ! command -v gh >/dev/null 2>&1; then
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y gh
fi

required_commands=(git curl npm php composer)
missing_commands=()
for command_name in "${required_commands[@]}"; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    missing_commands+=("$command_name")
  fi
done

if (( ${#missing_commands[@]} > 0 )); then
  echo "Missing commands required by the current Peter Tecnet deploy process: ${missing_commands[*]}" >&2
  echo "Install them before enabling the Actions secrets." >&2
  exit 3
fi

declare -A REPOSITORIES=(
  ["/var/www/api.petertecnet.com.br"]="petertecnetdev/api.petertecnet.com.br"
  ["/var/www/petertecnet.com.br"]="petertecnetdev/petertecnet.com.br"
  ["/var/www/nexus.petertecnet.com.br"]="petertecnetdev/nexus.petertecnet.com.br"
  ["/var/www/cutinapp.petertecnet.com.br"]="petertecnetdev/cutinapp.petertecnet.com.br"
  ["/var/www/rasoio.petertecnet.com.br"]="petertecnetdev/rasoio.petertecnet.com.br"
  ["/var/www/plat.petertecnet.com.br"]="petertecnetdev/plat.petertecnet.com.br"
  ["/var/www/inkap.petertecnet.com.br"]="petertecnetdev/inkap.petertecnet.com.br"
  ["/var/www/payflow.petertecnet.com.br"]="petertecnetdev/payflow.petertecnet.com.br"
  ["/var/www/laora.petertecnet.com.br"]="petertecnetdev/laora.petertecnet.com.br"
)

for app_path in "${!REPOSITORIES[@]}"; do
  repo="${REPOSITORIES[$app_path]}"

  if [[ ! -d "$app_path" ]]; then
    echo "Skipping missing path: $app_path"
    continue
  fi

  echo "Preparing $app_path"
  chown -R "$DEPLOY_USER:$DEPLOY_GROUP" "$app_path"
  chmod -R g+rX "$app_path"

  if [[ -d "$app_path/storage" && -d "$app_path/bootstrap/cache" ]]; then
    chmod -R ug+rwX "$app_path/storage" "$app_path/bootstrap/cache"
    find "$app_path/storage" "$app_path/bootstrap/cache" -type d -exec chmod 2775 {} +
    find "$app_path/storage" "$app_path/bootstrap/cache" -type f -exec chmod 664 {} +
  fi

  if [[ -f "$app_path/.env" ]]; then
    chown "$DEPLOY_USER:$DEPLOY_GROUP" "$app_path/.env"
    chmod 640 "$app_path/.env"
  fi

  if [[ -d "$app_path/.git" ]]; then
    runuser -u "$DEPLOY_USER" -- git -C "$app_path" remote set-url origin "https://github.com/${repo}.git"
    runuser -u "$DEPLOY_USER" -- git -C "$app_path" config fetch.prune true
  fi
done

PUBLIC_IP="$(curl -4 -fsS --max-time 10 https://api.ipify.org 2>/dev/null || true)"

echo
echo "Peter Tecnet VPS deploy bootstrap completed."
echo "Deploy user: $DEPLOY_USER"
echo "SSH port: 22"
if [[ -n "$PUBLIC_IP" ]]; then
  echo "Detected public IPv4: $PUBLIC_IP"
fi
echo "Private Actions key: $KEY_FILE"
echo
echo "Next step: authenticate GitHub CLI once, then configure all repository secrets:"
echo "  gh auth login"
echo "  curl -fsSL https://raw.githubusercontent.com/petertecnetdev/petertecnet.com.br/main/ops/configure-github-deploy-secrets.sh | bash"
echo
echo "Do not publish, commit or send the private key stored at $KEY_FILE."
