# 根目录文稿与素材文件归属

2026-10-27，在隔离 worktree 的真实工作区、媒体服务、文件事务与 git 中验证。

工作区同时声明 `lecture.json` 和 `*/lecture.json` 时，原 `documentDirOf` 只匹配目录模式。`raw/tone.wav` 因而归到尚无 `lecture.json` 的 raw，而不属于实际存在的根文稿。严格文稿 scope 正确拒绝了潜在的跨文稿读取，却也拒绝作者自己的文件；writer 创建新音频时同样受到该归属误判影响。

现在普通文件沿路径祖先寻找最近的真实、且配置匹配的文稿入口。查找只检查祖先文件状态，不扫描整个工作区或解析所有文稿。显式 `lecture.json` 路径仍先识别其可创建目录；没有真实归属时保留原来的 prospective 规则，供模板和文稿创建使用。SourceEditor 的 Home 语义未改变，作者音频仍使用严格文稿 scope。

私有原始记录位于 `.presmium/ui-evidence/document-owner-boundaries-before.json` 与 `-after.json`。修复后的 12 项全部通过：

- 根文稿原音检查与导入经过实际媒体服务、二进制事务及 agent 历史提交，源文件字节不变。
- 真实 `.git/index.lock` 失败恢复原 JSON 并移除新二进制文件。
- 实际存在的其他文稿仍是最近归属，根文稿不能读取其音频。
- 新建具名模板保留标题和新身份，包含音频的复制保留目标文件的真实 SHA。
- 没有现存文稿入口时，先写素材再写模板的既有创建过程仍成功。

after 的 writer SHA 为 `52dcf283fc24a65e7e5358a0e35e84ade126a14cb85c9e8290ffa6a1d30e2640`，相关三份源码在运行前后一致。观测总耗时 289.14 ms，只说明这个私有消费者，不是通用性能保证；所有临时资源已清理，未调用模型或提供方。

类型、分层与 diff 轻量检查通过。未新增受版本控制的测试或运行测试套件；完整 Studio／MCP 主链另见[音频接口验证](audio-mcp-authoring-2026-10-27.md)。
