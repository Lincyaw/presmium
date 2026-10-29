#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C
if [[ ${EUID} -ne 0 ]]; then printf '%s\n' 'Run as root.' >&2; exit 1; fi
if [[ $# -lt 1 || $# -gt 2 || ${2:-} != '' && ${2:-} != '--initializing' ]]; then printf '%s\n' 'Usage: mount.sh <owned-pool-directory> [--initializing]' >&2; exit 2; fi
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
directory=$1
mapfile -t metadata < <(python3 "$script_dir/pool.py" metadata "$directory")
if [[ ${#metadata[@]} -ne 4 ]]; then exit 1; fi
image=${metadata[0]}
mounted=${metadata[1]}
filesystem_uuid=${metadata[2]}
if [[ ! -f "$image" || -L "$image" || $(stat -c %u "$image") != 0 || $(stat -c %s "$image") != "${metadata[3]}" ]]; then printf '%s\n' 'Refusing an unowned or changed image.' >&2; exit 1; fi
if [[ $(blkid -p -s UUID -o value "$image") != "$filesystem_uuid" ]]; then printf '%s\n' 'Filesystem UUID mismatch.' >&2; exit 1; fi
if mountpoint -q "$mounted"; then
  if [[ $(findmnt -n --mountpoint "$mounted" -o UUID) != "$filesystem_uuid" ]]; then printf '%s\n' 'Refusing a mount belonging to another filesystem.' >&2; exit 1; fi
else
  if [[ -L "$mounted" || ! -d "$mounted" || -n $(find "$mounted" -mindepth 1 -maxdepth 1 -print -quit) ]]; then printf '%s\n' 'Mountpoint must be an empty owned directory.' >&2; exit 1; fi
  mapfile -t devices < <(losetup --associated "$image" --noheadings --output NAME)
  if [[ ${#devices[@]} -gt 1 ]]; then printf '%s\n' 'The image has multiple loop devices; refusing ambiguous mounting.' >&2; exit 1; fi
  if [[ ${#devices[@]} -eq 1 ]]; then device=${devices[0]}; else device=$(losetup --find --show "$image"); fi
  mount -t xfs -o prjquota,nodev,nosuid "$device" "$mounted"
fi
if [[ ${2:-} != '--initializing' ]]; then python3 "$script_dir/pool.py" verify "$directory"; fi
