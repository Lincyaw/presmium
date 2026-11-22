#!/usr/bin/env bash
# Presmium Cloud installer: one command from an empty Linux host with Docker to a running cloud.
#
#   curl -fsSL https://raw.githubusercontent.com/Lincyaw/presmium/main/deploy/cloud/install.sh | bash
#   curl -fsSL .../install.sh | bash -s -- --yes --ip
#   curl -fsSL .../install.sh | bash -s -- --yes --domain example.com
#   bash ~/presmium-cloud/install.sh status | upgrade | uninstall
#
# Everything lives in one directory (default ~/presmium-cloud): .env with the generated secrets, the deploy files of
# each installed version under releases/, current -> the running one, and backups/. Run with --help for the options.
set -eu
set -o pipefail

readonly repository=Lincyaw/presmium
readonly published_registry=ghcr.io/lincyaw/
readonly minimum_compose=2.24.4
readonly backup_helper=busybox@sha256:fd7dc98638c8e305f4dc34e979f1c0fdfdcaeb0fbf8fcff77ae834b6da3d7e6e
# Releases up to 1.0.0-rc.129 kept the shares in MinIO (volume <project>_objects). MinIO no longer publishes images, so
# the old server runs only from a copy already on this host; rclone copies its objects into the current store.
readonly legacy_object_store=minio/minio@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e
readonly object_copier=rclone/rclone:1.75.2@sha256:2687085f718d3c628f7fdfb77c52a1d344332aed543110bb88088f2c70d43eb5

usage() {
  cat <<'EOF'
Presmium Cloud installer

Usage: install.sh [install] [options]
       install.sh upgrade [--version V] [--build | --registry PREFIX] [--yes]
       install.sh status
       install.sh uninstall [--purge] [--yes]

Address (asked interactively when none is given):
  --domain DOMAIN     your own domain; uses app., auth., content. and studio.DOMAIN (DNS: *.DOMAIN -> this server)
  --ip [ADDRESS]      this server's IP, no domain: everything at https://ADDRESS/ (default: the detected public IP
                      if it leads to this server; behind NAT, this server's own address on its network).
                      A public IP gets a Let's Encrypt IP certificate; otherwise (or if that fails) Caddy's own
                      certificate, which browsers warn about once
  --http              with --ip: plain http://ADDRESS/ for an intranet (no microphone recording or clipboard)
  --sslip [ADDRESS]   this server's public IP through sslip.io names: app.<ip-with-dashes>.sslip.io and so on
  --local             local trial on 127.0.0.1 only, reached through an SSH tunnel
  --port PORT         the local trial's port (default 18787), or with --ip the port of https:// (or http://);
                      a port other than 443 always uses Caddy's own certificate
  --email ADDRESS     certificate notices from Let's Encrypt (optional)

Email for registration and password recovery (optional; without it registration needs no verification):
  --smtp-host HOST --smtp-from ADDRESS [--smtp-port 587] [--smtp-user USER --smtp-password PASSWORD]

Other options:
  --dir DIR           installation directory (default ~/presmium-cloud)
  --version VERSION   release to install, e.g. 1.0.0-rc.130 (default: the latest release)
  --build             build the images on this host instead of pulling them (about 7 GB, takes a while)
  --source TARBALL    a source tarball (file or URL) instead of the GitHub release archive
  --registry PREFIX   pull the cloud's images from a mirror of ghcr.io/lincyaw/, e.g. --registry mirror.example.com/lincyaw/
  --name NAME         Compose project and instance name (default presmium-cloud)
  --yes               do not ask; required when no terminal is available
  --dry-run           show what would be done without changing anything
  --purge             with uninstall: also delete every volume (all documents and accounts) and the configuration
EOF
}

say() { printf '%s\n' "$*"; }
step() { printf '\n==> %s\n' "$*"; }
warn() { printf 'Warning: %s\n' "$*" >&2; }
die() { printf 'Error: %s\n' "$*" >&2; exit 1; }

have_tty() { [ -t 0 ] || { [ -r /dev/tty ] && { : </dev/tty; } 2>/dev/null; }; }

ask() { # ask PROMPT -> answer on stdout; read from the terminal even under `curl | bash`
  local answer
  have_tty || die "no terminal for questions; pass --yes with --domain, --ip, --sslip or --local"
  printf '%s' "$1" >/dev/tty
  IFS= read -r answer </dev/tty || answer=
  printf '%s' "$answer"
}

confirm() { # confirm PROMPT: --yes answers yes
  [ "$assume_yes" = 1 ] && return 0
  case $(ask "$1 [y/N] ") in [yY]|[yY][eE][sS]) return 0 ;; *) return 1 ;; esac
}

version_at_least() { # version_at_least HAVE NEED
  [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n1)" = "$2" ]
}

# --- .env -------------------------------------------------------------------------------------------------------

env_get() { # env_get KEY [FILE]
  local file=${2:-$env_file}
  [ -f "$file" ] || return 0
  sed -n "s/^$1=//p" "$file" | tail -n1 | sed "s/^'\\(.*\\)'\$/\\1/"
}

env_set() { # env_set FILE KEY VALUE: replaces or appends, atomically, keeping mode 0600
  local file=$1 key=$2 value=$3 temporary
  case $value in *"'"*|*$'\n'*) die "$key must not contain quotes or line breaks" ;; esac
  case $value in *[!A-Za-z0-9@%+=:,./_-]*) value="'$value'" ;; esac
  temporary=$(umask 077; mktemp "$file.XXXXXX")
  awk -v key="$key" -v value="$value" '
    BEGIN { done = 0 }
    index($0, key "=") == 1 { if (!done) print key "=" value; done = 1; next }
    { print }
    END { if (!done) print key "=" value }
  ' "$file" >"$temporary"
  chmod 600 "$temporary"
  mv -f -- "$temporary" "$file"
}

# --- Docker -----------------------------------------------------------------------------------------------------

check_host() {
  [ "$(uname -s)" = Linux ] || die "Presmium Cloud runs on Linux (this is $(uname -s))."
  command -v curl >/dev/null || die "curl is required."
  command -v tar >/dev/null || die "tar is required."
  if ! command -v docker >/dev/null; then
    say "Docker Engine is not installed. Install it with Docker's official script, then run this installer again:"
    say "  curl -fsSL https://get.docker.com | sudo sh"
    say "  sudo usermod -aG docker \"\$USER\"   # then log out and in again"
    [ "$dry_run" = 1 ] && { warn "continuing the dry run without Docker"; docker_ok=0; return 0; }
    exit 1
  fi
  if ! docker info >/dev/null 2>&1; then
    say "Docker is installed but this user cannot reach it. Either start Docker (sudo systemctl start docker),"
    say "add yourself to the docker group (sudo usermod -aG docker \"\$USER\", then log in again), or run with sudo."
    [ "$dry_run" = 1 ] && { warn "continuing the dry run without Docker"; docker_ok=0; return 0; }
    exit 1
  fi
  local compose
  compose=$(docker compose version --short 2>/dev/null | sed 's/^v//') ||
    die "Docker Compose v2 is missing. Install the docker-compose-plugin package (https://docs.docker.com/compose/install/linux/)."
  version_at_least "$compose" "$minimum_compose" ||
    die "Docker Compose $compose is too old; $minimum_compose or later is needed (https://docs.docker.com/compose/install/linux/)."
  docker_ok=1
}

dc() { # docker compose for the installed (or given) release
  local deploy=${release_dir:-$install_dir/current}/deploy/cloud
  local files=(-f "$deploy/compose.yaml")
  if [ "$(env_get CLOUD_INSTALL_MODE)" = local ] || [ "${mode:-}" = local ]; then files+=(-f "$deploy/compose.loopback.yaml"); fi
  # Built images only: with a registry every image is pulled, and a failed pull is an error rather than a build.
  if [ -z "$(env_get CLOUD_IMAGE_REGISTRY)" ] && [ -f "$deploy/compose.build.yaml" ]; then files+=(-f "$deploy/compose.build.yaml"); fi
  docker compose --env-file "$env_file" "${files[@]}" "$@"
}

port_in_use() {
  if command -v ss >/dev/null; then
    [ -n "$(ss -Hltn "sport = :$1" 2>/dev/null)" ]
  else
    (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
  fi
}

published_ports() { # the host ports the configured entrance publishes
  if [ "$(env_get CLOUD_INSTALL_MODE)" = local ]; then env_get CLOUD_LOOPBACK_PORT
  else printf '%s %s' "$(env_get CLOUD_HTTP_PORT)" "$(env_get CLOUD_HTTPS_PORT)"
  fi
}

entrance_running() {
  [ -f "$env_file" ] && [ -e "$install_dir/current" ] &&
    [ -n "$(dc ps -q --status running entrance 2>/dev/null)" ]
}

check_ports() {
  local port ports
  case $mode in
    local) ports=$loopback_port ;;
    ip) ports=$site_port; [ "$scheme" = https ] && [ "$site_port" = 443 ] && ports="80 443" ;;
    *) ports="80 443" ;;
  esac
  # The running entrance holds its own ports; after a change of address only the new ones must be free.
  [ "$docker_ok" = 1 ] && entrance_running && { [ -n "${own_ports:-}" ] || return 0; }
  for port in $ports; do
    case " ${own_ports:-} " in *" $port "*) continue ;; esac
    if port_in_use "$port"; then
      [ "$dry_run" = 1 ] && { warn "port $port is already in use"; continue; }
      die "port $port is already in use; free it (or with --local or --ip pick another with --port)."
    fi
  done
}

