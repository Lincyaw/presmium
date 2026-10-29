import datetime
import json
import os
import pathlib
import re
import stat
import subprocess
import sys
import uuid
from seccomp_policy import EXPECTED, policy


def fail(message):
    raise RuntimeError(message)


def directory(value):
    if not re.fullmatch(r"/[A-Za-z0-9_./-]+", value) or value == "/" or os.path.realpath(value) != value:
        fail("The pool directory must be a canonical absolute path without symlinks or spaces")
    path = pathlib.Path(value)
    metadata = path.lstat()
    if not stat.S_ISDIR(metadata.st_mode) or metadata.st_uid != 0 or metadata.st_mode & 0o022:
        fail("The pool directory must be root-owned and not group/world writable")
    return path


def immutable_json(path, value):
    source = (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o444)
    with os.fdopen(fd, "wb") as output:
        output.write(source)
        output.flush()
        os.fsync(output.fileno())
    os.chmod(path, 0o444)


def owner(value):
    path = directory(value)
    marker = path / ".presmium-runtime-storage.json"
    fd = os.open(marker, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd) as source:
        metadata = os.fstat(source.fileno())
        if metadata.st_uid != 0 or metadata.st_mode & 0o222 or metadata.st_nlink != 1:
            fail("Invalid project ownership marker")
        data = json.load(source)
    if data.get("version") != 1 or data.get("directory") != str(path) or not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,40}", data.get("instanceId", "")):
        fail("This directory is not a Presmium runtime pool")
    return path, data


def image(value):
    path, data = owner(value)
    target = path / "filesystem.img"
    metadata = target.lstat()
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != 0 or metadata.st_nlink != 1 or metadata.st_mode & 0o077 or metadata.st_size != data["filesystemBytes"]:
        fail("Refusing an image not owned exclusively by this pool")
    actual = subprocess.check_output(["blkid", "-p", "-s", "UUID", "-o", "value", str(target)], text=True).strip()
    if actual != data["filesystemUuid"]:
        fail("Filesystem UUID differs from the ownership marker")
    return path, data


def verify(value):
    policy()
    path, data = image(value)
    mounted = path / "mount"
    response = json.loads(subprocess.check_output(["findmnt", "--json", "--mountpoint", str(mounted), "--output", "UUID,FSTYPE,OPTIONS,TARGET"], text=True))
    entries = response.get("filesystems", [])
    if len(entries) != 1 or entries[0].get("uuid") != data["filesystemUuid"] or entries[0].get("fstype") != "xfs":
        fail("The pool's own XFS image is not mounted")
    options = entries[0].get("options", "").split(",")
    if not ({"prjquota", "pquota"} & set(options)) or "pqnoenforce" in options:
        fail("XFS project quota enforcement is not enabled")
    manifest = mounted / "pool.json"
    fd = os.open(manifest, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd) as source:
        metadata = os.fstat(source.fileno())
        if metadata.st_uid != 0 or metadata.st_mode & 0o222 or metadata.st_nlink != 1:
            fail("The verified manifest is not immutable root-owned data")
        pool = json.load(source)
    if pool.get("filesystemUuid") != data["filesystemUuid"] or pool.get("instanceId") != data["instanceId"] or pool.get("hostRoot") != str(mounted) or len(pool.get("slots", [])) != data["slotCount"] or pool.get("seccompPolicySha256") != EXPECTED:
        fail("The verified manifest differs from the owned pool")
    for slot in pool["slots"]:
        if slot.get("probe", {}).get("seccompPolicySha256") != EXPECTED:
            fail("A slot was not probed under the checked tenant seccomp policy")
        target = mounted / slot["path"]
        metadata = target.lstat()
        quota = os.statvfs(target)
        if not stat.S_ISDIR(metadata.st_mode) or metadata.st_uid != 1000 or quota.f_blocks * quota.f_frsize > slot["bytes"] or not 0 < quota.f_files <= slot["inodes"]:
            fail("A slot is not covered by its recorded block/inode quota")
    return path, data, pool


if os.geteuid() != 0:
    fail("Run the storage provisioning command as root")
command, value, *arguments = sys.argv[1:]
if command == "create":
    policy()
    path = directory(value)
    instance, count, slot_bytes, inodes, filesystem_bytes = arguments
    count, slot_bytes, inodes, filesystem_bytes = map(int, (count, slot_bytes, inodes, filesystem_bytes))
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,40}", instance) or not 1 <= count <= 256 or not 64 * 1024**2 <= slot_bytes <= 64 * 1024**3 or slot_bytes % 4096 or not 16 <= inodes <= 1_000_000 or not count * slot_bytes + 1024**3 <= filesystem_bytes <= 1024**4:
        fail("Invalid fixed pool dimensions")
    if any(path.iterdir()):
        fail("Refusing a nonempty pool directory")
    immutable_json(path / ".presmium-runtime-storage.json", {"version": 1, "directory": str(path), "instanceId": instance, "slotCount": count, "slotBytes": slot_bytes, "slotInodes": inodes, "filesystemBytes": filesystem_bytes, "filesystemUuid": str(uuid.uuid4())})
elif command == "metadata":
    path, data = owner(value)
    for result in (str(path / "filesystem.img"), str(path / "mount"), data["filesystemUuid"], data["filesystemBytes"]):
        print(result)
elif command == "manifest":
    path, data = image(value)
    results = [json.loads(line) for line in pathlib.Path(arguments[0]).read_text().splitlines()]
    if len(results) != data["slotCount"]:
        fail("Not every slot has a real quota probe result")
    slots = []
    for index, result in enumerate(results, 1):
        slot_id = f"slot-{index:04d}"
        if result.get("projectId") != 10000 + index or result.get("blockErrno") not in ("EDQUOT", "ENOSPC") or result.get("inodeErrno") not in ("EDQUOT", "ENOSPC") or result.get("projectEscapeBlocked") is not True or result.get("seccompPolicySha256") != EXPECTED:
            fail("A quota or project-inheritance probe failed")
        slots.append({"id": slot_id, "path": f"slots/{slot_id}", "projectId": 10000 + index, "bytes": data["slotBytes"], "inodes": data["slotInodes"], "probe": result})
    manifest = path / "mount/pool.json"
    immutable_json(manifest, {"version": 1, "instanceId": data["instanceId"], "hostRoot": str(path / "mount"), "filesystemUuid": data["filesystemUuid"], "filesystemBytes": data["filesystemBytes"], "seccompPolicySha256": EXPECTED, "verifiedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "slots": slots})
    try:
        verify(value)
    except Exception:
        manifest.unlink()
        raise
    print(json.dumps({"verified": True, "hostRoot": str(path / "mount"), "slots": len(slots), "slotBytes": data["slotBytes"]}))
elif command == "verify":
    _, data, _ = verify(value)
    print(json.dumps({"verified": True, "instanceId": data["instanceId"], "slots": data["slotCount"]}))
else:
    fail("Unknown storage command")
