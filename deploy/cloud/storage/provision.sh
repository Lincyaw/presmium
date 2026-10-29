#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C
umask 077
if [[ ${EUID} -ne 0 ]]; then printf '%s\n' 'Run as root.' >&2; exit 1; fi
if [[ $# -lt 2 || $# -gt 6 ]]; then printf '%s\n' 'Usage: provision.sh <new-directory> <instance-id> [slots=32] [slot-bytes=1073741824] [inodes=65536] [filesystem-bytes=38654705664]' >&2; exit 2; fi
for command in python3 mkfs.xfs xfs_quota losetup mount mountpoint findmnt blkid truncate stat; do command -v "$command" >/dev/null; done
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
directory=$1
instance=$2
slots=${3:-32}
slot_bytes=${4:-1073741824}
inodes=${5:-65536}
filesystem_bytes=${6:-38654705664}
if [[ ! "$directory" =~ ^/[A-Za-z0-9_./-]+$ || "$directory" == '/' || $(realpath -m "$directory") != "$directory" || -e "$directory" || -L "$directory" ]]; then printf '%s\n' 'Refusing to overwrite an existing or noncanonical directory; use mount.sh for an existing project pool.' >&2; exit 1; fi
mkdir -m 0700 -- "$directory"
python3 "$script_dir/pool.py" create "$directory" "$instance" "$slots" "$slot_bytes" "$inodes" "$filesystem_bytes"
mapfile -t metadata < <(python3 "$script_dir/pool.py" metadata "$directory")
image=${metadata[0]}
mounted=${metadata[1]}
filesystem_uuid=${metadata[2]}
(set -o noclobber; : > "$image")
chmod 0600 "$image"
truncate -s "$filesystem_bytes" "$image"
mkfs.xfs -q -f -m "uuid=$filesystem_uuid" -L presmium "$image"
mkdir -m 0755 "$mounted"
bash "$script_dir/mount.sh" "$directory" --initializing
chmod 0755 "$mounted"
mkdir -m 0755 "$mounted/slots"
proofs="$directory/quota-probes.jsonl"
(set -o noclobber; : > "$proofs")
for ((index=1; index<=slots; index++)); do
  slot=$(printf 'slot-%04d' "$index")
  project=$((10000 + index))
  target="$mounted/slots/$slot"
  mkdir -m 0700 "$target"
  chown 1000:1000 "$target"
  xfs_quota -x -c "project -s -p $target $project" "$mounted"
  # A small temporary inode limit allows a real exhaustion probe without creating 65536 files per slot.
  xfs_quota -x -c "limit -p bsoft=$slot_bytes bhard=$slot_bytes isoft=4 ihard=4 $project" "$mounted"
  python3 "$script_dir/quota-probe.py" "$target" "$slot_bytes" "$project" >> "$proofs"
  xfs_quota -x -c "limit -p bsoft=$slot_bytes bhard=$slot_bytes isoft=$inodes ihard=$inodes $project" "$mounted"
done
python3 "$script_dir/pool.py" manifest "$directory" "$proofs"