# --- Addresses --------------------------------------------------------------------------------------------------

public_ip() {
  local url ip
  for url in https://api.ipify.org https://ifconfig.me/ip https://icanhazip.com; do
    ip=$(curl -fsS4 --max-time 6 "$url" 2>/dev/null | tr -d ' \r\n') || continue
    case $ip in *[!0-9.]*|'') continue ;; esac
    printf '%s' "$ip"
    return 0
  done
  return 1
}

valid_ipv4() {
  local IFS=. part count=0
  case $1 in *[!0-9.]*|'') return 1 ;; esac
  for part in $1; do
    [ -n "$part" ] && [ "$part" -le 255 ] || return 1
    count=$((count + 1))
  done
  [ "$count" = 4 ]
}

private_ipv4() { # loopback, private, shared (CGNAT) and link-local addresses: no public certificate
  case $1 in
    0.*|10.*|127.*|192.168.*|169.254.*) return 0 ;;
    172.*) local second=${1#172.}; second=${second%%.*}; [ "$second" -ge 16 ] && [ "$second" -le 31 ] ;;
    100.*) local second=${1#100.}; second=${second%%.*}; [ "$second" -ge 64 ] && [ "$second" -le 127 ] ;;
    *) return 1 ;;
  esac
}

choose_mode() {
  [ -n "$mode" ] && return 0
  have_tty || die "no terminal for questions; pass --domain DOMAIN, --ip, --sslip or --local"
  say ""
  say "Where will people open Presmium Cloud?"
  say "  1) My own domain        e.g. example.com; you point *.example.com at this server"
  say "  2) This server's IP     no domain needed; one address, https://<IP>/ (behind NAT: the address on its network)"
  say "  3) Only me, locally     a trial on 127.0.0.1, opened through an SSH tunnel"
  say "  4) sslip.io names       this server's public IP through app.<IP>.sslip.io and three more names"
  case $(ask "Choose 1, 2, 3 or 4: ") in
    1) mode=domain; domain=$(ask "Your domain (the cloud uses app., auth., content. and studio. below it): ") ;;
    2) mode=ip ;;
    3) mode=local ;;
    4) mode=sslip ;;
    *) die "please choose 1, 2, 3 or 4" ;;
  esac
}

resolve_addresses() {
  case $mode in
    domain)
      domain=$(printf '%s' "$domain" | tr '[:upper:]' '[:lower:]' | sed 's#^https\?://##; s#/.*$##; s/^\*\.//; s/\.$//')
      case $domain in ''|*[!a-z0-9.-]*|.*|*..*) die "not a domain name: '$domain'" ;; *.*) ;; *) die "not a domain name: '$domain'" ;; esac
      base=$domain
      ;;
    ip|sslip)
      if [ -z "$ip_address" ] && [ "$mode" = ip ]; then
        choose_ip_address
      elif [ -z "$ip_address" ]; then
        ip_address=$(public_ip) || die "could not detect this server's public IP; pass it: --$mode 203.0.113.7"
      fi
      valid_ipv4 "$ip_address" || die "not an IPv4 address: '$ip_address'"
      base="$(printf '%s' "$ip_address" | tr . -).sslip.io"
      ;;
    local) base=localhost ;;
  esac
  if [ "$mode" = ip ]; then
    # One origin: the console at /, Keycloak at /auth, JupyterHub at /studio and the shared sites at /p/.
    base=$ip_address
    [ -n "$site_port" ] || { [ "$scheme" = https ] && site_port=443 || site_port=80; }
    site_url="$scheme://$ip_address"
    case $scheme:$site_port in https:443|http:80) ;; *) site_url="$site_url:$site_port" ;; esac
    app_url=$site_url
    auth_url="$site_url/auth"
    content_url=$site_url
    hub_url="$site_url/studio"
    if [ "$scheme" = http ]; then tls=off
    elif private_ipv4 "$ip_address" || [ "$site_port" != 443 ]; then tls=internal
    else tls=acme
    fi
  elif [ "$mode" = local ]; then
    app_url="http://app.localhost:$loopback_port"
    auth_url="http://auth.localhost:$loopback_port"
    content_url="http://content.localhost:$loopback_port"
    hub_url="http://hub.localhost:$loopback_port"
  else
    app_url="https://app.$base"
    auth_url="https://auth.$base"
    content_url="https://content.$base"
    hub_url="https://studio.$base"
  fi
}

check_dns() {
  [ "$mode" = domain ] || return 0
  local expected host address missing=
  expected=$(public_ip || true)
  for host in app auth content studio; do
    address=$(getent ahostsv4 "$host.$base" 2>/dev/null | awk 'NR == 1 { print $1 }' || true)
    if [ -z "$address" ]; then
      missing="$missing $host.$base (does not resolve)"
    elif [ -n "$expected" ] && [ "$address" != "$expected" ]; then
      missing="$missing $host.$base (-> $address)"
    fi
  done
  [ -z "$missing" ] && { say "DNS: app., auth., content. and studio.$base point to this server."; return 0; }
  say ""
  say "DNS is not ready:$missing"
  say "Add one record at your DNS provider, then wait for it to spread:"
  [ -n "$expected" ] || expected="<this server's public IP>"
  say "  *.$base   A   $expected"
  say "HTTPS certificates are requested once the names resolve; until then the cloud is unreachable."
  [ "$dry_run" = 1 ] && return 0
  confirm "Continue anyway?" || die "stopped; run the installer again once DNS is in place."
}

# --- Reachability -----------------------------------------------------------------------------------------------

local_ipv4() { # local_ipv4 ADDRESS: the address is on one of this machine's interfaces
  if command -v ip >/dev/null; then
    ip -4 -o addr show 2>/dev/null | awk '{ sub(/\/.*/, "", $4); print $4 }' | grep -qxF "$1"
  else
    hostname -I 2>/dev/null | tr ' ' '\n' | grep -qxF "$1"
  fi
}

