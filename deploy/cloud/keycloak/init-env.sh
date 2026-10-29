#!/usr/bin/env bash
set -euo pipefail
deploy_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
target="$deploy_dir/.env"
if [[ -e "$target" || -L "$target" ]]; then
  printf '%s\n' 'The deployment .env already exists; keep its persistent credentials.' >&2
  exit 1
fi
command -v openssl >/dev/null
umask 077
temporary=$(mktemp "$deploy_dir/.env.new.XXXXXX")
trap 'rm -f -- "$temporary"' EXIT
while IFS= read -r line || [[ -n "$line" ]]; do
  key=${line%%=*}
  case "$key" in
    CLOUD_DATABASE_PASSWORD|CLOUD_KEYCLOAK_DATABASE_PASSWORD|CLOUD_KEYCLOAK_ADMIN_PASSWORD|CLOUD_OIDC_CLIENT_SECRET|CLOUD_RUNNER_TOKEN|CLOUD_CREDENTIAL_KEY|CLOUD_INPUT_SIGNING_KEY|CLOUD_S3_SECRET_ACCESS_KEY)
      printf '%s=%s\n' "$key" "$(openssl rand -hex 32)" >> "$temporary"
      ;;
    *) printf '%s\n' "$line" >> "$temporary" ;;
  esac
done < "$deploy_dir/.env.example"
# Creating the final name with a hard link also refuses a concurrent initialization.
ln -- "$temporary" "$target"
chmod 600 "$target"
printf '%s\n' 'Created deploy/cloud/.env with independent random credentials. Configure domains, email and payment before public use.'
