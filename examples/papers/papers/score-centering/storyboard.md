# Score Centering：详细解析分镜

## A. 简报与约束
长篇中文论文教学动画。观众了解语言模型、概率和基本梯度下降，但不要求熟悉策略梯度。目标：亲手算出漂移、理解逐前缀去均值、能读懂 top-k 与组合损失，并按正确指标判断实验证据。用户原话：“做详细的视频，越详细越好。不受时间的限制”。因此取消系列三到六分钟限制，按解释需要安排，禁止凑时长。沿用翰林院传达室品牌、首帧完整封面且无字幕，正文有配音字幕。方法演示必须逐步操作，不能用结论卡替代。
论文：Martin Marek、Max Ryabinin，Together AI，arXiv:2609.20807v1（2026-09-17）。原文与五张图来源于 .cache/2609.20807/source。论文源码只读素材。

## B. 论点
看完后，观众明白训练与采样不一致会在每个前缀产生持续偏移，因为他们看到了相同 token 的加权 score 从相抵到失衡，并看到了减去该前缀平均 score 后恢复零均值、保留奖励相关信号。
问题链：为什么不同引擎不一致 → 为什么恒定奖励仍更新 → 为什么偏移累积 → 为什么组内奖励归零不够 → 怎么中心化 score → 怎么落到损失与 top-k → 怎样与 IS 组合 → 实验支持哪些条件。
ABT：高吞吐采样有价值，但是采样与训练分布的小偏差会循环积累，因此在更新中显式去掉平均 score，而在明显滞后时同时使用 IS 校正分布。

## C. 中心画面与参考
中心例子：固定前缀，词表 A/B。训练分布 p=(0.5,0.5)，采样分布 q=(0.6,0.4)，参数为 A 的二分类 logit。s_A=0.5，s_B=-0.5。同策略平均0，异策略平均0.1。中心化后 score 为0.4和-0.6，加权平均0。所有这些是教学算例，由 scenes/data/derive.py 重算，不是论文测量值。
参考：papers/hinted-scaling-laws/scenes/hint.ts、problem.ts；已取 hint 的0/3/7/12秒原生MCP画面。其操作是同一组词逐个填色、相同模型点移动到新纵轴、点阵逐次映射为曲线。沿用稳定身份、固定空间、先具体再抽象、结果在操作后出现；不只复制配色。
参考证据独立保存：/Users/lincyaw/.cache/presmium/serve/daa57d16a467129a/captures/retained/2026-11-16T06-47-13-484Z-e6814b84-67b8-4207-bfb0-ecc13a7169a5/capture.json
色彩：采样 q 与 SC 蓝色（原图SC #4C72B0），训练 p 中性色，漂移珊瑚色 #C65D4A，信号青色 #087F78，TIS橙色 #DD8452，PG绿 #55A868，中心化紫色使用主题强调。保留图例和语义，训练与采样不用相同形状。
空间：品牌顶端；主体 y=16..68cqh；两行字幕下缘区域。公式不挤成长行，分步展开。全片无装饰粒子、无整屏卡片轮换。

## D. 术语表
|术语|首次页|定义|避免混称|
|---|---|---|---|
|采样器 q|loop|产生后续token的分布|教师（只有蒸馏类比明确时）|
|训练器 p|loop|计算log概率和梯度的分布|学生（只有蒸馏类比明确时）|
|训练与推理不一致 TIM|loop|同一前缀下p与q不同|所有噪声都叫漂移|
|前缀|score|生成当前位置之前的token序列|整条轨迹|
|score|score|log概率对模型参数的梯度向量|奖励分、准确率|
|漂移|split|平均奖励乘以q下平均score|协方差信号|
|信号|split|奖励与score的协方差|所有更新都叫真实梯度|
|组中心化|group|同一题多条回答的奖励减去组均值|逐前缀中心化|
|score中心化 SC|center|每个score减去同前缀q加权平均score|奖励中心化|
|重要性采样 IS|is|用p/q重新加权|SC完全恢复p分布|
|top-k头部 H|topk|采样器概率最大的k个token|按训练器选top-k|
|尾部 T|tail|不在H里的token|直接丢掉尾部|
|停止梯度 sg|loss|前向值保留、反向不通过系数求导|删除该项|