primary_ipv4() { # the source address of the default route: where others on this network reach this machine
  local address=
  command -v ip >/dev/null && address=$(ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p' | head -n1)
  [ -n "$address" ] || address=$(hostname -I 2>/dev/null | awk '{ print $1 }')
  valid_ipv4 "$address" && printf '%s' "$address"
}

served_certificate() { # served_certificate ADDRESS PORT [NAME] -> lines "id=", "subject=", "issuer=" of the certificate
  local output
  if command -v openssl >/dev/null; then
    output=$(timeout 8 openssl s_client -connect "$1:$2" ${3:+-servername "$3"} </dev/null 2>/dev/null |
      openssl x509 -noout -fingerprint -sha256 -subject -issuer -nameopt oneline 2>/dev/null) || return 0
    printf '%s\n' "$output" | sed -n 's/^[^=]*Fingerprint=/id=/p; s/^subject= */subject=/p; s/^issuer= */issuer=/p'
  else
    output=$(curl -skv -o /dev/null --max-time 8 --connect-to "::$1:$2" "https://${3:-$1}:$2/" 2>&1) || true
    printf '%s\n' "$output" | sed -n 's/^\* *subject: */subject=/p; s/^\* *issuer: */issuer=/p' | head -n2 |
      awk '{ print } /^subject=/ { s = $0 } /^issuer=/ { i = $0 } END { if (s != "") print "id=" s i }'
  fi
}

field() { printf '%s\n' "$2" | sed -n "s/^$1=//p" | head -n1; } # field KEY LINES

http_server() { # http_server ADDRESS PORT PATH -> the HTTP status and Server header of the answer, or nothing
  curl -sS -o /dev/null -D - --max-time 8 "http://$1:$2$3" 2>/dev/null |
    awk 'NR == 1 { status = $2 } tolower($1) == "server:" { sub(/^[^:]*: */, ""); sub(/\r$/, ""); server = $0 }
      END { if (status != "") print status " " (server == "" ? "(no Server header)" : "Server: " server) }'
}

probe_address() { # probe_address ADDRESS [NAME] -> probe_result: local, forwarded, other or unknown; probe_detail
  local address=$1 name=${2:-} theirs ours token answer listener=
  probe_result=unknown probe_detail=
  if local_ipv4 "$address"; then probe_result=local; return 0; fi
  theirs=$(served_certificate "$address" 443 "$name")
  if [ -n "$(field id "$theirs")" ]; then
    # Anything on that address's port 443 is this server only if it shows the certificate this server shows.
    port_in_use 443 && ours=$(served_certificate 127.0.0.1 443 "$name")
    if [ -n "${ours:-}" ] && [ "$(field id "$ours")" = "$(field id "$theirs")" ]; then probe_result=forwarded; return 0; fi
    probe_result=other
    probe_detail="port 443 of $address answers with a certificate for $(field subject "$theirs") (issued by $(field issuer "$theirs")), which is not this server's"
    return 0
  fi
  port_in_use 80 && return 0
  # A short-lived web server on port 80 shows whether requests to the address arrive here.
  token=presmium-probe-$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')
  if [ "$dry_run" != 1 ] && [ "$docker_ok" = 1 ]; then
    listener=$(docker run -d --rm -p 80:80 "$backup_helper" sh -c \
      "mkdir -p /w/.well-known/acme-challenge && echo $token >/w/.well-known/acme-challenge/$token && exec httpd -f -p 80 -h /w" \
      2>/dev/null) || listener=
    [ -n "$listener" ] && sleep 1
  fi
  if [ -n "$listener" ] && [ "$(curl -fsS --max-time 8 "http://$address/.well-known/acme-challenge/$token" 2>/dev/null)" = "$token" ]; then
    probe_result=forwarded
  else
    answer=$(http_server "$address" 80 "/.well-known/acme-challenge/$token")
    if [ -n "$answer" ]; then
      probe_result=other
      probe_detail="port 80 of $address is answered by another device ($answer)"
    fi
  fi
  [ -n "$listener" ] && docker rm -f "$listener" >/dev/null 2>&1
  return 0
}

explain_nat() { # explain_nat PUBLIC-IP PRIVATE-IP
  local inside="https://$2/"
  [ "$mode" = ip ] && [ -n "$site_port" ] && [ "$site_port" != 443 ] && inside="https://$2:$site_port/"
  say ""
  say "$1 is not this server: this server is behind NAT (or the address belongs to another machine)."
  if [ "$probe_result" = other ]; then say "  $probe_detail; it is a router or the network's gateway."
  else say "  it is not on this machine's interfaces, and requests to it on ports 80 and 443 do not arrive here."
  fi
  say "People outside this network cannot reach this server directly, and no public certificate can be issued here."
  say "People on the same network or VPN can open $inside (Caddy's own certificate; browsers warn once)."
  say "To open it to the internet, either:"
  say "  - ask the network's administrator for a public IP, or to forward TCP 80 and 443 of a public address to $2;"
  say "    then install with --ip <that address>, or point a domain at it and install with --domain DOMAIN; or"
  say "  - run a tunnel to a public host, such as Cloudflare Tunnel or frp, in front of $inside."
  say ""
}

choose_ip_address() { # --ip without an address: the public IP if it leads here, else this machine's own address
  local public private answer
  public=$(public_ip || true)
  if [ -n "$public" ]; then
    probe_address "$public"
    case $probe_result in local|forwarded) ip_address=$public; return 0 ;; esac
  fi
  private=$(primary_ipv4) || die "could not find this server's address; pass it: --ip 192.0.2.7"
  if [ -n "$public" ]; then explain_nat "$public" "$private"
  else say "Could not detect a public IP (no internet access?); using this server's address $private."
  fi
  ip_address=$private
  if [ "$assume_yes" != 1 ] && have_tty; then
    answer=$(ask "Address to use [$private]: ")
    [ -z "$answer" ] || ip_address=$answer
  fi
  say "Using $ip_address."
}

check_reachable() { # for an address that is not on this machine: does it lead here? Offer this machine's address if not
  local address name private
  case $mode in
    ip) private_ipv4 "$ip_address" && return 0; address=$ip_address name= ;;
    sslip) address=$ip_address name=app.$base ;;
    domain)
      address=$(getent ahostsv4 "app.$base" 2>/dev/null | awk 'NR == 1 { print $1 }' || true)
      [ -n "$address" ] || return 0
      name=app.$base ;;
    *) return 0 ;;
  esac
  probe_address "$address" "$name"
  case $probe_result in
    local|forwarded) return 0 ;;
    unknown)
      say "Note: $address is not on this machine's interfaces, and this machine cannot tell whether it leads here"
      say "      (NAT or a cloud firewall; some networks do not let a machine reach its own public address)."
      if [ "$mode" = ip ] && [ "$site_port" != 443 ]; then say "      Forward or open TCP $site_port on it to this server."
      else say "      Forward or open TCP 80 and 443 (and UDP 443) on it to this server, or certificates cannot be issued."
      fi
      return 0 ;;
  esac
  private=$(primary_ipv4 || true)
  say ""
  say "!!! Another device answers on $address: HTTPS certificates cannot be issued here,"
  say "!!! and ${name:-$address} does not reach this server."
  if [ -n "$private" ]; then explain_nat "$address" "$private"; else say "$probe_detail."; fi
  if [ -n "$private" ] && [ "$assume_yes" != 1 ] && [ "$dry_run" != 1 ] && have_tty; then
    case $(ask "Use this server's own address instead (--ip $private)? [Y/n] ") in
      [nN]|[nN][oO]) say "Keeping ${name:-$address}." ;;
      *) mode=ip ip_address=$private scheme=https site_port='' tls=''; resolve_addresses ;;
    esac
  else
    say "Continuing with ${name:-$address} as asked."
    [ -z "$private" ] || say "To use this server's own address instead, run the installer again with --ip $private."
  fi
}

check_ip_certificate() {
  [ "$mode" = ip ] || return 0
  case $tls in
    acme) say "Certificate: a Let's Encrypt IP certificate (six days, renewed automatically); Caddy's own if that fails." ;;
    internal)
      if private_ipv4 "$ip_address"; then say "Certificate: $ip_address is a private address, which no public CA certifies;"
      else say "Certificate: a public CA validates only ports 80 and 443;"
      fi
      say "             Caddy's own certificate is used, and browsers warn once." ;;
  esac
}

# --- Releases ---------------------------------------------------------------------------------------------------

latest_version() {
  local tag headers status
  # The releases feed on github.com lists prereleases too (/releases/latest skips them) and, unlike api.github.com,
  # has no limit of 60 requests an hour per address, which a campus or company network shares.
  tag=$(curl -fsSL --max-time 20 "https://github.com/$repository/releases.atom" 2>/dev/null |
    sed -n 's#.*/releases/tag/\(v[0-9][^"]*\)".*#\1#p' | head -n1) || true
  if [ -z "$tag" ]; then
    headers=$(mktemp)
    tag=$(curl -sSL --max-time 20 -D "$headers" "https://api.github.com/repos/$repository/releases?per_page=30" 2>/dev/null |
      sed -n 's/^ *"tag_name": *"\(v[0-9][^"]*\)".*/\1/p' | head -n1) || true
    status=$(awk 'toupper($1) ~ /^HTTP/ { code = $2 } END { print code }' "$headers")
    if [ -z "$tag" ] && { [ "$status" = 403 ] || [ "$status" = 429 ]; } && grep -qi '^x-ratelimit-remaining: *0' "$headers"; then
      rm -f -- "$headers"
      die "GitHub's API refused this address: its limit of 60 requests an hour is used up (often by others behind the same
       public address). Pass the release with --version (e.g. --version 1.0.0-rc.131), or retry in an hour."
    fi
    rm -f -- "$headers"
  fi
  [ -n "$tag" ] || die "could not reach github.com to find the latest release; pass --version (e.g. --version 1.0.0-rc.131)."
  printf '%s' "${tag#v}"
}

fetch_release() { # fetch_release VERSION FULL(0|1) -> sets release_dir
  local version=$1 full=$2 target="$install_dir/releases/$1" kind=deploy url work
  [ "$full" = 1 ] && kind=full
  release_dir=$target
  if [ -f "$target/.presmium-cloud-release" ]; then
    case "$(cat "$target/.presmium-cloud-release")" in full) return 0 ;; deploy) [ "$full" = 0 ] && return 0 ;; esac
  fi
  if [ -n "$source_tarball" ]; then url=$source_tarball; else
    case $version in [0-9]*) url="https://github.com/$repository/archive/refs/tags/v$version.tar.gz" ;;
      *) url="https://github.com/$repository/archive/$version.tar.gz" ;; esac
  fi
  step "Downloading Presmium Cloud $version"
  mkdir -p "$install_dir/releases"
  work=$(mktemp -d "$install_dir/releases/.download.XXXXXX")
  if [ -f "$url" ]; then cp -- "$url" "$work/source.tar.gz"
  else curl -fsSL --retry 3 -o "$work/source.tar.gz" "$url" || { rm -rf -- "$work"; die "could not download $url"; }
  fi
  mkdir "$work/tree"
  if [ "$full" = 1 ]; then
    tar -xzf "$work/source.tar.gz" -C "$work/tree" --strip-components=1
  else
    tar -xzf "$work/source.tar.gz" -C "$work/tree" --strip-components=1 --wildcards '*/deploy/cloud/*'
  fi
  if [ ! -f "$work/tree/deploy/cloud/compose.yaml" ] || ! grep -q CLOUD_IMAGE_REGISTRY "$work/tree/deploy/cloud/compose.yaml"; then
    rm -rf -- "$work"
    die "release $version predates this installer; choose a newer --version."
  fi
  printf '%s\n' "$kind" >"$work/tree/.presmium-cloud-release"
  rm -rf -- "$target"
  mv -- "$work/tree" "$target"
  rm -rf -- "$work"
}

activate_release() {
  ln -sfn "releases/$1" "$install_dir/current.new"
  mv -fT -- "$install_dir/current.new" "$install_dir/current"
  cp -- "$install_dir/current/deploy/cloud/install.sh" "$install_dir/install.sh"
  chmod 755 "$install_dir/install.sh"
}

# --- Configuration ----------------------------------------------------------------------------------------------

configure_env() { # configure_env FILE: writes the address, images, mail and naming settings
  local file=$1
  env_set "$file" CLOUD_COMPOSE_PROJECT "$project"
  env_set "$file" CLOUD_INSTANCE_ID "$project"
  env_set "$file" CLOUD_IMAGE_TAG "$version"
  if [ "$build" = 1 ]; then env_set "$file" CLOUD_IMAGE_REGISTRY ""; else env_set "$file" CLOUD_IMAGE_REGISTRY "${registry:-$published_registry}"; fi
  env_set "$file" CLOUD_ACME_EMAIL "$acme_email"
  configure_mail "$file"
  configure_address "$file"
  # The realm is imported with these addresses; a later change of address updates it (sync_identity_addresses).
  env_set "$file" CLOUD_IDENTITY_ADDRESSES "$(identity_addresses "$file")"
  # Written last: a .env without it was interrupted before configuration and is configured again.
  env_set "$file" CLOUD_INSTALL_MODE "$mode"
}

