"""Load the checked-in Docker default-deny policy for a native, capability-free probe."""
import ctypes
import ctypes.util
import hashlib
import json
import os
import pathlib
import platform


ROOT = pathlib.Path(__file__).resolve().parents[3] / "packages/cloud/seccomp"
EXPECTED = "1056b00d0e3a74caec22ecbd3e14ec1e7bc005e7fcb1bc27140e88c47fae1d69"


def policy():
    source = (ROOT / "runtime.json").read_bytes()
    if hashlib.sha256(source).hexdigest() != EXPECTED:
        raise RuntimeError("The checked-in tenant seccomp policy digest differs")
    value = json.loads(source)
    if value.get("defaultAction") != "SCMP_ACT_ERRNO" or value.get("defaultErrnoRet") != 1:
        raise RuntimeError("The tenant policy must retain Docker's default-deny whitelist")
    return value


def install():
    value = policy()
    native = {"x86_64": "amd64", "aarch64": "arm64"}.get(platform.machine())
    if not native:
        raise RuntimeError("The native seccomp provision probe currently supports x86_64 and aarch64")
    library = ctypes.util.find_library("seccomp")
    if not library:
        raise RuntimeError("libseccomp is required for a real quota security probe")
    seccomp = ctypes.CDLL(library, use_errno=True)
    libc = ctypes.CDLL(None, use_errno=True)

    class Comparison(ctypes.Structure):
        _fields_ = [("arg", ctypes.c_uint), ("op", ctypes.c_uint), ("datum_a", ctypes.c_uint64), ("datum_b", ctypes.c_uint64)]

    seccomp.seccomp_init.argtypes = [ctypes.c_uint32]
    seccomp.seccomp_init.restype = ctypes.c_void_p
    seccomp.seccomp_syscall_resolve_name.argtypes = [ctypes.c_char_p]
    seccomp.seccomp_syscall_resolve_name.restype = ctypes.c_int
    seccomp.seccomp_rule_add_array.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_int, ctypes.c_uint, ctypes.POINTER(Comparison)]
    seccomp.seccomp_rule_add_array.restype = ctypes.c_int
    seccomp.seccomp_load.argtypes = [ctypes.c_void_p]
    seccomp.seccomp_load.restype = ctypes.c_int
    seccomp.seccomp_release.argtypes = [ctypes.c_void_p]
    context = seccomp.seccomp_init(0x00050001)
    if not context:
        raise RuntimeError("libseccomp could not initialize the default-deny filter")
    operators = {"SCMP_CMP_NE": 1, "SCMP_CMP_LT": 2, "SCMP_CMP_LE": 3, "SCMP_CMP_EQ": 4, "SCMP_CMP_GE": 5, "SCMP_CMP_GT": 6, "SCMP_CMP_MASKED_EQ": 7}
    kernel = tuple(map(int, platform.release().split("-")[0].split(".")[:2]))
    try:
        for rule in value["syscalls"]:
            include, exclude = rule.get("includes", {}), rule.get("excludes", {})
            if include.get("caps") or include.get("arches") and native not in include["arches"] or native in exclude.get("arches", []):
                continue
            if include.get("minKernel") and kernel < tuple(map(int, include["minKernel"].split("."))):
                continue
            if rule["action"] == "SCMP_ACT_ALLOW":
                action = 0x7FFF0000
            elif rule["action"] == "SCMP_ACT_ERRNO":
                action = 0x00050000 | rule["errnoRet"]
            else:
                raise RuntimeError("Unsupported action in the checked tenant seccomp policy")
            arguments = rule.get("args", [])
            comparisons = (Comparison * len(arguments))(*(Comparison(arg["index"], operators[arg["op"]], arg["value"], arg.get("valueTwo", 0)) for arg in arguments))
            for name in rule["names"]:
                syscall = seccomp.seccomp_syscall_resolve_name(name.encode())
                if syscall == -1:
                    continue  # Docker likewise omits names unavailable to the host's libseccomp.
                result = seccomp.seccomp_rule_add_array(context, action, syscall, len(arguments), comparisons)
                if result < 0:
                    raise OSError(-result, f"libseccomp rejected {name}")
        if libc.prctl(38, 1, 0, 0, 0) != 0:
            raise OSError(ctypes.get_errno(), "PR_SET_NO_NEW_PRIVS failed")
        result = seccomp.seccomp_load(context)
        if result < 0:
            raise OSError(-result, "The real tenant seccomp filter could not be loaded")
    finally:
        seccomp.seccomp_release(context)
    return EXPECTED, libc, seccomp.seccomp_syscall_resolve_name(b"ioctl")