## E. 依据与数字
理论：§4 eq3..5；实现：§4.1和附录A.1..A.3；实验统一目标与种子、训练/验证指标：§5和附录B。
图2与图3是留出评测准确率；图1、图4、图5是训练准确率。阴影±1标准误，不叫标准差。
30B轻量化：FP8设置PG稳定达58%；FP4 KV：SC52%、TIS51%；INT8 W/A+INT4 KV：SC30%、TIS12%、其余结束<5%，是训练准确率（§5.4），不概括为通用基准提升。
滞后：采样器每64个训练步更新一次，不是“最大允许64”。
top-k：默认128，32在所测设置表现相当；JAX同硬件额外墙钟时间在1%以内，未测vLLM/SGLang开销。
存储例子：152000*4字节=608000字节/token；1024*32768*608000约20.4TB（十进制）。
全词表SC严格消漂移；top-k是近似，残余偏差依赖真实尾部与重建尾部的差异。严禁宣称近似全场景精确无偏。

## F. 元素设计
|对象ID|含义与形式|颜色与空间|初始状态|依据|
|---|---|---|---|---|
|trainer-p/sampler-q|两个分布条与各自引擎框|p中性左、q蓝右|p=q|§2|
|rollout-token|同一前缀产生A/B token|A圆、B方，固定身份|在q中|教学算例|
|score-A/score-B|沿单个logit坐标的正负箭头|向右正、向左负|+0.5/-0.5|sigmoid导数|
|mean-score|概率加权箭头和|珊瑚|0后为0.1|教学算例|
|drift-vector/signal-vector|更新分解|珊瑚与青色|头尾相接|eq3|
|sync-loop|训练→同步→偏差采样→再训练|同一环和参数点|第一轮|§4机制|
|prefix-branches|同题分支与各自条件均值|保留前缀身份|全组奖励均值0|§4|
|center-shift|所有score统一减去0.1|紫色平移线|原箭头|eq4|
|is-weight|每token乘p/q，罕见token长箭头|橙|原score|§2.2|
|weighted-mean|先加权再去加权均值|蓝紫|加权后箭头|A.2|
|head-tokens/tail-mass|概率柱前k项与剩余质量|头蓝尾中性|完整词表|A.1|
|tail-scale|训练尾部乘rho|橙比例尺|p尾质量|A.1|
|loss-terms|采样logp与detached修正项|score对应色|公式分解|A.3|
|code-lines|原文最小实现逐行|当前行强调|全代码可读|§4.1|
|paper-figure|论文原图|白底保持原编码|先建立坐标|fig1..5|
|figure-focus|相机与当前面板框|与当前方法一致|轴与图例|原图词坐标|
|readout|观测结果|跟配置关联|配置建立后显示|§5|
|opening/ending|品牌与总结|系列固定|完整首帧/结尾|kit|

## G. 每页状态与操作设计
下列所有页面场景接收 parameters.page 和 parameters.title；每页本地状态从0开始。实现文件 core.ts/implementation.ts/evidence.ts，非通用入场模板。每步后备时长20000ms，真实配音自动决定。操作一般0..65%发生，余下停留；具体时点随讲稿逐项校对。跨步旧主体保持到新主体建立，禁止先退场造成空白。