identity_addresses() { # what the realm's clients and TLS requirement were last set to
  printf '%s,%s,%s' "$(env_get CLOUD_PUBLIC_URL "$1")" "$(env_get CLOUD_HUB_URL "$1")" "$(env_get CLOUD_KEYCLOAK_SSL_REQUIRED "$1")"
}

configure_address() { # configure_address FILE: every setting that follows the address, so the mode can change
  local file=$1
  # Defaults for the settings of the one-address layout; the ip mode sets its own below.
  env_set "$file" CLOUD_CADDYFILE Caddyfile
  env_set "$file" CLOUD_SITE_ADDRESS ""
  env_set "$file" CLOUD_TLS ""
  env_set "$file" CLOUD_HTTP_PORT 80
  env_set "$file" CLOUD_HTTPS_PORT 443
  env_set "$file" CLOUD_ALLOW_INSECURE_HTTP false
  env_set "$file" CLOUD_KEYCLOAK_SSL_REQUIRED external
  if [ "$mode" = ip ]; then
    # Every service on the one address; the four names are that address.
    env_set "$file" CLOUD_CADDYFILE Caddyfile.path
    env_set "$file" CLOUD_SITE_ADDRESS "$scheme://$ip_address"
    env_set "$file" CLOUD_TLS "$tls"
    env_set "$file" CLOUD_APP_HOST "$ip_address"
    env_set "$file" CLOUD_AUTH_HOST "$ip_address"
    env_set "$file" CLOUD_CONTENT_HOST "$ip_address"
    env_set "$file" CLOUD_HUB_HOST "$ip_address"
    # Docker publishes the port that is not used on a free random port (0).
    if [ "$scheme" = https ]; then
      env_set "$file" CLOUD_HTTPS_PORT "$site_port"
      if [ "$site_port" = 443 ]; then env_set "$file" CLOUD_HTTP_PORT 80; else env_set "$file" CLOUD_HTTP_PORT 0; fi
    else
      env_set "$file" CLOUD_HTTP_PORT "$site_port"
      env_set "$file" CLOUD_HTTPS_PORT 0
      env_set "$file" CLOUD_ALLOW_INSECURE_HTTP true
      env_set "$file" CLOUD_KEYCLOAK_SSL_REQUIRED none
    fi
  elif [ "$mode" = local ]; then
    env_set "$file" CLOUD_APP_HOST app.localhost
    env_set "$file" CLOUD_AUTH_HOST auth.localhost
    env_set "$file" CLOUD_CONTENT_HOST content.localhost
    env_set "$file" CLOUD_HUB_HOST hub.localhost
    env_set "$file" CLOUD_LOOPBACK_PORT "$loopback_port"
  else
    env_set "$file" CLOUD_APP_HOST "app.$base"
    env_set "$file" CLOUD_AUTH_HOST "auth.$base"
    env_set "$file" CLOUD_CONTENT_HOST "content.$base"
    env_set "$file" CLOUD_HUB_HOST "studio.$base"
  fi
  env_set "$file" CLOUD_PUBLIC_URL "$app_url"
  env_set "$file" CLOUD_AUTH_URL "$auth_url"
  env_set "$file" CLOUD_CONTENT_URL "$content_url"
  env_set "$file" CLOUD_HUB_URL "$hub_url"
  env_set "$file" CLOUD_OIDC_ISSUER "$auth_url/realms/presmium"
  # The local trial's sign-in service accepts plain HTTP (compose.loopback.yaml); the realm follows it.
  [ "$mode" = local ] && env_set "$file" CLOUD_KEYCLOAK_SSL_REQUIRED none
  return 0
}

configure_mail() { # configure_mail FILE
  local file=$1 smtp=0
  [ -n "$smtp_host" ] && smtp=1
  if [ "$smtp" = 1 ]; then
    [ -n "$smtp_from" ] || die "--smtp-host needs --smtp-from (the sender address)"
    env_set "$file" CLOUD_SMTP_HOST "$smtp_host"
    env_set "$file" CLOUD_SMTP_PORT "$smtp_port"
    env_set "$file" CLOUD_SMTP_FROM "$smtp_from"
    env_set "$file" CLOUD_SMTP_USER "$smtp_user"
    env_set "$file" CLOUD_SMTP_PASSWORD "$smtp_password"
    if [ -n "$smtp_user" ]; then env_set "$file" CLOUD_SMTP_AUTH true; else env_set "$file" CLOUD_SMTP_AUTH false; fi
    env_set "$file" CLOUD_KEYCLOAK_VERIFY_EMAIL true
    env_set "$file" CLOUD_KEYCLOAK_PASSWORD_RESET true
  else
    env_set "$file" CLOUD_KEYCLOAK_VERIFY_EMAIL false
    env_set "$file" CLOUD_KEYCLOAK_PASSWORD_RESET false
  fi
}

load_installed() { # adopt the settings of an existing installation
  mode=$(env_get CLOUD_INSTALL_MODE)
  # Installations before the one-address layout recorded sslip.io names as mode ip.
  [ "$mode" = ip ] && [ "$(env_get CLOUD_CADDYFILE)" != Caddyfile.path ] && mode=sslip
  tls=$(env_get CLOUD_TLS)
  case $(env_get CLOUD_SITE_ADDRESS) in http://*) scheme=http ;; esac
  if [ "$scheme" = http ]; then site_port=$(env_get CLOUD_HTTP_PORT); else site_port=$(env_get CLOUD_HTTPS_PORT); fi
  project=$(env_get CLOUD_COMPOSE_PROJECT)
  loopback_port=$(env_get CLOUD_LOOPBACK_PORT)
  app_url=$(env_get CLOUD_PUBLIC_URL)
  auth_url=$(env_get CLOUD_AUTH_URL)
  content_url=$(env_get CLOUD_CONTENT_URL)
  hub_url=$(env_get CLOUD_HUB_URL)
  case $mode in
    ip) ip_address=$(env_get CLOUD_APP_HOST); base=$ip_address ;;
    sslip) base=$(env_get CLOUD_APP_HOST); base=${base#app.}; ip_address=$(printf '%s' "${base%.sslip.io}" | tr - .) ;;
    domain) base=$(env_get CLOUD_APP_HOST); base=${base#app.}; domain=$base ;;
    local) base=localhost ;;
  esac
  if [ -z "$(env_get CLOUD_IMAGE_REGISTRY)" ]; then build=1; fi
}

describe_address() { # one line: the address option and where people open the cloud
  case $mode in
    ip) printf '%s' "--ip $ip_address"; [ "$scheme" = http ] && printf ' --http'
      case $site_port in ''|80|443) ;; *) printf ' --port %s' "$site_port" ;; esac
      printf ': %s' "$app_url"
      case $tls in acme) printf ", Let's Encrypt certificate" ;; internal) printf ", Caddy's own certificate" ;; off) printf ', plain HTTP' ;; esac ;;
    sslip) printf -- '--sslip %s: %s' "$ip_address" "$app_url" ;;
    domain) printf -- '--domain %s: %s' "$base" "$app_url" ;;
    local) printf -- '--local --port %s: %s' "$loopback_port" "$app_url" ;;
  esac
}

print_env() { # the configuration with secrets hidden
  sed -E '/^#/d; /^$/d; s/^(CLOUD_[A-Z0-9_]*(PASSWORD|SECRET|TOKEN|CRYPT_KEY|SECRET_ACCESS_KEY))=.+/\1=<secret, hidden>/' "$1" | sed 's/^/  /'
}

# --- Running ----------------------------------------------------------------------------------------------------

images() {
  if [ "$build" = 1 ]; then
    step "Building the images on this host (the Studio image is about 5 GB; this takes a while)"
    dc build
    dc --profile build-studio build studio-image
  else
    step "Pulling the images for ${CLOUD_IMAGE_TAG:-$(env_get CLOUD_IMAGE_TAG)} from $(env_get CLOUD_IMAGE_REGISTRY)"
    local output
    if ! output=$(dc --profile build-studio pull --quiet 2>&1); then
      printf '%s\n' "$output" | tail -n 15 >&2
      # A rejected saved login that the operator removes on the spot: pull once more.
      if ! diagnose_pull "$output" || ! output=$(dc --profile build-studio pull --quiet 2>&1); then
        die "could not pull the images."
      fi
    fi
  fi
}

ghcr_saved_login() { # Docker has credentials saved for ghcr.io (in config.json, or in its credential store)
  local config=${DOCKER_CONFIG:-$HOME/.docker}/config.json store
  [ -f "$config" ] || return 1
  grep -q '"\(https://\)\?ghcr\.io"' "$config" && return 0
  store=$(sed -n 's/.*"credsStore" *: *"\([^"]*\)".*/\1/p' "$config" | head -n1)
  [ -n "$store" ] && command -v "docker-credential-$store" >/dev/null &&
    "docker-credential-$store" list 2>/dev/null | grep -q 'ghcr\.io'
}

