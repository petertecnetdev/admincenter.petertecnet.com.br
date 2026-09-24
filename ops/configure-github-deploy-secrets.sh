#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root so it can read the dedicated Actions SSH key." >&2
  exit 1
fi

KEY_FILE="${KEY_FILE:-/root/petertecnet-actions-deploy}"
VPS_USER="${VPS_USER:-deploy}"
VPS_PORT="${VPS_PORT:-22}"

if [[ ! -f "$KEY_FILE" ]]; then
  echo "Deploy private key not found at $KEY_FILE. Run bootstrap-vps-deploy.sh first." >&2
  exit 2
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is not installed. Run bootstrap-vps-deploy.sh first." >&2
  exit 3
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated." >&2
  echo "Run: gh auth login" >&2
  exit 4
fi

if [[ -z "${VPS_HOST:-}" ]]; then
  VPS_HOST="$(curl -4 -fsS --max-time 10 https://api.ipify.org)"
fi

if [[ -z "$VPS_HOST" ]]; then
  echo "Could not determine VPS public IPv4. Re-run with VPS_HOST=<server-ip>." >&2
  exit 5
fi

REPOSITORIES=(
  petertecnetdev/petertecnet.com.br
  petertecnetdev/api.petertecnet.com.br
  petertecnetdev/nexus.petertecnet.com.br
  petertecnetdev/cutinapp.petertecnet.com.br
  petertecnetdev/rasoio.petertecnet.com.br
  petertecnetdev/plat.petertecnet.com.br
  petertecnetdev/inkap.petertecnet.com.br
  petertecnetdev/payflow.petertecnet.com.br
  petertecnetdev/laora.petertecnet.com.br
  petertecnetdev/locaio.petertecnet.com.br
)

for repo in "${REPOSITORIES[@]}"; do
  echo "Configuring Actions secrets for $repo"
  gh secret set VPS_HOST --body "$VPS_HOST" --repo "$repo"
  gh secret set VPS_PORT --body "$VPS_PORT" --repo "$repo"
  gh secret set VPS_USER --body "$VPS_USER" --repo "$repo"
  gh secret set VPS_SSH_KEY --repo "$repo" < "$KEY_FILE"
done

echo
echo "Actions secrets configured. Triggering initial deployments..."

gh workflow run deploy-production.yml --repo petertecnetdev/petertecnet.com.br --ref main

gh workflow run deploy-vps.yml --repo petertecnetdev/api.petertecnet.com.br --ref staging

for repo in \
  petertecnetdev/nexus.petertecnet.com.br \
  petertecnetdev/cutinapp.petertecnet.com.br \
  petertecnetdev/rasoio.petertecnet.com.br \
  petertecnetdev/plat.petertecnet.com.br \
  petertecnetdev/inkap.petertecnet.com.br \
  petertecnetdev/payflow.petertecnet.com.br \
  petertecnetdev/laora.petertecnet.com.br \
  petertecnetdev/locaio.petertecnet.com.br \
do
  gh workflow run deploy-vps.yml --repo "$repo" --ref main
done

echo
echo "Initial deploy runs were requested for the full Peter Tecnet ecosystem."
echo "From now on, pushes to main deploy the frontends automatically and pushes to staging deploy the API automatically."
echo
echo "Useful status command:"
echo "  gh run list --repo petertecnetdev/petertecnet.com.br --limit 10"