|页slug|状态ID（按顺序）|操作与结束画面|触发与结果时机|连续性|
|---|---|---|---|---|
|opening|cover|完整品牌与论文封面静止|首帧已有；开场有配音无字幕|转入训练循环|
|loop|task,engines,mismatch,sync|题目→q产生token→p评估；同一分布两行对齐后q柱偏移；同步箭头绕回|先题目再分工；偏移后命名TIM|保留p/q与token|
|score|prefix,derivative,vector|同一序列框定前缀；A概率曲线上的切线；切线映射成参数方向箭头|log概率变化后引入score|A/B身份固定|
|zero|equal,weighted,cancel|p=q各半；score箭头按0.5缩放；头尾拼接相抵|相抵后显示期望0|同一箭头|
|mismatch|shift,biased,constant|q从0.5/0.5变0.6/0.4；加权箭头变0.3/-0.2；合成0.1；恒定奖励1|先显示分布变化，再显示残余|p保持0.5|
|feedback|fixed,moving,accumulate|固定q教师时p靠近；动态同步把偏差带到下一轮；轨迹逐轮偏离|箭头走完后出现累计结果|同一参数点和同步环|
|split|update,identity,meaning|更新箭头拆为珊瑚漂移和青信号；公式两项匹配箭头；改变奖励关系只改变协方差|对应项逐个出现|保留合向量|
|group|group,prefix,residual|同题四回答±优势归零；沿分叉框出子前缀；子树平均非零显现|组先归零、再框条件子集|回答身份不换|
|center|mean,subtract,zero|汇总q均值0.1；两个score同减0.1；0.6*0.4+0.4*(-0.6)=0|平移完再显示0|同一A/B箭头|
|signal|reward,covariance,distribution|A奖励1/B0；原更新0.3减漂移0.06得到0.24；q协方差与p下0.25对照|奖励分配后计算，比较标签最后出现|同一双token|
|is|ratio,exact,rare,clip|p/q缩放score；加权和归零；新罕见token比率变长；上界截断后平均残余|先精确后剪裁|保持比较基线|
|compose|weighted,recenter,sanity|先w*s；汇总其q均值并整体减；精确IS时修正项0|顺序逐项演示|保留橙色权重|
|topk|vocabulary,memory,head,tail|一token扩成152K词表；存储乘至20.4TB；保留采样头部128；尾部保留质量|算完才给存储量|同一概率柱|
|tail|masses,scale,reduce,approximation|q头0.8,p头0.7，尾0.2/0.3；rho=2/3缩放p尾；用E_p[s]=0把尾和化为负头和；比较真实尾与估计尾|rho后才缩放；求和消去后最终式|尾部没有丢弃|
|loss|full,detach,gradient|全分布损失拆两项；系数sg锁住；反向箭头得到R(s-均值)|先前向再反向|系数与logp分支分开|
|code|inputs,tailratio,residual,return|原文最小实现逐行高亮；数组对应图；rho→残差→detach点积→负优势乘整体|当前行完成后对应值出现|不清空代码|
|study|controls,rewards,online|统一目标、数据与优化器的实验管线；图2先离线+1/0再在线组中心化；框定稳定性反转|原图按面板导读|保留坐标图例|
|noise|axes,severity,collapse|图3轴/图例→弱噪声→强噪声；焦点移到崩溃位置；DPPO约160/80/20|读图后才比较|同一训练步轴|
|quant|setup,curves,result|图4左：训练bf16/采样int8；框SC与组合；结果在对照建立后|先设定再曲线|与stale保留同一原图|
|stale|timeline,curves,compose|64步同步尺；图4右读曲线；组合优于纯SC并接回q下协方差|时间尺后定位曲线|左图留作缩略比较|
|scale|model,mild,medium,severe|图1：30B MoE与路由；按三面板强度移动；58%→52/51%→30/12/<5%|每个数字在对应面板建立后|三面板共用图例|
|ablation|topk,cost,seeds|图5逐面板对比32/128/full；JAX成本<1%；种子与指标分开标注|有原图证据后再给结论|不制造未测工程结论|
|practice|diagnose,integrate,validate|接回采样训练循环：记录topk和采样tokenlogp→计算修正→监控漂移/奖励/熵；按量化与滞后分支选择SC或组合；验证尾质量及长上下文|决策来自前面条件|中心循环回归|
|ending|summary|固定结尾卡：消除漂移，保留奖励信号|一句话总结与互动|静止结束|
|notes|sources|只在网页的来源、公式与指标说明|视频跳过|无配音|

## H. 验收记录
事实、布局、运行、解析动画分开记录。第一轮：已核实原文理论和五图说明；源码独立审查通过。冷读者逐张读取75张休止帧，能复述完整机制并预测q从0.6变0.7后的均值0.2、中心化分量0.3/-0.7与奖励信号0.21。发现P1：尾部缩放后未实际拼出qhat=0.8+0.2；MIS/TIS未正式定义。P2：score标题缺少log、消融只聚焦一个面板、DPPO跨面板小字。已安排逐项修正后重拍。来源页是web/notebook限定，视频按设计跳过，所以该页幻灯片空白不属于成片缺页。旧候选source93a6713ae39e7e5cde2c/codeBundle2ad575be7820a0ee-42480c05的证据随修订退役，不用来批准新候选。
先用原生MCP retain captures 取直接操作前/中/后与最终帧；倒退单独不带at；跨步取0/300/800/1500ms；核对source和codeBundle。一致候选交独立冷读者，不交源码/分镜解释。问题闭环后冻结再配音导出。
时长由真实配音决定，正文不设置minimumHoldMs。导出1920x1080/30fps/H264/AAC、中文字幕。片头不烧字幕，正文恢复。封面4:3独立设计。完整连看若工具未支持就如实标未验证。

## I. 分工
协调者：lecture.json唯一写入、共享数据、封面/片头/片尾、evidence.ts与原图、全局术语、配音导出。
core作者：只编辑scenes/core.ts，负责loop到compose（11页）。
implementation作者：只编辑scenes/implementation.ts，负责topk/tail/loss/code（4页）。
各作者先读此分镜；不改共享kit、不改lecture.json、不提交仓库、不生成配音。通过原生MCP edit_source保存自己文件。独立审阅者之后读同一候选证据。
