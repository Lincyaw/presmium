# 项目目录操作的失败保护

本片基于 `ad75f6ac`，只修已有 Web 项目管理调用的安全边界，尚未增加 MCP 项目操作、固定预检计划或新界面。它与页面新建／复制等操作不同。所有材料来自私有临时仓库，使用正式 `presmium` CLI、真实 HTTP、实际 git 及 Node owner；未访问公共服务或作者工作区，未运行模型、套件或新增 tracked tests。

## 实际问题与行为

旧 `DocumentOperations` 在文件系统操作后提交 git。真实 `.git/index.lock` 拒绝下，新建留下新目录、重命名留下已移动目录、删除留下缺失目录，HEAD 和 index 却未变化。根文稿 `dir:''` 的复制还复制了另一个文稿和工作区 YAML；删除根文稿实际移除了临时仓库的 `.git` 及其它文稿。

现在根文稿的复制／目录重命名／删除明确返回 `409 project-root-operation-unavailable`。根文稿是合法内容身份，但其项目范围仍与工作区控制文件混合；本片没有定义安全的根目录管理语义，也不宣称该能力完成。单文稿工作区沿用原有不可管理限制。

同一个 `DocumentOperations` 自身检查 editor 权限，借原 `Revisions.transaction`／git 队列和文稿锁执行。原 `DocumentWriter` 提供临时文件系统 preimage：保留真实二进制、常规文件模式和原 symlink，不跟随链接，也不建立共享字节 hardlink；优先使用公开 copy-on-write 复制。新建／移动的父目录在失败后清理。重命名还快照原遗留 Markdown relink 真正可能写入的文件，并锁相应文稿；这只保护旧行为，不把它当作规范 JSON 引用兼容。

真正开始写入后，仅在确认提交成功或文件系统恢复成功时允许清理 preimage。提交失败且 HEAD 可确认未推进时先恢复文件系统，再由原事务恢复 index。提交状态读取失败（包括 Git 返回不可确认 HEAD）时不猜测已提交或未提交，返回 `500 project-commit-state-unavailable`、`committed:'unknown'` 和相同恢复目录，并保留备份。若 HEAD 已推进，callback 正常退出事务，随后在外层报告带 `committed:true` 的读回错误，避免新 HEAD 搭配旧 index。只读验证拒绝不恢复未动过的文件：独立反例曾发现无效目标也引发文件 inode 更换／watcher rename，现已补写入标志，拒绝后保持原 inode 和零 watcher 事件。

备份最多 16,384 个目录／文件／链接项、512 MiB 逻辑字节，超限为 `413 project-backup-limit` 并带两项 limits。目录 symlink、嵌套 git 和不支持的文件种类明确拒绝；任意原生 I/O 异常仍作为真实失败处理，不被容量分类吞掉。这个备份不是另一个文稿模型。正常成功、验证拒绝及成功回滚均清理临时副本；回滚本身遇到 I/O 失败时保留完整 preimage，返回 `500 project-rollback-failed`、`committed:false` 和 `recovery.directory`。该目录权限为 0700，内部 0600 的 `recovery.json` 记录原工作区路径与编号备份的映射，供运营者核验后恢复及显式清理；服务不在失败后自动删除它。此时不能声称原路径已恢复，更不保证断电或任意文件系统故障下绝对原子。

## 真实记录

ignored 证据在 `.presmium/project-management/`，最终 SHA、阶段与清理以 `safety-final-manifest.json` 为准，不把不同材料累加成一次全绿消费者。

| 材料 | 范围 |
| --- | --- |
| `before-1793134959324/result.json`，5 项反例 | 正式 CLI＋HTTP＋Git：三种真实提交失败，以及根复制／删除。每项 `productCorrect:false`，反例记录完成不代表产品通过 |
| `after-final-1793136010624/result.json`，5/5 | 最终写入标志版本：三种提交失败恢复完整 regular／binary／link tree 和文件模式；HEAD、index、无关 dirty／staged 原字节保留；根复制／删除拒绝且全树、HEAD／index 不变 |
| `after-relink-final-1793136011776/result.json`，1/1 | 实际移动后重写工作区根 Markdown 链接，再遇 git 拒绝；原目录、链接文本、binary／symlink 和 index 完整恢复 |
| 最终 `boundaries`，5/5 | Node owner 自身 reader 拒绝、外部 symlink 父目录不写、真实嵌套 git 不移除、备份上限和无残留。容量材料是超过上限的稀疏 size-only 文件，未读取／复制其全量，不是大型媒体项目验收 |
| `rollback-recovery-1793137039163/result.json`，7/7 | 非 root 真实 Node owner；Git clean filter 在目录移动后将私有 workspace 改为只读并失败，restore 实际遇到 EACCES；另一个真实 filter 写坏自有 `.git/HEAD`，实际无法读取提交状态，明确报告 unknown 而不误称 committed。两种 typed recovery 错误均可读，完整 regular／binary／symlink preimage 仍在，index 和无关字节不变。EACCES 分支 HEAD 不变；unknown 分支先核 HEAD 文件仍被 filter 损坏，观察器再人工恢复自有 HEAD 文件，才核原 commit／index，不能称产品已恢复 HEAD；另核正常成功、普通 index.lock 回滚、验证拒绝的备份清理。保留副本经核验后由消费者显式运维清理，不冒称自动回滚成功 |
| `invalid-target-before-1793135948625.json`／`invalid-target-after-1793135970192.json`，各 2 项 | 真实文件 watcher：验证拒绝前后字节相同，但 before 改 inode 并发 change／rename；after 原 inode 不变且事件为空。两轮均为 Node 实际 owner，不启动 HTTP 服务 |

最早一次脚本误用内部 CLI，缺少 bundled web renderer，未启动服务或执行操作；另一次 Node 观察器从没有 jiti 依赖的 workspace 包解析 jiti 失败，发生在创建资源之前。两份失败日志保留，随后改用正式 CLI／正确依赖所属包。较早 after 的目录名误沿用了 `before` 前缀（`before-1793135502163`），其 `productCorrect:true` 与实际源 SHA 明示它是 after；未修改或覆盖旧 raw。

CLI after 5／relink 1 和 invalid-target after 2 属于先前冻结源。后续先补专用拒绝类型的显式字段、checkpoint lstat 仅忽略 ENOENT，再补回滚失败保留副本与 typed recovery 的最小增量。manifest 分阶段逆替换并重新算 SHA，精确还原实际运行的两源，不将 earlier CLI 记录冒称全部 final bytes。最终 recovery 7 项与最终 Node 边界 5 项另在最终两源起止 SHA 相同下通过。

类型检查最初发现新错误类的 constructor parameter-property 不符合 `erasableSyntaxOnly`，失败日志保留；改为显式字段后再运行类型检查。没有因此改运行时依赖。

每个 CLI 子进程退出、临时根目录和 checkpoint 备份清理均有记录。新增降权探针首轮因 `/root` 下 Node 路径不可访问，spawn 即 EACCES，未执行产品操作；失败 raw 保留。随后复制同一 Node 可执行文件至任务私有临时目录，实际降权运行成功，结束后连同文件删除。没有重启公共 4320／17407。未验证外部多进程 git 并发、所有文件系统元数据／ACL、全部大型工程规模或断电恢复；备份上限是明确能力门槛。

后续项目 MCP／Web 共享预检仍需固定 source tree／模板／真实 HEAD、稳定新文稿 ID、意图及删除确认、结构化跨文稿引用、成员／review／token scope 和紧凑回执。本片没有直接向 agent 暴露旧的裸 `apply`。
