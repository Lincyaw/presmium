# CoT 与轨迹改写 · 第4—11期制作分镜总纲

授权：2026-11-14，用户要求上轮全部8篇制作视频，先存小红书草稿，再按每天一期、北京时间20:00、从明天开始安排定时发布。账号翰林院传达室，合集论文解读；原1—3期保留。

| 期数 | 已确认日期（Asia/Shanghai） | 论文标识 | 文稿 |
|---|---|---|---|
|4|2026-11-15 20:00|2602.22508v3|papers/metacognitive-agentic-editing|
|5|2026-11-16 20:00|2610.23831v1|papers/student-conditioned-traces|
|6|2026-11-17 20:00|2609.18417v1|papers/dependency-trajectory-refinement|
|7|2026-11-18 20:00|2606.16152v1|papers/quality-utility-paradox|
|8|2026-11-19 20:00|2602.02405v2|papers/expert-reasoning-dail|
|9|2026-11-20 20:00|2608.21860v1|papers/chainprune|
|10|2026-11-21 20:00|2606.21704v2|papers/cot-compression-conditions|
|11|2026-11-22 20:00|2607.14552v1|papers/answer-conditioned-cot|

## 共同视觉与叙事

参考第一期 hinted-scaling-laws 的实际逐步操作：主体保留，操作改变对象，然后展示可读结果；每篇独立机制，不能批量静态模板。细节见各篇 storyboard.md。系列片头完整封面、开场配音保留、captionVisible:false；正文字幕恢复；固定片尾；来源页仅网页。

术语：CoT=从问题到答案的中间推导；trajectory=包含推理、工具调用及结果的完整执行过程；SFT=沿给定轨迹做监督学习；蒸馏=把示范/教师监督转移给学生；改写的质量与对学生的训练效用分开。

流程：分镜及元素操作设计 → 机制动画与原图引导 → 当前版本定时操作截图/回退 → 独立冷读与问题闭环 → 冻结 → 默认火山引擎甜美桃子2.0配音（本工作流常规用量已授权）→ 1080p30有声字幕MP4 → 实际成片检查 → 独立4:3封面/简介 → 串行存草稿 → 平台定时设置及回执。定时平台不支持的范围如实记录，不误点即时发布。

## 实际交付状态

2026-11-14 15:59 Asia/Shanghai：全部8部有声字幕视频、独立封面和简介完成，均先在当前浏览器草稿箱保存并逐条核实（最终视频笔记8条），再由原草稿提交平台原生定时。笔记管理已逐条显示11月15—22日每天20:00，合集均为论文解读，平台AI合成字段均已设置。最终草稿箱为0条；这些笔记已进入平台定时管理，不能继续称为仍在草稿箱。第8—11期当时仍显示审核中，其他4条未显示该标签；不据此宣称已公开。

| 期数 | 平台ID | 平台确认（Asia/Shanghai） | 回执时状态 |
|---|---|---|---|
|4|6af81325000000001802db74|2026-11-15 20:00|已设定时|
|5|6af813c900000000160316b2|2026-11-16 20:00|已设定时|
|6|6af8140e000000002b01dc7b|2026-11-17 20:00|已设定时|
|7|6af8144a000000002a025292|2026-11-18 20:00|已设定时|
|8|6af8145f000000001802dfaf|2026-11-19 20:00|已设定时 · 审核中|
|9|6af81476000000002a00d582|2026-11-20 20:00|已设定时 · 审核中|
|10|6af8148b000000001603cd21|2026-11-21 20:00|已设定时 · 审核中|
|11|6af814a6000000001802bb31|2026-11-22 20:00|已设定时 · 审核中|

回执：[8条草稿保存](dist/xiaohongshu-eight-drafts.jpg) · [8条定时管理](dist/xiaohongshu-eight-scheduled.jpg)。每篇的详细配音、验收与发布记录在其publish.md，首帧/字幕/关键动作/早期边界及完整解码已分项记录；未连续人工听看全片。

## 实际素材

所有视频为1920×1080、30fps、H.264/AAC，烧入中文字幕；封面均1200×900。下列文件与实际上传版本一致，视频及回执留在忽略的dist，源文稿/场景/原图/当前95段配音缓存/封面随仓库保存。

第4期：[视频](papers/metacognitive-agentic-editing/dist/lecture.mp4)（9941700字节，SHA256 `3936db6bdfff2adf64dc56d1f43084f1cdb2cea3e0c1cda143806b53148e31e6`）；[封面](papers/metacognitive-agentic-editing/cover.png)（117701字节，SHA256 `e5e1ddc9778d6c28c3446d560706c91a03c19fb0a4a19df50d8a50d164aa2ea6`）；[简介与记录](papers/metacognitive-agentic-editing/publish.md)。

