#!/usr/bin/env bash
set -Eeuo pipefail

on_error() {
  local rc=$?
  local line="${BASH_LINENO[0]:-unknown}"
  local command="${BASH_COMMAND:-unknown}"
  echo "Provisioning failed at line ${line}: ${command} (exit ${rc})" >&2
  if command -v systemctl >/dev/null 2>&1; then
    systemctl --no-pager --full status nginx 2>/dev/null | tail -n 40 >&2 || true
  fi
  exit "$rc"
}
trap on_error ERR

reload_nginx() {
  if systemctl is-active --quiet nginx; then
    if ! systemctl reload nginx; then
      echo "systemctl reload nginx failed; falling back to nginx -s reload." >&2
      nginx -s reload
    fi
  else
    echo "nginx service is not active; starting it." >&2
    if ! systemctl start nginx; then
      echo "systemctl start nginx failed; falling back to direct nginx start." >&2
      nginx
    fi
  fi
}

usage() {
  cat <<'EOF'
Usage:
  sudo ./ops/provision-frontend-domain.sh <domain> <repository-url> [build-dir] [health-marker]

Environment overrides:
  DEPLOY_USER       Linux user that owns application checkouts.
  DEPLOY_GROUP      Web group. Defaults to www-data.
  CERTBOT_EMAIL     Optional Let's Encrypt account email.
  KEY_FILE          Dedicated GitHub Actions SSH key. Defaults to /root/petertecnet-actions-deploy.
  LOCK_FILE         Root-safe provisioning lock. Defaults to /run/lock/petertecnet-frontend-provision.lock.
  SKIP_CERTBOT=1    Configure HTTP only.
  SKIP_GITHUB=1     Do not configure repository deploy secrets.
EOF
}

if [[ "${EUID}" -ne 0 ]]; then
  echo "This provisioner must run as root (use sudo)." >&2
  exit 1
fi

DOMAIN="${1:-}"
REPOSITORY="${2:-}"
BUILD_DIR="${3:-dist}"
HEALTH_MARKER="${4:-}"

if [[ -z "$DOMAIN" || -z "$REPOSITORY" ]]; then
  usage >&2
  exit 2
fi

if [[ ! "$DOMAIN" =~ ^[a-z0-9-]+\.petertecnet\.com\.br$ ]]; then
  echo "Refusing unsupported domain: $DOMAIN" >&2
  exit 3
fi

