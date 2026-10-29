# Tenant seccomp policy

`moby-default.json` is the unmodified [Moby default seccomp policy](https://github.com/moby/profiles/blob/4b8214fc4971e06172938a1f1554ccff6647ee80/seccomp/default.json), pinned to that commit. `policy.json` records its SHA-256 and the derived policy's SHA-256. Moby profiles are distributed under Apache-2.0.

`runtime.json` retains the default `SCMP_ACT_ERRNO` action, architecture map, capability conditions and every syscall rule except the unrestricted `ioctl` allowance. It replaces that allowance with 28 single-comparison `SCMP_CMP_MASKED_EQ` rules for the complement of two command families:

- `0x5820`: `FS_IOC_FSSETXATTR`, which can change the XFS project ID and inheritance.
- `0x6602`: `FS_IOC_SETFLAGS`, which can clear project inheritance.

The comparison masks the command's low 16 bits (type and number), so native and compat sizes, different direction encodings, and nonzero upper syscall-argument bits cannot bypass it. This intentionally blocks every encoding of those two families. All other ioctl command families remain available, including terminal ioctls and `FS_IOC_FSGETXATTR`.

libseccomp permits each syscall argument to be compared only once per rule. Multiple `NE` comparisons on ioctl's request argument are therefore invalid; separate `NE` allowance rules would instead form a union and permit the forbidden commands. The prefix complement uses one comparison per rule and has been checked against all 65536 low-bit command values.

`runtime-seccomp.ts` verifies the fixed digest before supplying the policy through Docker's public `SecurityOpt`. Every tenant container must use that option together with `CapDrop: ['ALL']` and `no-new-privileges`. The storage initializer uses the same file and native, capability-free default-deny rules through libseccomp, executes permitted and denied ioctl calls, verifies inheritance, then performs real block and inode quota probes. Pool manifests bind every slot to the policy digest. Unsupported hosts or policy changes fail closed; there is no unconfined mode or ordinary-volume fallback.

Policy updates require reviewing the upstream change, regenerating the derivative, updating the fixed digests in the runtime and provision loader, and provisioning or explicitly revalidating the complete pool with real kernel probes. Replacing the JSON alone deliberately prevents startup.