第5期：[视频](papers/student-conditioned-traces/dist/lecture.mp4)（9633123字节，SHA256 `06f877cf27e96d742eb0af149e9503f527fc04c16e680f9b101eebda0d6c5cc2`）；[封面](papers/student-conditioned-traces/cover.png)（116502字节，SHA256 `3224fdf65b0b125c5438fd7ed57104d3a6888991156cd400505711c30aaa72a9`）；[简介与记录](papers/student-conditioned-traces/publish.md)。

第6期：[视频](papers/dependency-trajectory-refinement/dist/lecture.mp4)（9397597字节，SHA256 `d1c9cf48211815b9c980b696a811e69f0b1ffb25a6017eadfadd41236c52cad2`）；[封面](papers/dependency-trajectory-refinement/cover.png)（119757字节，SHA256 `ecaf8edebb0939cb07bfdd31f0f6ffa8fbbd56c6357d0c24d024e61e57a15568`）；[简介与记录](papers/dependency-trajectory-refinement/publish.md)。

第7期：[视频](papers/quality-utility-paradox/dist/lecture.mp4)（9177775字节，SHA256 `d5c28fa1b24bf790f9e63dba685ed0469ea9a96630741c98a72290b6efd4d5b0`）；[封面](papers/quality-utility-paradox/cover.png)（122741字节，SHA256 `136871317c381fa16e82f833553fe13393fbec71fff443429bdf2080302abd9c`）；[简介与记录](papers/quality-utility-paradox/publish.md)。

第8期：[视频](papers/expert-reasoning-dail/dist/lecture.mp4)（9819407字节，SHA256 `f6f7f26970e264eef12c0e759df1f3d6d694369e2a30407bfe1465aa0d1f4393`）；[封面](papers/expert-reasoning-dail/cover.png)（88023字节，SHA256 `3eaf2862860df2fbeefb4176dd9c467c218aff9198f2736d846e6f13062c4d98`）；[简介与记录](papers/expert-reasoning-dail/publish.md)。

第9期：[视频](papers/chainprune/dist/lecture.mp4)（12469841字节，SHA256 `3cdf0066bd7c5bda4d8dccce58e15ab516dcdf5d5c6a0423a683361e655bf5e6`）；[封面](papers/chainprune/cover.png)（95737字节，SHA256 `dea208d64c1b8c4798b648d042eaf7e9d3192322dc0b7a508ae08d0a61bfd85e`）；[简介与记录](papers/chainprune/publish.md)。

第10期：[视频](papers/cot-compression-conditions/dist/lecture.mp4)（10134076字节，SHA256 `752d29d4786bf607e9fd813a9ec0674ed01886d9872509bb53dd29368d12ad99`）；[封面](papers/cot-compression-conditions/cover.png)（81170字节，SHA256 `6f109127c471d61053b296413792a9c1a27151efbba365082078b230ec6f56b0`）；[简介与记录](papers/cot-compression-conditions/publish.md)。

第11期：[视频](papers/answer-conditioned-cot/dist/lecture.mp4)（11004532字节，SHA256 `cacecf018bcda296d61caf04d8ca27223234c830e008210364a72ec565e7fd08`）；[封面](papers/answer-conditioned-cot/cover.png)（84511字节，SHA256 `1d826a7a6b90371703588113f3db426b6c4fd79834b1430ca1bee0a93f3624a1`）；[简介与记录](papers/answer-conditioned-cot/publish.md)。

## 流程与验证

12篇论文工作区网页真实构建通过；本批8篇源码检查无内容问题，完成独立冷读、操作定时预演、正式配音和实际媒体抽样验收。修复了正文转场的提前退场、初始主体等待、数值/图例可读性和机制示意等问题，未改动共享品牌入场。未运行测试套件。

原生MCP执行文稿与场景保存、检查、截图和正式视频任务。当前旧主机缺少capture来源/代码包绑定字段，审阅证据用本地前后SHA核对，未称作原生来源绑定；重要证据保存在各篇dist。配音MCP返回审批入口不可用时，没有改变审批策略，按既有用量授权使用官方voiceover命令，仅生成缺失缓存。导出服务使用全局串行队列，按jobId等待，不重复导出；仅取消本篇明确过期的候选。浏览器扩展直接上传缺少文件网址访问权限时，使用系统文件选择器，没有扩大扩展权限。

独立发布skill补充了批次草稿/原生定时、已提交期号与有效草稿预留的统一去重、队列恢复、早期边界检查和真实审片范围。技能结构与快速验证、差异空白检查、包结构和正式版本发布预检通过；发布结果由仓库提交与注册表确认。
