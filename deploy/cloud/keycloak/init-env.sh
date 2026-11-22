#!/usr/bin/env bash
set -euo pipefail
deploy_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
target=${1:-$deploy_dir/.env}
if [[ -e "$target" || -L "$target" ]]; then
  printf '%s\n' 'The deployment .env already exists; keep its persistent credentials.' >&2
  exit 1
fi
secret() {
  if command -v openssl >/dev/null; then openssl rand -hex 32; else od -An -N32 -tx1 /dev/urandom | tr -d ' \n'; fi
}
umask 077
temporary=$(mktemp "$(dirname -- "$target")/.env.new.XXXXXX")
trap 'rm -f -- "$temporary"' EXIT
while IFS= read -r line || [[ -n "$line" ]]; do
  key=${line%%=*}
  case "$key" in
    CLOUD_DATABASE_PASSWORD|CLOUD_KEYCLOAK_DATABASE_PASSWORD|CLOUD_KEYCLOAK_ADMIN_PASSWORD|CLOUD_OIDC_CLIENT_SECRET|CLOUD_HUB_CLIENT_SECRET|CLOUD_HUB_API_TOKEN|CLOUD_HUB_CRYPT_KEY|CLOUD_S3_SECRET_ACCESS_KEY)
      printf '%s=%s\n' "$key" "$(secret)" >> "$temporary"
      ;;
    *) printf '%s\n' "$line" >> "$temporary" ;;
  esac
done < "$deploy_dir/.env.example"
# Creating the final name with a hard link also refuses a concurrent initialization.
ln -- "$temporary" "$target"
chmod 600 "$target"
printf 'Created %s with independent random credentials. Configure domains and email before public use.\n' "$target"