if [[ ! "$REPOSITORY" =~ ^https://github\.com/petertecnetdev/[A-Za-z0-9._-]+\.git$ ]]; then
  echo "Repository must be an HTTPS petertecnetdev GitHub clone URL." >&2
  exit 4
fi

if [[ "$BUILD_DIR" != "dist" && "$BUILD_DIR" != "build" ]]; then
  echo "build-dir must be either 'dist' or 'build'." >&2
  exit 5
fi

DEPLOY_GROUP="${DEPLOY_GROUP:-www-data}"
if [[ -z "${DEPLOY_USER:-}" ]]; then
  if [[ -d /var/www/petertecnet.com.br ]]; then
    DEPLOY_USER="$(stat -c '%U' /var/www/petertecnet.com.br)"
  else
    DEPLOY_USER="deploy"
  fi
fi

if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  echo "Deploy user does not exist: $DEPLOY_USER" >&2
  exit 6
fi

if ! getent group "$DEPLOY_GROUP" >/dev/null 2>&1; then
  echo "Deploy group does not exist: $DEPLOY_GROUP" >&2
  exit 7
fi

APP_DIR="/var/www/$DOMAIN"
SITE="/etc/nginx/sites-available/$DOMAIN"
ENABLED="/etc/nginx/sites-enabled/$DOMAIN"
CERT_DIR="/etc/letsencrypt/live/$DOMAIN"
LOCK_FILE="${LOCK_FILE:-/run/lock/petertecnet-frontend-provision.lock}"
KEY_FILE="${KEY_FILE:-/root/petertecnet-actions-deploy}"
REPO_SLUG="${REPOSITORY#https://github.com/}"
REPO_SLUG="${REPO_SLUG%.git}"

LOCK_DIR="$(dirname "$LOCK_FILE")"
install -d -m 0755 "$LOCK_DIR"
if [[ -e "$LOCK_FILE" && ! -f "$LOCK_FILE" ]]; then
  echo "Provisioning lock exists but is not a regular file: $LOCK_FILE" >&2
  exit 9
fi
touch "$LOCK_FILE"
chmod 0644 "$LOCK_FILE"
exec 9>"$LOCK_FILE"
if ! flock -w 1800 9; then
  echo "Timed out waiting for the frontend provisioning lock: $LOCK_FILE" >&2
  exit 75
fi

printf 'Provisioning %s\n' "$DOMAIN"
printf 'Repository: %s\n' "$REPOSITORY"
printf 'Application root: %s\n' "$APP_DIR"
printf 'Deploy owner: %s:%s\n' "$DEPLOY_USER" "$DEPLOY_GROUP"
printf 'Provision lock: %s\n' "$LOCK_FILE"

install -d -m 2775 -o "$DEPLOY_USER" -g "$DEPLOY_GROUP" "$APP_DIR"

if [[ -d "$APP_DIR/.git" ]]; then
  CURRENT_REMOTE="$(runuser -u "$DEPLOY_USER" -- git -C "$APP_DIR" remote get-url origin 2>/dev/null || true)"
  if [[ "$CURRENT_REMOTE" != "$REPOSITORY" ]]; then
    echo "Existing checkout uses a different origin: $CURRENT_REMOTE" >&2
    exit 8
  fi
else
  if [[ -n "$(find "$APP_DIR" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]]; then
    BACKUP="${APP_DIR}.backup-$(date +%Y%m%d%H%M%S)"
    mv "$APP_DIR" "$BACKUP"
    echo "Moved existing non-Git directory to $BACKUP"
    install -d -m 2775 -o "$DEPLOY_USER" -g "$DEPLOY_GROUP" "$APP_DIR"
  fi
  runuser -u "$DEPLOY_USER" -- git clone --branch main --single-branch "$REPOSITORY" "$APP_DIR"
fi

runuser -u "$DEPLOY_USER" -- git -C "$APP_DIR" fetch --prune origin main
runuser -u "$DEPLOY_USER" -- git -C "$APP_DIR" checkout main
runuser -u "$DEPLOY_USER" -- git -C "$APP_DIR" reset --hard origin/main

runuser -u "$DEPLOY_USER" -- bash -c "
  set -Eeuo pipefail
  cd \"$APP_DIR\"
  export CI=true
  export NODE_OPTIONS=\"\${NODE_OPTIONS:---max-old-space-size=4096}\"
  if [[ -f package-lock.json ]]; then
    npm ci --no-audit --no-fund || npm install --no-audit --no-fund --package-lock=false
  else
    npm install --no-audit --no-fund --package-lock=false
  fi
  npm run build
"

test -f "$APP_DIR/$BUILD_DIR/index.html"
if [[ -n "$HEALTH_MARKER" ]]; then
  grep -Fq "$HEALTH_MARKER" "$APP_DIR/$BUILD_DIR/index.html"
fi

chown -R "$DEPLOY_USER:$DEPLOY_GROUP" "$APP_DIR"
find "$APP_DIR" -type d -exec chmod g+rX {} +
find "$APP_DIR" -type f -exec chmod g+r {} +
chmod 2775 "$APP_DIR"

cat > "$SITE" <<NGINX_HTTP
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    root $APP_DIR/$BUILD_DIR;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location ~* \\.(?:js|css|png|jpg|jpeg|gif|svg|ico|webp|woff2?)$ {
        try_files \$uri =404;
        expires 7d;
        add_header Cache-Control "public, max-age=604800, immutable";
    }

    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header X-Frame-Options SAMEORIGIN always;
}
NGINX_HTTP

ln -sfn "$SITE" "$ENABLED"
nginx -t
reload_nginx

LOCAL_HTML=""
for attempt in {1..10}; do
  if LOCAL_HTML="$(curl --fail --silent --show-error --max-time 5 -H "Host: $DOMAIN" http://127.0.0.1/)"; then
    break
  fi
  echo "Local HTTP health check attempt ${attempt}/10 failed; retrying..." >&2
  sleep 1
done

if [[ -z "$LOCAL_HTML" ]]; then
  echo "Local HTTP vhost did not return HTML for $DOMAIN." >&2
  curl --silent --show-error --include --max-time 5 -H "Host: $DOMAIN" http://127.0.0.1/ >&2 || true
  exit 10
fi

if [[ -n "$HEALTH_MARKER" ]] && ! grep -Fq "$HEALTH_MARKER" <<<"$LOCAL_HTML"; then
  echo "Local HTTP vhost responded, but the expected health marker was not found: $HEALTH_MARKER" >&2
  echo "$LOCAL_HTML" | head -c 1000 >&2
  echo >&2
  exit 11
fi

echo "HTTP vhost is healthy locally."

DNS_IPV4="$(getent ahostsv4 "$DOMAIN" | awk '{print $1}' | sort -u | head -n1 || true)"
PUBLIC_IPV4="$(curl -4 -fsS --max-time 10 https://api.ipify.org 2>/dev/null || true)"

echo "DNS IPv4: ${DNS_IPV4:-unresolved}"
echo "VPS public IPv4: ${PUBLIC_IPV4:-undetected}"

if [[ "${SKIP_CERTBOT:-0}" != "1" ]]; then
  if [[ -z "$DNS_IPV4" ]]; then
    echo "DNS is not resolving yet; leaving the site available over HTTP." >&2
  elif [[ -n "$PUBLIC_IPV4" && "$DNS_IPV4" != "$PUBLIC_IPV4" ]]; then
    echo "DNS does not point to this VPS yet; skipping certificate issuance." >&2
  else
    if ! command -v certbot >/dev/null 2>&1; then
      apt-get update
      DEBIAN_FRONTEND=noninteractive apt-get install -y certbot python3-certbot-nginx
    fi

    CERTBOT_ARGS=(
      certbot --nginx
      -d "$DOMAIN"
      --non-interactive
      --agree-tos
      --redirect
      --keep-until-expiring
    )
    if [[ -n "${CERTBOT_EMAIL:-}" ]]; then
      CERTBOT_ARGS+=(--email "$CERTBOT_EMAIL")
    else
      CERTBOT_ARGS+=(--register-unsafely-without-email)
    fi

    "${CERTBOT_ARGS[@]}"
    nginx -t
    reload_nginx
  fi
fi

if [[ -s "$CERT_DIR/fullchain.pem" && -s "$CERT_DIR/privkey.pem" ]]; then
  openssl x509 -checkend 604800 -noout -in "$CERT_DIR/fullchain.pem"
  openssl x509 -in "$CERT_DIR/fullchain.pem" -noout -ext subjectAltName | grep -Fq "DNS:$DOMAIN"

  HTTPS_HTML="$(curl --fail --silent --show-error --location --max-time 20 "https://$DOMAIN/")"
  if [[ -n "$HEALTH_MARKER" ]]; then
    grep -Fq "$HEALTH_MARKER" <<<"$HTTPS_HTML"
  fi
  echo "HTTPS health check passed for https://$DOMAIN/"
else
  HTTP_HTML="$(curl --fail --silent --show-error --location --max-time 20 "http://$DOMAIN/" || true)"
  if [[ -n "$HTTP_HTML" && -n "$HEALTH_MARKER" ]]; then
    grep -Fq "$HEALTH_MARKER" <<<"$HTTP_HTML"
  fi
  echo "Provisioning completed without a local TLS certificate."
fi

if [[ "${SKIP_GITHUB:-0}" != "1" ]]; then
  if command -v gh >/dev/null 2>&1 && [[ -f "$KEY_FILE" ]] && gh auth status >/dev/null 2>&1; then
    ACTIONS_HOST="${PUBLIC_IPV4:-$DNS_IPV4}"
    SSH_PORT="$(sshd -T 2>/dev/null | awk '$1 == "port" {print $2; exit}' || true)"
    SSH_PORT="${SSH_PORT:-22}"

    if [[ -n "$ACTIONS_HOST" ]]; then
      echo "Configuring repository-level VPS deployment secrets for $REPO_SLUG"
      gh secret set VPS_HOST --body "$ACTIONS_HOST" --repo "$REPO_SLUG"
      gh secret set VPS_PORT --body "$SSH_PORT" --repo "$REPO_SLUG"
      gh secret set VPS_USER --body "$DEPLOY_USER" --repo "$REPO_SLUG"
      gh secret set VPS_SSH_KEY --repo "$REPO_SLUG" < "$KEY_FILE"

      if gh workflow view deploy-vps.yml --repo "$REPO_SLUG" >/dev/null 2>&1; then
        gh workflow run deploy-vps.yml --repo "$REPO_SLUG" --ref main || true
      fi
      echo "Automatic GitHub Actions deploy is configured for $REPO_SLUG."
    else
      echo "Could not determine a VPS host for GitHub Actions; repository secrets were not changed." >&2
    fi
  else
    echo "GitHub CLI authentication or the dedicated Actions key is unavailable; domain provisioning succeeded, but repository secrets were not changed." >&2
  fi
fi

echo "Deployed commit: $(git -C "$APP_DIR" rev-parse HEAD)"