ghcr_anonymous() { # ghcr_anonymous REPOSITORY TAG: ok (served without signing in), missing, refused or unreachable
  local token code
  token=$(curl -sS --max-time 10 "https://ghcr.io/token?scope=repository:$1:pull" 2>/dev/null) || { printf unreachable; return 0; }
  token=$(printf '%s' "$token" | sed -n 's/.*"token" *: *"\([^"]*\)".*/\1/p')
  [ -n "$token" ] || { printf refused; return 0; }
  code=$(curl -sS -o /dev/null -I -w '%{http_code}' --max-time 10 -H "Authorization: Bearer $token" \
    -H 'Accept: application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json' \
    "https://ghcr.io/v2/$1/manifests/$2" 2>/dev/null) || { printf unreachable; return 0; }
  case $code in 200) printf ok ;; 404) printf missing ;; *) printf refused ;; esac
}

diagnose_pull() { # diagnose_pull DOCKER-OUTPUT: say why a pull failed, as far as the output and a probe tell; 0: pull again
  local output=$1 registry host tag anonymous
  registry=$(env_get CLOUD_IMAGE_REGISTRY)
  host=${registry%%/*}
  say "" >&2
  case $output in
    *"no matching manifest"*)
      say "This machine's architecture ($(uname -m)) has no published image; they are built for linux/amd64 and" >&2
      say "linux/arm64. Install with --build to build the images here." >&2 ;;
    *"manifest unknown"*|*"manifest for "*" not found"*|*": not found"*)
      say "The registry answered but does not have these images: version ${CLOUD_IMAGE_TAG:-$(env_get CLOUD_IMAGE_TAG)} is not" >&2
      say "published (yet) under $registry, or the mirror has not copied it. Check --version, or retry later." >&2 ;;
    *toomanyrequests*)
      say "The registry limits anonymous pulls from this address; wait and retry, or sign in with docker login." >&2 ;;
    *unauthorized*|*denied*)
      tag=${CLOUD_IMAGE_TAG:-$(env_get CLOUD_IMAGE_TAG)}
      if [ "$registry" = "$published_registry" ]; then
        anonymous=$(ghcr_anonymous lincyaw/presmium-cloud-api "$tag")
        if [ "$anonymous" = ok ] && ghcr_saved_login; then
          say "The images are public (ghcr.io serves them to this machine without signing in), but Docker has saved" >&2
          say "ghcr.io credentials that ghcr.io rejects (expired or revoked), and sends them instead of pulling anonymously." >&2
          say "Remove them with: docker logout ghcr.io   and run the installer again." >&2
          if [ "$assume_yes" != 1 ] && have_tty && confirm "Run docker logout ghcr.io now and pull again?"; then
            docker logout ghcr.io >&2 && return 0
          fi
        elif [ "$anonymous" = ok ]; then
          say "The images are public (ghcr.io serves them to this machine without signing in), yet Docker was refused:" >&2
          say "Docker reaches ghcr.io another way (its own proxy, https://docs.docker.com/engine/daemon/proxy/), or" >&2
          say "a credential helper supplies a rejected login (docker logout ghcr.io). Or pull through --registry." >&2
        elif [ "$anonymous" = missing ]; then
          say "ghcr.io does not have version $tag of the images: it is not published (yet). Check --version." >&2
        elif [ "$anonymous" = unreachable ]; then
          say "This machine cannot reach ghcr.io (DNS, a firewall or a proxy). Pull through a mirror of $published_registry" >&2
          say "with --registry (e.g. --registry mirror.example.com/lincyaw/), or give Docker a proxy." >&2
        else
          say "ghcr.io refuses these images also without signing in; version $tag may not be published. Check --version." >&2
        fi
      else
        say "The registry refused access. A mirror says so also for an image it does not have (check --registry);" >&2
        say "a private mirror may need: docker login $host" >&2
      fi ;;
    *)
      if [ -n "$host" ] && ! curl -sS -o /dev/null --max-time 10 "https://$host/v2/" 2>/dev/null; then
        say "This server cannot reach $host over HTTPS (DNS, a firewall or a proxy). Pull through a mirror of" >&2
        say "$published_registry with --registry (e.g. --registry mirror.example.com/lincyaw/), or give Docker a proxy" >&2
        say "(https://docs.docker.com/engine/daemon/proxy/). Docker uses its own proxy settings, not this shell's." >&2
      else
        say "The output above names the image that failed. Images other than presmium-cloud-* come from Docker Hub;" >&2
        say "if Docker Hub is unreachable, set registry-mirrors in /etc/docker/daemon.json." >&2
      fi ;;
  esac
  return 1
}

wait_healthy() {
  local deadline=$(( $(date +%s) + 900 )) line service state health code pending last=
  step "Waiting for the services (the first start of the sign-in service takes a minute or two)"
  while :; do
    pending=
    while IFS='|' read -r service state health code; do
      case $service in
        migrate)
          [ "$state" = exited ] && [ "$code" != 0 ] && { dc logs --tail=50 migrate >&2; die "the database migration failed"; }
          [ "$state" = exited ] || pending="$pending migrate" ;;
        storage-init) [ "$state" = exited ] && [ "$code" = 0 ] || pending="$pending storage-init" ;;
        api|hub|keycloak) [ "$health" = healthy ] || pending="$pending $service" ;;
        entrance) [ "$state" = running ] || pending="$pending entrance" ;;
      esac
    done < <(dc ps -a --format '{{.Service}}|{{.State}}|{{.Health}}|{{.ExitCode}}' 2>/dev/null)
    [ -z "$pending" ] && { say "All services are up."; return 0; }
    [ "$pending" != "$last" ] && { say "  waiting for:$pending"; last=$pending; }
    if [ "$(date +%s)" -ge "$deadline" ]; then
      for line in $pending; do dc logs --tail=40 "$line" >&2 || true; done
      die "services did not become ready within 15 minutes:$pending"
    fi
    sleep 5
  done
}

check_entrance() {
  if [ "$mode" = local ]; then
    for _ in 1 2 3 4 5 6; do
      curl -fsS -o /dev/null --max-time 5 -H "Host: app.localhost" "http://127.0.0.1:$loopback_port/ready" && return 0
      sleep 2
    done
    warn "the console does not answer on 127.0.0.1:$loopback_port yet"
  elif [ "$mode" = ip ] && [ "$tls" != acme ]; then
    for _ in $(seq 1 24); do
      curl -fsSk -o /dev/null --max-time 10 "$app_url/ready" 2>/dev/null && { say "The console answers: $app_url"; return 0; }
      sleep 5
    done
    warn "$app_url does not answer yet."
    explain_unreachable
  else
    for _ in $(seq 1 24); do
      curl -fsS -o /dev/null --max-time 10 "$app_url/ready" 2>/dev/null && { say "HTTPS works: $app_url"; return 0; }
      # The IP certificate fell back to Caddy's own.
      if [ "$mode" = ip ] && curl -fsSk -o /dev/null --max-time 10 "$app_url/ready" 2>/dev/null; then
        sleep 20
        curl -fsS -o /dev/null --max-time 10 "$app_url/ready" 2>/dev/null && { say "HTTPS works: $app_url"; return 0; }
        fallback=1
        say "The console answers at $app_url, but with Caddy's own certificate: Let's Encrypt did not issue one."
        say "  Caddy tries again when it renews (see: docker compose logs entrance)."
        return 0
      fi
      sleep 5
    done
    warn "$app_url does not answer over HTTPS yet."
    explain_unreachable
  fi
}

explain_unreachable() { # why the address does not answer over HTTPS from this machine, as far as this machine can tell
  local host port name address expected ours theirs answer
  host=${app_url#*://}; host=${host%%/*}
  port=443; case $host in *:*) port=${host##*:}; host=${host%:*} ;; esac
  name=$host address=$host
  if [ "$mode" = domain ] || [ "$mode" = sslip ]; then
    address=$(getent ahostsv4 "$host" 2>/dev/null | awk 'NR == 1 { print $1 }' || true)
    if [ -z "$address" ]; then
      warn "Reason: $host does not resolve. Add the DNS record (*.$base -> this server's public IP) and wait for it to spread."
      return 0
    fi
    if [ "$mode" = sslip ]; then expected=$ip_address; else expected=$(public_ip || true); fi
    if [ -n "$expected" ] && [ "$address" != "$expected" ]; then
      warn "Reason: DNS sends $host to $address, but this server's public IP is $expected; fix the DNS record."
      return 0
    fi
  else
    name=
  fi
  ours=$(served_certificate 127.0.0.1 "$port" "$name")
  theirs=$(served_certificate "$address" "$port" "$name")
  if [ -z "$(field id "$theirs")" ]; then
    warn "Reason: port $port of $address does not answer from this machine: it is closed by a firewall, not forwarded"
    warn "        to this server, or the network does not let a machine reach its own public address."
    answer=$(http_server "$address" 80 /.well-known/acme-challenge/presmium-check)
    case $answer in
      ''|*"Server: Caddy"*) ;;
      *) warn "        Port 80 of $address is answered by another device ($answer): a router or gateway holds this address." ;;
    esac
  elif [ "$(field id "$theirs")" != "$(field id "$ours")" ]; then
    warn "Reason: another device answers on $address:$port, with a certificate for $(field subject "$theirs")"
    warn "        (issued by $(field issuer "$theirs")): a gateway or NAT. Certificates cannot be issued for it here."
    [ "$mode" = ip ] || warn "        This server's own address works on its network: run this installer again with --ip $(primary_ipv4 || echo ADDRESS)."
  else
    warn "Reason: this server answers on $address:$port, but with Caddy's own certificate: Let's Encrypt has not issued"
    warn "        one, because it cannot reach this server from the internet."
    answer=$(http_server "$address" 80 /.well-known/acme-challenge/presmium-check)
    case $answer in
      '') warn "        Port 80 of $address does not answer: open it (and 443) to this server." ;;
      *"Server: Caddy"*) warn "        Ports 80 and 443 answer here; check that they are open from the internet (a cloud firewall)." ;;
      *) warn "        Port 80 of $address is answered by another device ($answer): forward it to this server." ;;
    esac
  fi
  warn "See: docker compose logs entrance (or: bash $install_dir/install.sh status)"
}

print_summary() {
  local admin
  admin=$(env_get CLOUD_KEYCLOAK_ADMIN)
  say ""
  say "Presmium Cloud $(env_get CLOUD_IMAGE_TAG) is running."
  say ""
  say "  Open:               $app_url   (register the first account here)"
  [ "$mode" = ip ] || say "  Studio:             $hub_url"
  say "  Accounts (admin):   $auth_url/admin/   user ${admin:-operator}, password CLOUD_KEYCLOAK_ADMIN_PASSWORD in $env_file"
  if [ "$(env_get CLOUD_KEYCLOAK_VERIFY_EMAIL)" = false ]; then
    say ""
    say "  Email is not configured: anyone who can open the address can register, without email verification,"
    say "  and there is no password recovery. To change that, set up email under Realm settings > Email in the"
    say "  account admin, then turn on Verify email (Realm settings > Login), or turn off User registration there."
  fi
  if [ "$mode" = ip ] && { [ "$tls" = internal ] || [ "${fallback:-0}" = 1 ]; }; then
    say ""
    say "  The certificate comes from this server's own CA, so browsers warn the first time: choose to continue"
    say "  (Advanced > Proceed). To trust it on a computer instead, install its root certificate from:"
    say "    docker exec $project-entrance-1 cat /data/caddy/pki/authorities/local/root.crt"
  fi
  if [ "$mode" = ip ] && [ "$scheme" = http ]; then
    say ""
    say "  Plain HTTP: passwords and sessions cross the network unencrypted, so use it only on a trusted network."
    say "  Browsers allow some features only on secure (HTTPS) pages: recording narration from the microphone and"
    say "  copying to the clipboard do not work here. Install with --ip without --http to have them."
  fi
  if [ "$mode" = local ]; then
    say ""
    say "  This trial listens on 127.0.0.1:$loopback_port only. From your own computer:"
    say "    ssh -N -L $loopback_port:127.0.0.1:$loopback_port $(id -un)@<this server>"
    say "  then open $app_url in the browser (on this machine itself, open it directly)."
  fi
  say ""
  say "  Files:              $install_dir   (.env holds every secret: keep an encrypted copy)"
  say "  Manage:             bash $install_dir/install.sh status | upgrade | uninstall"
}

# --- Shares from the MinIO object store ------------------------------------------------------------------------

legacy_objects_pending() { # the old MinIO volume exists and its objects were not copied yet
  [ "$(env_get CLOUD_LEGACY_OBJECTS_COPIED)" != 1 ] && docker volume inspect "${project}_objects" >/dev/null 2>&1
}

copy_legacy_objects() { # after the services are up: copy the shares of the MinIO volume into the current store
  legacy_objects_pending || return 0
  local volume="${project}_objects" network="${project}_data" server="${project}-legacy-objects" bucket code=0
  bucket=$(env_get CLOUD_S3_BUCKET); bucket=${bucket:-presmium}
  if ! docker image inspect "$legacy_object_store" >/dev/null 2>&1; then
    warn "the shares made before this version are in the MinIO volume $volume, but MinIO's image is not on this host"
    warn "and can no longer be downloaded, so they cannot be copied. Their readers see them as missing until the authors"
    warn "share those documents again. The volume stays until you remove it: docker volume rm $volume"
    return 0
  fi
  step "Copying the shares from the old object store ($volume)"
  docker rm -f "$server" >/dev/null 2>&1 || true
  (
    export MINIO_ROOT_USER RCLONE_CONFIG_OLD_ACCESS_KEY_ID RCLONE_CONFIG_NEW_ACCESS_KEY_ID
    export MINIO_ROOT_PASSWORD RCLONE_CONFIG_OLD_SECRET_ACCESS_KEY RCLONE_CONFIG_NEW_SECRET_ACCESS_KEY
    MINIO_ROOT_USER=$(env_get CLOUD_S3_ACCESS_KEY_ID); MINIO_ROOT_PASSWORD=$(env_get CLOUD_S3_SECRET_ACCESS_KEY)
    RCLONE_CONFIG_OLD_ACCESS_KEY_ID=$MINIO_ROOT_USER RCLONE_CONFIG_NEW_ACCESS_KEY_ID=$MINIO_ROOT_USER
    RCLONE_CONFIG_OLD_SECRET_ACCESS_KEY=$MINIO_ROOT_PASSWORD RCLONE_CONFIG_NEW_SECRET_ACCESS_KEY=$MINIO_ROOT_PASSWORD
    docker run -d --pull never --name "$server" --network "$network" --network-alias legacy-objects \
      -e MINIO_ROOT_USER -e MINIO_ROOT_PASSWORD -v "$volume:/data" "$legacy_object_store" server /data >/dev/null &&
    docker run --rm --network "$network" \
      -e RCLONE_CONFIG_OLD_TYPE=s3 -e RCLONE_CONFIG_OLD_PROVIDER=Minio -e RCLONE_CONFIG_OLD_ENDPOINT=http://legacy-objects:9000 \
      -e RCLONE_CONFIG_OLD_ACCESS_KEY_ID -e RCLONE_CONFIG_OLD_SECRET_ACCESS_KEY \
      -e RCLONE_CONFIG_NEW_TYPE=s3 -e RCLONE_CONFIG_NEW_PROVIDER=Other -e RCLONE_CONFIG_NEW_ENDPOINT=http://object-store:9000 \
      -e RCLONE_CONFIG_NEW_ACCESS_KEY_ID -e RCLONE_CONFIG_NEW_SECRET_ACCESS_KEY \
      "$object_copier" copy "old:$bucket" "new:$bucket" --config "" --retries 10 --retries-sleep 3s \
      --stats 30s --stats-one-line --stats-log-level NOTICE
  ) || code=$?
  docker rm -f "$server" >/dev/null 2>&1 || true
  if [ "$code" != 0 ]; then
    warn "copying the old shares failed; run this installer again to retry. They stay in the volume $volume."
    return 0
  fi
  env_set "$env_file" CLOUD_LEGACY_OBJECTS_COPIED 1
  say "The old shares are in the new object store. Once they open, remove the old volume: docker volume rm $volume"
}

# --- Commands ---------------------------------------------------------------------------------------------------

cmd_install() {
  check_host
  local configured=0 requested_build=$build switching=0 old_address old_url old_mode old_issuer
  local wanted_mode=$mode wanted_ip=$ip_address wanted_scheme=$scheme wanted_site_port=$site_port wanted_loopback=$loopback_port
  if [ -f "$env_file" ] && [ -n "$(env_get CLOUD_INSTALL_MODE)" ]; then
    configured=1
    load_installed
    old_mode=$mode old_url=$app_url old_address=$(describe_address)
    [ -n "$version" ] || version=$(env_get CLOUD_IMAGE_TAG)
    if [ -n "$wanted_mode" ]; then
      # An address on the command line: the same one brings the cloud up again, another one changes it in place.
      mode=$wanted_mode ip_address=$wanted_ip scheme=$wanted_scheme site_port=$wanted_site_port tls=
      # The local trial keeps its port unless --port names another.
      { [ "$mode" = local ] && [ -z "$port_given" ] && [ -n "$loopback_port" ]; } || loopback_port=$wanted_loopback
      resolve_addresses
      if [ "$mode" != "$old_mode" ] || [ "$app_url" != "$old_url" ] || { [ "$mode" = ip ] && [ "$tls" != "$(env_get CLOUD_TLS)" ]; }; then
        switching=1
        check_dns
        check_reachable
        check_ip_certificate
      fi
    fi
    if [ "$switching" = 1 ]; then
      say ""
      say "Presmium Cloud in $install_dir is set up with $old_address."
      say "Changing it to $(describe_address)."
      say "Accounts, documents, shares and secrets stay; running Studios stop, and people sign in again at the new address."
    else
      load_installed
      say "Presmium Cloud is already set up in $install_dir ($(describe_address)); bringing it up again."
    fi
    if [ "$dry_run" = 1 ]; then
      say "Dry run: would fetch $version if missing, $([ "$build" = 1 ] && echo build || echo pull) the images$([ "$switching" = 1 ] && echo ', write the new address') and start the services."
      return 0
    fi
    if [ "$switching" = 1 ]; then
      confirm "Change the address?" || die "stopped; nothing was changed"
      [ "$docker_ok" = 1 ] && entrance_running && own_ports=$(published_ports)
    fi
  else
    choose_mode
    resolve_addresses
    check_dns
    check_reachable
    check_ip_certificate
    [ -n "$version" ] || version=$(latest_version)
  fi
  [ "$configured" = 1 ] || case $project in ''|*[!a-z0-9_-]*|[!a-z0-9]*) die "--name must be lower-case letters, digits, - and _" ;; esac
  check_ports

  if [ "$dry_run" = 1 ]; then
    dry_run_install
    return 0
  fi

  mkdir -p "$install_dir"
  chmod 700 "$install_dir"
  fetch_release "$version" "$build"
  if [ "$configured" = 0 ]; then
    step "Writing the configuration"
    [ -f "$env_file" ] || bash "$release_dir/deploy/cloud/keycloak/init-env.sh" "$env_file"
    configure_env "$env_file"
  else
    [ "$(env_get CLOUD_IMAGE_TAG)" = "$version" ] || env_set "$env_file" CLOUD_IMAGE_TAG "$version"
    [ "$requested_build" = 1 ] && env_set "$env_file" CLOUD_IMAGE_REGISTRY ""
    [ "$requested_build" != 1 ] && [ -n "$registry" ] && env_set "$env_file" CLOUD_IMAGE_REGISTRY "$registry"
    if [ "$switching" = 1 ]; then
      step "Writing the new address"
      # Studios carry the old address; they start again at the new one when their authors open them.
      docker ps -aq --filter "name=^$(env_get CLOUD_INSTANCE_ID)-studio-" | xargs -r docker rm -f >/dev/null
      old_issuer=$(env_get CLOUD_OIDC_ISSUER)
      configure_address "$env_file"
      move_accounts "$old_issuer" "$(env_get CLOUD_OIDC_ISSUER)"
      [ -n "$acme_email" ] && env_set "$env_file" CLOUD_ACME_EMAIL "$acme_email"
      [ -n "$smtp_host" ] && configure_mail "$env_file"
      env_set "$env_file" CLOUD_INSTALL_MODE "$mode"
    fi
  fi
  activate_release "$version"
  dc config --quiet
  images
  step "Starting Presmium Cloud"
  dc up -d --remove-orphans
  wait_healthy
  sync_identity_addresses
  copy_legacy_objects
  check_entrance
  print_summary
}

move_accounts() { # move_accounts OLD-ISSUER NEW-ISSUER: the console knows each account by issuer and subject
  [ "$1" = "$2" ] && return 0
  local moved left
  # The issuer is the sign-in service's address; the realm and its subjects stay, so the accounts move with it.
  dc up -d --wait database >/dev/null 2>&1 || dc up -d --wait database
  moved=$(dc exec -T database psql -U presmium -d presmium -v ON_ERROR_STOP=1 -qtA -v old="$1" -v new="$2" <<'EOF'
WITH moved AS (
  UPDATE users u SET issuer = :'new' WHERE issuer = :'old'
    AND NOT EXISTS (SELECT 1 FROM users v WHERE v.issuer = :'new' AND v.subject = u.subject)
  RETURNING 1)
SELECT count(*) FROM moved;
EOF
) || die "could not move the accounts to the new address in the console's database"
  # psql replaces :'old' only in what it reads, not in -c.
  left=$(printf '%s\n' "SELECT count(*) FROM users WHERE issuer = :'old';" |
    dc exec -T database psql -U presmium -d presmium -qtA -v old="$1" || echo 0)
  say "Accounts moved to the new address: $moved."
  [ "${left:-0}" = 0 ] || warn "$left account(s) already signed in at the new address before and keep a separate, new account there."
}

sync_identity_addresses() { # the realm is imported once: point its clients and TLS requirement at the current address
  local wanted output
  wanted=$(identity_addresses "$env_file")
  [ "$(env_get CLOUD_IDENTITY_ADDRESSES)" = "$wanted" ] && return 0
  step "Pointing the sign-in service at $(env_get CLOUD_PUBLIC_URL)"
  # kcadm.sh runs in the Keycloak container with its environment: the URLs the realm is imported with.
  if ! output=$(dc exec -T keycloak bash -s 2>&1 <<'EOF'
set -eu
kcadm() { /opt/keycloak/bin/kcadm.sh "$@" --config /tmp/presmium-kcadm.config; }
trap 'rm -f /tmp/presmium-kcadm.config' EXIT
kcadm config credentials --server http://localhost:8080 --realm master \
  --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD"
client() { # client CLIENT-ID URL CALLBACK-PATH
  local id
  id=$(kcadm get clients -r presmium -q "clientId=$1" --fields id --format csv --noquotes)
  [ -n "$id" ]
  kcadm update "clients/$id" -r presmium -s "redirectUris=[\"$2$3\"]" -s "attributes.\"post.logout.redirect.uris\"=$2"
}
client "$CLOUD_OIDC_CLIENT_ID" "$CLOUD_PUBLIC_URL" /api/auth/callback
client "$CLOUD_HUB_CLIENT_ID" "$CLOUD_HUB_URL" /hub/oauth_callback
kcadm update realms/presmium -s "sslRequired=$CLOUD_KEYCLOAK_SSL_REQUIRED"
EOF
  ); then
    printf '%s\n' "$output" | tail -n 5 >&2
    warn "could not update the sign-in service (was the operator's password changed in Keycloak?). In the account admin,"
    warn "realm presmium > Clients, set the redirect URIs of $(env_get CLOUD_OIDC_CLIENT_ID) to $(env_get CLOUD_PUBLIC_URL)/api/auth/callback"
    warn "and of $(env_get CLOUD_HUB_CLIENT_ID) to $(env_get CLOUD_HUB_URL)/hub/oauth_callback; then run this installer again."
    return 0
  fi
  env_set "$env_file" CLOUD_IDENTITY_ADDRESSES "$wanted"
}

dry_run_install() {
  local work
  work=$(mktemp -d)
  # shellcheck disable=SC2064
  trap "rm -rf -- '$work'" EXIT
  install_dir_real=$install_dir
  install_dir=$work
  fetch_release "$version" 0
  bash "$release_dir/deploy/cloud/keycloak/init-env.sh" "$work/.env" >/dev/null
  configure_env "$work/.env"
  install_dir=$install_dir_real
  say ""
  say "Dry run: nothing was changed. The installer would:"
  say "  1. download $repository $version into $install_dir/releases/$version ($([ "$build" = 1 ] && echo 'full source' || echo 'deploy files'))"
  say "  2. write $install_dir/.env (mode 0600):"
  print_env "$work/.env"
  say "  3. serve these sites (Caddy, deploy/cloud/$([ "$mode" = ip ] && echo Caddyfile.path || echo Caddyfile)):"
  if [ "$mode" = local ]; then
    say "       http://app.localhost http://auth.localhost http://content.localhost http://hub.localhost on 127.0.0.1:$loopback_port"
  elif [ "$mode" = ip ]; then
    say "       $app_url/ (console), $auth_url/, $hub_url/ and $app_url/p/ (shared)"
    case $tls in
      acme) say "       certificate: Let's Encrypt (profile shortlived), else Caddy's own CA" ;;
      internal) say "       certificate: Caddy's own CA (browsers warn once)" ;;
      off) say "       plain HTTP, no certificate" ;;
    esac
  else
    say "       app.$base auth.$base content.$base studio.$base  (Let's Encrypt certificates, ports 80 and 443)"
  fi
  if [ "$build" = 1 ]; then say "  4. build the images locally"; else say "  4. pull ${registry:-$published_registry}presmium-cloud-{api,keycloak,hub,studio}:$version"; fi
  say "  5. docker compose up -d, wait for the services and print the addresses"
  if [ "$docker_ok" = 1 ]; then
    env_file_real=$env_file
    env_file=$work/.env
    if dc config --quiet; then say "Compose accepts the configuration."; fi
    env_file=$env_file_real
  fi
}

backup() {
  local stamp target volume instance
  stamp=$(date +%Y%m%d-%H%M%S)
  target="$install_dir/backups/$stamp"
  instance=$(env_get CLOUD_INSTANCE_ID)
  step "Backing up to $target"
  umask 077
  mkdir -p "$target"
  if [ -n "$(docker ps -q --filter "name=^${instance}-studio-")" ]; then
    say "Stopping the running Studios (their files stay on the users' volumes)"
    docker ps -q --filter "name=^${instance}-studio-" | xargs docker stop >/dev/null
  fi
  dc stop entrance api hub keycloak object-store
  dc exec -T database pg_dump -U presmium -d presmium -Fc >"$target/presmium.dump"
  dc exec -T identity-database pg_dump -U keycloak -d keycloak -Fc >"$target/keycloak.dump"
  for volume in "${project}_object-data" "${project}_objects" "${project}_hub-data" "${project}_entrance-data" "${project}_entrance-config" \
    $(docker volume ls -q --filter "name=^${instance}-work-"); do
    docker volume inspect "$volume" >/dev/null 2>&1 || continue
    # Written by this shell, so the archive belongs to the operator and keeps the umask.
    docker run --rm --network none --read-only -v "$volume:/data:ro" "$backup_helper" tar -C /data -cf - . \
      >"$target/$volume.tar"
  done
  cp -- "$env_file" "$target/deployment.env"
  local registry tag name
  registry=$(env_get CLOUD_IMAGE_REGISTRY)
  tag=$(env_get CLOUD_IMAGE_TAG)
  {
    printf 'version=%s\n' "$tag"
    for name in api keycloak hub studio; do
      docker image inspect --format '{{index .RepoTags 0}} {{.Id}} {{join .RepoDigests " "}}' "${registry}presmium-cloud-$name:$tag" 2>/dev/null || true
    done
  } >"$target/images.txt"
  say "Backup complete: $target"
}

restore_previous() { # EXIT trap while an upgrade has the services stopped: bring the previous version back
  local code=$?
  [ "$code" = 0 ] && return 0
  warn "the upgrade failed; starting $previous_version again"
  env_set "$env_file" CLOUD_IMAGE_TAG "$previous_version"
  ln -sfn "$previous_release" "$install_dir/current"
  release_dir=$install_dir/current
  dc up -d --remove-orphans || true
  exit "$code"
}

cmd_upgrade() {
  check_host
  [ -f "$env_file" ] && [ -n "$(env_get CLOUD_INSTALL_MODE)" ] || die "no installation in $install_dir"
  local requested_build=$build old
  load_installed
  [ "$requested_build" = 1 ] && build=1
  old=$(env_get CLOUD_IMAGE_TAG)
  [ -n "$version" ] || version=$(latest_version)
  say "Upgrading Presmium Cloud in $install_dir from $old to $version."
  say "The cloud stops for a backup of the databases and volumes, then starts on the new version."
  [ "$dry_run" = 1 ] && { say "Dry run: nothing was changed."; return 0; }
  confirm "Continue?" || die "stopped"
  fetch_release "$version" "$build"
  if [ "$build" = 1 ]; then env_set "$env_file" CLOUD_IMAGE_REGISTRY ""; elif [ -n "$registry" ]; then env_set "$env_file" CLOUD_IMAGE_REGISTRY "$registry"; fi
  # Fetch the new images first, so a failed download leaves the running version alone.
  export CLOUD_IMAGE_TAG=$version
  images
  unset CLOUD_IMAGE_TAG
  local new_release=$release_dir
  release_dir=$install_dir/current
  previous_version=$old
  previous_release=$(readlink "$install_dir/current")
  trap restore_previous EXIT
  backup
  env_set "$env_file" CLOUD_IMAGE_TAG "$version"
  release_dir=$new_release
  activate_release "$version"
  release_dir=
  step "Migrating the database"
  dc run --rm migrate
  step "Starting Presmium Cloud $version"
  dc up -d --remove-orphans
  trap - EXIT
  wait_healthy
  copy_legacy_objects
  check_entrance
  print_summary
  say "  Each Studio starts on the new version the next time its author opens it."
}

cmd_status() {
  check_host
  [ -f "$env_file" ] && [ -n "$(env_get CLOUD_INSTALL_MODE)" ] || die "no installation in $install_dir"
  load_installed
  say "Presmium Cloud $(env_get CLOUD_IMAGE_TAG) in $install_dir"
  say "  Address: $(describe_address)"
  [ "$(env_get CLOUD_IDENTITY_ADDRESSES)" = "$(identity_addresses "$env_file")" ] ||
    say "  The sign-in service still has an earlier address; run: bash $install_dir/install.sh"
  say ""
  dc ps -a --format 'table {{.Service}}\t{{.Status}}'
  say ""
  local studios
  studios=$(docker ps --filter "name=^$(env_get CLOUD_INSTANCE_ID)-studio-" --format '{{.Names}}  {{.Status}}')
  if [ -n "$studios" ]; then say "Running Studios:"; printf '%s\n' "$studios" | sed 's/^/  /'; else say "No Studio is running."; fi
  say "User volumes: $(docker volume ls -q --filter "name=^$(env_get CLOUD_INSTANCE_ID)-work-" | wc -l)"
  if legacy_objects_pending; then
    say ""
    say "The shares made with MinIO (up to 1.0.0-rc.129) are still in the volume ${project}_objects, not in the"
    say "current object store; copy them with: bash $install_dir/install.sh"
  fi
}

cmd_uninstall() {
  check_host
  [ -f "$env_file" ] && [ -n "$(env_get CLOUD_INSTALL_MODE)" ] || die "no installation in $install_dir"
  load_installed
  local instance answer registry tag name
  instance=$(env_get CLOUD_INSTANCE_ID)
  if [ "$purge" = 1 ]; then
    say "This deletes Presmium Cloud in $install_dir with ALL documents, accounts and shares (every volume)."
    say "Backups in $install_dir/backups stay."
    if [ "$assume_yes" != 1 ]; then
      answer=$(ask "Type the name '$project' to delete everything: ")
      [ "$answer" = "$project" ] || die "stopped; nothing was deleted"
    fi
  else
    confirm "Stop Presmium Cloud in $install_dir? Documents, accounts and settings stay." || die "stopped"
  fi
  step "Stopping the Studios and the services"
  docker ps -aq --filter "name=^${instance}-studio-" | xargs -r docker rm -f >/dev/null
  if [ "$purge" = 1 ]; then
    dc --profile build-studio down -v --remove-orphans
    docker volume ls -q --filter "name=^${instance}-work-" | xargs -r docker volume rm >/dev/null
    docker volume ls -q --filter "name=^${instance}-runtime-" | xargs -r docker volume rm >/dev/null
    docker volume rm "${project}_objects" >/dev/null 2>&1 || true
    docker network rm "${project}-studios" >/dev/null 2>&1 || true
    registry=$(env_get CLOUD_IMAGE_REGISTRY)
    tag=$(env_get CLOUD_IMAGE_TAG)
    for name in api keycloak hub studio; do docker image rm "${registry}presmium-cloud-$name:$tag" >/dev/null 2>&1 || true; done
    rm -rf -- "$install_dir/releases" "$install_dir/current" "$install_dir/install.sh" "$env_file"
    say "Deleted. Remaining: $install_dir/backups (if any)."
  else
    dc --profile build-studio down --remove-orphans
    say "Stopped. The data volumes and $install_dir stay; start again with: bash $install_dir/install.sh"
  fi
}

main() {
  command=install
  install_dir=${HOME:?}/presmium-cloud
  # The copy in an installation directory manages that installation by default.
  local own
  own=$(dirname -- "${BASH_SOURCE[0]:-}")
  if [ -f "${BASH_SOURCE[0]:-}" ] && [ -f "$own/.env" ] && grep -q '^CLOUD_INSTALL_MODE=' "$own/.env" 2>/dev/null; then
    install_dir=$(cd -- "$own" && pwd)
  fi
  mode='' domain='' ip_address='' loopback_port=18787 site_port='' scheme=https tls='' port_given='' acme_email='' version=''
  build=0 source_tarball='' registry='' project=presmium-cloud fallback=0
  smtp_host='' smtp_port=587 smtp_user='' smtp_password='' smtp_from=''
  assume_yes=0 dry_run=0 purge=0 docker_ok=0 release_dir='' base='' app_url='' auth_url='' content_url='' hub_url=''
  case ${1:-} in install|upgrade|status|uninstall) command=$1; shift ;; esac
  while [ $# -gt 0 ]; do
    case $1 in
      --domain) mode=domain; domain=${2:?--domain needs a value}; shift ;;
      --domain=*) mode=domain; domain=${1#*=} ;;
      --ip|--sslip) mode=${1#--}; if [ $# -gt 1 ] && valid_ipv4 "$2"; then ip_address=$2; shift; fi ;;
      --ip=*|--sslip=*) mode=${1%%=*}; mode=${mode#--}; ip_address=${1#*=} ;;
      --http) scheme=http ;;
      --local) mode=local ;;
      --port) port_given=${2:?--port needs a value}; shift ;;
      --email) acme_email=${2:?--email needs a value}; shift ;;
      --smtp-host) smtp_host=${2:?}; shift ;;
      --smtp-port) smtp_port=${2:?}; shift ;;
      --smtp-user) smtp_user=${2:?}; shift ;;
      --smtp-password) smtp_password=${2:?}; shift ;;
      --smtp-from) smtp_from=${2:?}; shift ;;
      --dir) install_dir=${2:?--dir needs a value}; shift ;;
      --version) version=${2:?--version needs a value}; version=${version#v}; shift ;;
      --build) build=1 ;;
      --source) source_tarball=${2:?--source needs a value}; shift ;;
      --registry) registry=${2:?--registry needs a value}; shift ;;
      --name) project=${2:?--name needs a value}; shift ;;
      --yes|-y) assume_yes=1 ;;
      --dry-run) dry_run=1 ;;
      --purge) purge=1 ;;
      -h|--help|help) usage; exit 0 ;;
      *) usage >&2; die "unknown option: $1" ;;
    esac
    shift
  done
  if [ -n "$port_given" ]; then
    case $port_given in *[!0-9]*) die "--port must be a number" ;; esac
    [ "$port_given" -ge 1 ] && [ "$port_given" -le 65535 ] || die "--port must be between 1 and 65535"
    case $mode in local) loopback_port=$port_given ;; ip) site_port=$port_given ;; *) die "--port goes with --local or --ip" ;; esac
  fi
  if [ "$scheme" = http ]; then
    [ -n "$mode" ] || mode=ip
    [ "$mode" = ip ] || die "--http goes with --ip"
  fi
  if [ -n "$registry" ]; then
    registry=${registry#https://}
    registry=${registry%/}/
    case $registry in /|*[!A-Za-z0-9./:_-]*) die "--registry must be an image name prefix such as mirror.example.com/lincyaw/" ;; esac
  fi
  case $install_dir in /*) ;; *) install_dir=$PWD/$install_dir ;; esac
  case $source_tarball in ''|*://*|/*) ;; *) source_tarball=$PWD/$source_tarball ;; esac
  env_file=$install_dir/.env
  if [ "$command" = install ] && [ -z "$mode" ] && [ "$assume_yes" = 1 ] && ! [ -f "$env_file" ]; then
    die "--yes needs an address: --domain DOMAIN, --ip, --sslip or --local"
  fi
  "cmd_$command"
}

main "$@"
