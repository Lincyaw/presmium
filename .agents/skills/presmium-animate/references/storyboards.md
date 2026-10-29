# Storyboards to start from

Filled-in worksheets (`story.md`, "Storyboard the rest frames first") for common scenarios, to copy and adapt. Each gives the audience, the length and why, the thesis, the central picture and the narrative shape, then one row per step: the time, the rest frame (what the still shows; it is also the slide), what moves, what the viewer now understands, the narration (zh-CN; "—" when silent) and why. Pitfalls follow. Numbers marked as sourced were checked against the source named; recheck them when you build, and label anything you didn't compute 示意 or 估算. Only the flow-matching piece is built (`gallery/story`); the others are plans.

| Scenario | Storyboards |
|---|---|
| General | binary search (10 s), herd immunity (60 s), the worksheet filled for a cache (30 s) |
| Popular science | why the sky is blue (60 s), mRNA vaccines (5 min), Monty Hall (60 s), the greenhouse effect (5 min), how big a black hole is (3 min), GPS and relativity (3 min) |
| Papers | NeRF teaser (30 s), ImageNetV2 (3 min), FlashAttention (5 min), a thesis talk (3 min), universal approximation (2.5 min), a Transformer ablation (90 s) |
| Courses | Dijkstra (5 min), a visual proof (4 min), gradient descent (5 min), list aliasing (4.5 min), retransmission (4.75 min), series circuits (4.3 min) |
| Data, news, history | UK coal (30 s), the CO₂ race (60 s), the income mountain (60 s), half of humanity in a circle (30 s), how smallpox was ended (3 min), how hot by 2100 (3 min), how much is a billion (30 s) |
| Products and systems | a launch spot (30 s), a product explainer (60 s), a feature tutorial (90 s), a vector database in 100 s, the life of one request (150 s), an API demo (60 s) and a release highlight (45 s) |

## General

### Binary search, 10 s

An algorithms course or a promo atom, for first-year students who can search a list but don't see why halving is fast. **Thesis**: 看完后，观众明白每个是非问题都丢掉剩下的一半，因为他们看到 1024 本书的书架十刀之后只剩一本。**Picture**: 1024 thin bars; a question is a cut at the middle, the discarded half sinks and dims; 剩 N counts the lit bars and ten pips count the questions. **Shape**: ABT compressed.

| Time | Rest frame | What moves | Understands | Narration | Why |
|---|---|---|---|---|---|
| 0–2 s | 1024 grey bars, "?", 剩 1024, ten empty pips | a mask uncovers the shelf | many; one is wanted | 一架书，找一本。 | the encoding and the stakes |
| 2–4 s | right half sunk, 剩 512, one pip | a cut drops at the middle, then that half sinks | one question removes half | 问一次，丢掉一半。 | the first round slow, so the rule is learned |
| 4–7.5 s | one lit bar, 剩 1, ten pips, a faint tick where each cut fell | rounds 2–10, each shorter (0.6 → 0.15 s); the camera follows the lit range | halving converges fast | — | accelerating rounds mean converging; the ticks keep the rhythm in the still |
| 7.5–10 s | zoomed out: one gold sliver, "10 次" | zoom out, the pips glow once | ten questions instead of up to 1024 | 十次，不是一千次。 | the payoff held 2 s |

Pitfalls: no log₂ on screen, the pips are the proof; the target never moves.

### Herd immunity, 60 s

Public health, for adults who think a vaccine protects only the person who has it. **Thesis**: 看完后，观众明白免疫的人足够多时，疫情会自己熄灭，连没打疫苗的人也受保护，因为他们看到同一点火星在一群人里烧遍、在另一群人里熄灭。**Picture**: 400 dots on a contact network where everyone has exactly three lines, so "each case infects three" is visible; grey can catch it, a blue shield is immune, red is infected; readouts 感染 N% and 平均再传 R, computed from the seeded model (示意模型 R = 3). **Shape**: predict first inside ABT; left is low coverage, right high. Each case reaches 3 × (1 − s): 2.1 at 30%, 0.9 at 70%; the threshold is 1 − 1/3 ≈ 67%.

| Time | Rest frame | What moves | Understands | Narration | Why |
|---|---|---|---|---|---|
| 0–6 s | the network all red, 感染 100% | one red dot spreads ring by ring | one case can reach everyone | 一个病人传三个，三个传九个。 | the problem as a picture in 3 s |
| 6–11 s | grey again, 30% shields, "三成接种，够吗？" | a visible rewind; shields pop in | the test is set | 如果三成人打了疫苗呢？ | the viewer predicts |
| 11–19 s | most grey dots red | the same spark routes around the shields | 30% barely helps | 病毒绕过他们，照样烧遍人群。 | contradict the naive answer first |
| 19–31 s | zoom on one red dot: two lines reach grey, one ends at a shield; 平均再传 2.1 | lines draw out, targets light, the readout counts | the number that matters | 关键是一个病人还能传给几个人。大于一，越烧越旺；小于一，自己熄灭。 | name the one quantity before the payoff |
| 31–43 s | 70% shields, a few red near the spark; the 30% run as a ghost on the left | the spark spreads a ring or two and stops | same spark, it dies; the unvaccinated are safe | 七成人免疫，火苗烧不了几步就灭了，没打疫苗的人也安全。 | same spark, other crowd, side by side |
| 43–52 s | final infected against share immune, falling to about 0 near 67% | each run drops its point; the curve draws through | there is a threshold | 传给三个人的病，大约三分之二的人免疫就够。 | generalise after the concrete |
| 52–60 s | the 70% network; "免疫的人替别人挡住了火" | a breath | the thesis | — | hold 5 s |

Pitfalls: one spark and one seed for every run, or "same spark" is a lie; shields differ from dots in shape, not only colour; the reset must read as a rewind, or the shields seem to cure; put a real disease's R and its source on screen.

### The worksheet filled: a cache, 30 s

An introductory computing course, for students who think every read from memory costs the same. Parts to name first: the reader at the desk is the processor, the library is main memory, the desk is the cache. **Thesis**: 看完后，观众明白缓存让重复读取变快，因为他们看到第二次取同一本书只要伸手到桌上。**ABT**: 处理器要读数据，而且数据在内存里；但是去内存一趟很慢；所以把刚用过的放在手边。The turn at 12 s. **Picture**: a fetch is a book token travelling a path; a time bar grows while it travels, so the bar's length is the trip; the money frame is the two bars to scale. Numbers: main memory 100 ns, L1 cache 0.5 ns (Norvig, <https://norvig.com/21-days.html>, on screen). Left is near, right is far; gold is the book being read.

| # | State | Time | Rest frame | What moves | Understands | Narration | Words | Hold | Text | Why |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | far | 0–5 s | reader, desk, library, an empty bar | the library slides in; the path draws | data lives far away | 处理器要的数据，在远处的内存里。 | with | – | – | the encoding first |
| 2 | first-read | 5–12 s | the book on the desk; a long bar, "100 ns" | the token goes and returns; the bar grows while it travels | one trip is slow | 第一次读，要跑一趟，一百纳秒。 | with | 1 s | – | the trip produces the number |
| 3 | reread | 12–18 s | a sliver under the long bar, "0.5 ns" | a hand reaches the desk | the same data again is nearly free | 再读同一本：书就在桌上。 | after | 1.5 s | – | the short bar is the surprise, so the picture comes first |
| 4 | evict | 18–24 s | four books on the desk; the oldest back on its shelf | a fifth arrives; the oldest slides back | the desk is small | 桌子不大，最久没用的放回去。 | with | 1 s | – | the same book travels back |
| 5 | payoff | 24–30 s | both bars, "200×" | they glow once, then breathe | the thesis | — | – | 3 s | 常用的放近一点 | final hold |

## Popular science

### Why the sky is blue, 60 s

The general public from 12 up, who know sunlight splits into colours. **Thesis**: 看完后，观众明白天是蓝的，是因为空气分子把短波的光往旁边弹得比红光多约 6 倍，因为他们看到被弹开的光点到达眼睛时大多是蓝的，而同一束光走过日落时的长路后只剩下红色。**Picture**: sunlight as a stream of R/G/B dots crossing tiny molecules, kicked with a probability ∝ 1/λ⁴; an eye on the ground with a tally the arriving dots fill. **Shape**: predict → reveal → transfer.

| Time | Rest frame | What moves | Understands | Narration | Why |
|---|---|---|---|---|---|
| 0–5 s | a blue sky square, "?" | the camera tilts up | the question | 空气是透明的，天为什么是蓝的？ | a gap in something familiar |
| 5–12 s | three icons: wave, dust, molecule | a 2 s ring | they commit | 是海的倒影？是灰尘？还是空气本身？先猜一个。 | the folk answers as options |
| 12–22 s | the beam split into R/G/B lanes; blue dots mid-kick, with trails | dots flow; blue ones bounce off molecules | molecules knock some light sideways | 阳光里混着各种颜色。光撞上空气分子，会被弹向四面八方。 | one dot before the law; the trail keeps the cause in the still |
| 22–32 s | the eye looking away from the sun; tally blue ≈ 6× red | kicked dots drop into the bars | the sky is the kicked light | 我们看向天空，看到的就是被弹过来的光。越偏蓝越容易被弹开，蓝光约是红光的六倍。 | the tally counts (700/450)⁴ ≈ 5.9 |
| 32–36 s | the molecule icon checked | the check lands | resolved | 答案是：空气本身。 | close the loop |
| 36–50 s | the sun on the horizon, a long beam, a red tally | the beam lengthens; blue peels off along it | same cause, longer path | 傍晚，阳光要斜穿几十倍厚的空气，蓝光一路被弹走，剩下的就是红和橙。 | transfer; air mass ≈ 38 at the horizon |
| 50–60 s | noon and sunset side by side, "同一个原因" | the two slide together | one mechanism | 蓝天和红色的夕阳是同一件事：越短的光，越容易被空气弹开。 | hold 5 s |

Pitfalls: violet is scattered even more; the sky isn't violet because sunlight has less of it and eyes are less sensitive; never say violet isn't scattered (<https://math.ucr.edu/home/baez/physics/General/BlueSky/blue_sky.html>). Molecules are neither mirrors nor dust; clouds are white (large droplets scatter all colours). The ratio depends on the wavelengths chosen; name them in a footnote. Count dots; no percentage a dot didn't produce.

### How an mRNA vaccine works, 5 min

Adults, some hesitant, who know "a vaccine is a weakened virus" and have heard "it changes your DNA". Six stations, the myth step and a history step; under 3 minutes the myth step gets squeezed. **Thesis**: 看完后，观众明白 mRNA 疫苗是一条用完即毁的信息，让自己的细胞做出病毒无害的一小块供免疫系统学习，因为他们跟着一条信息从针头走到核糖体、再到被拆掉，并看到它的路从没穿过细胞核的墙。**Picture**: the cell as a map: the cytoplasm a workshop, the nucleus a walled library of DNA, the ribosome a reading head; the mRNA a strand of four-coloured beads whose whole path is drawn as a trail; a day counter. **Shape**: a fact-first debunk around follow-the-protagonist.

| Time | Rest frame | What moves | Understands | Narration | Why |
|---|---|---|---|---|---|
| 0:00–0:20 | a syringe; its drop magnified into one strand | zoom into the drop | a vaccine can be only a message | 有一种疫苗，里面没有病毒，连病毒的碎片也没有，只有一条信息。 | the surprising fact as the hook, not the myth |
| 0:20–0:45 | timeline: Day 0 whole, Day 3 in fragments; a memory cell remains | the strand slides along and breaks | the core fact | 这条信息叫mRNA。细胞读完它，几天之内就把它拆掉；身体留下的，只是对病毒的记忆。 | the fact first |
| 0:45–1:15 | two vials: an inactivated virus (old), a strand in a fat bubble (new) | the virus greys; the bubble rolls in | how it differs | 传统疫苗把灭活或减毒的病原体送进身体。mRNA疫苗不送病毒，只送一张图纸，让我们自己的细胞照着做出病毒的一小块。 | anchor in the known |
| 1:15–1:45 | the cell map; the bubble fused; the strand loose in the cytoplasm | the bubble merges with the membrane | delivery; where the nucleus is | 疫苗打在上臂肌肉里。一层油脂小泡裹着mRNA，和细胞膜融合，把它放进细胞质。注意细胞核在这里，它有自己的墙。 | the nucleus wall in every frame from now on |
| 1:45–2:20 | a ribosome on the strand; a folded spike; a copy counter | the ribosome slides; the chain grows and folds | cells translate the message | 核糖体像读磁带一样读这条mRNA，把氨基酸一颗颗串起来，折成刺突蛋白，也就是新冠病毒表面的那根刺。只有刺，没有病毒。 | the picture produces the count |
| 2:20–2:55 | spikes on the surface; antibodies locked on; a memory cell glows | an immune cell inspects; antibodies bind | the immune system learns | 细胞把刺突摆在表面。免疫系统发现"这东西不该在这"，开始产生抗体，并记住它的样子。 | |
| 2:55–3:20 | the mRNA bar ends in days, the spike bar in weeks; memory stays | enzymes cut the strand; spikes fade | both are temporary | 几天之内，mRNA就被拆解清除；刺突蛋白最多存留几周。留下来的，是免疫记忆。 | |
| 3:20–4:00 | the strand's whole trail, never crossing the nucleus wall | the trail redraws; the wall pulses once | it cannot reach DNA | 常有人担心：它会不会改写我的DNA？看它走过的路：它从没进过细胞核，DNA在核里，它碰不到。 | the myth said once, then the fact |
| 4:00–4:35 | one bead recoloured; the alarm dark; 2005 → 2023 | an alarm flashes on the plain strand; a letter swaps | why it took decades | 难点在于，外来的mRNA会拉响身体的警报，引发炎症。2005年，卡里科和魏斯曼换掉其中一种字母，警报不再响。这篇论文曾被《自然》和《科学》拒稿，2023年获诺贝尔奖。 | both scientists in every frame |
| 4:35–5:00 | the closed nucleus; message (days) → spike (weeks) → memory; "读完即毁" | a breath | the fact again | 一条读完就销毁的信息，教会身体认出病毒。DNA始终没被碰过。 | end on the fact |

Pitfalls: the title and thumbnail carry the fact, never the myth; keep to the sourced claim ("mRNA never enters the nucleus", CDC, <https://stacks.cdc.gov/view/cdc/111218>), not "information never flows from RNA to DNA" (retroviruses do); the blueprint analogy breaks (a blueprint isn't destroyed); draw the spike detached from any virus body; efficacy numbers only with their source and date; no "completely safe".

### The Monty Hall problem, 60 s

Adults sure the answer is 50/50 (13% of 228 subjects switched; vos Savant's 1990 column drew about 10,000 letters, <https://en.wikipedia.org/wiki/Monty_Hall_problem>). **Thesis**: 看完后，观众明白换门赢的概率是 2/3，因为他们看到一个知道答案、又必须开出羊的主持人，把他打开的每扇门的机会都倒进了他留着不开的那扇，换成 100 扇门时一目了然。**Picture**: chance as sand inside doors; the opened doors drain into the kept one; then 300 seeded games drop into "stay" and "switch" bins. **Shape**: predict → exaggerate → back to three → simulate.

| Time | Rest frame | What moves | Understands | Narration | Why |
|---|---|---|---|---|---|
| 0–5 s | three doors, a hand on door 1 | the hand points | the setup | 三扇门，一扇后面是汽车，两扇后面是羊。你选了1号。 | |
| 5–10 s | the host with an eye icon; door 3 open, a goat | the eye sweeps behind the doors | the host knows and must show a goat | 主持人知道车在哪。他故意打开一扇有羊的门。 | the condition, visible |
| 10–15 s | stay and switch buttons | a 3 s ring | they commit | 换，还是不换？剩两扇门，好像一半一半。先选一个。 | voice the 50/50 |
| 15–28 s | 100 doors: yours holds one grain, the kept door a column, 99/100 | 98 doors open in an accelerating ripple, each draining into the kept one | the host's choice carries information | 换成一百扇门。你随手选一扇，中奖机会百分之一。主持人打开另外98扇羊门，偏偏留下这一扇。 | vos Savant's exaggeration |
| 28–36 s | two doors, 1/100 and 99/100 | hold | switching is obvious here | 你的门还是百分之一；它，装着其余99扇的全部机会。 | |
| 36–44 s | three doors, 1/3 and 2/3 | the grid morphs back; your door stays the same object | the same for three | 三扇门也一样：你的门三分之一，换过去是三分之二。 | keep identity |
| 44–55 s | two bins with the run's real counts | mini games drop dots, speeding up | evidence | 不信就玩300局：不换赢了一百次左右，换门赢了约两百次。 | the simulation produces the counts |
| 55–60 s | the eye and "换门 2/3" | hold | the condition matters | 关键在于：主持人知道答案，而且不能开到汽车。 | |

Pitfalls: if the host opens a door at random, the answer is 1/2; keep the eye in every rest frame; seed the simulation and show what it produced; the 98-door ripple slow enough (about 2 s) to see the eye skip one door.

### The greenhouse effect, 5 min

Adults who have heard "CO₂ traps heat like a blanket", some "CO₂ is already saturated". **Thesis**: 看完后，观众明白更多二氧化碳让地面变暖，是因为热从大约五千米高、空气很冷的地方离开地球，更多二氧化碳把这个高度抬进更冷的空气，送出去的热变少，因为他们看到逃逸层沿温度梯子往上爬、出去的光变暗、整根空气柱一起变暖直到重新平衡。**Picture**: one air column coloured by temperature (15 °C at the ground, 6.5 °C colder per km); infrared dots caught and re-emitted by CO₂ specks, escaping only above a glowing layer; a balance of sunlight in against glow out. **Shape**: predict → one picture → disturb it → re-balance.

| Time | Rest frame | What moves | Understands | Narration |
|---|---|---|---|---|
| 0:00–0:20 | two Earths: −18 °C and 15 °C | thermometers fill; the left frosts | the effect is worth 33 °C | 如果没有温室效应，地球平均是零下18度，而现在是15度。这33度，来自空气里很少的几种气体。 |
| 0:20–0:50 | a level balance, 239 W/m² | yellow dots in, red dots out | steady means in equals out | 地球每秒收到多少阳光，就得向太空送走多少热，温度才稳定。 |
| 0:50–1:10 | the column with ground, middle and top markers | a 3 s ring | they commit (most pick the ground) | 问题来了：地球的热，是从哪里离开、飞向太空的？地面？半空？还是大气顶上？ |
| 1:10–1:50 | red dots caught low; a glowing band at about 5 km | dots rise, are caught and re-emitted in every direction | heat leaves from mid-air | 对红外线来说，空气像一层雾。二氧化碳和水汽把热吸住，再向四面放出，热只能一层层往上递，直到雾足够稀才逃得出去，大约在五千米高。 |
| 1:50–2:25 | the column warm to cold, a rung per km; the band at −18 °C | the readout steps 15, 8.5, 2 … −18 | why −18 °C | 越往上越冷，每升高一千米大约降6.5度。五千米处正好是零下18度，从太空看，地球就是这个温度。 |
| 2:25–2:50 | two glowing bars, warm and bright, cold and dim | brightness follows temperature | colder emits less | 冷的东西，发出的热辐射更弱。 |
| 2:50–3:30 | more specks; the band higher and dimmer; the balance tipped | the band climbs; its glow dims | more CO₂, less heat out | 再加二氧化碳，雾更浓，热得爬得更高才逃得掉。那里更冷，送出去的热就少了：进来的多，出去的少。 |
| 3:30–4:05 | the column warmer; the band at −18 °C at its new height; the balance level | the colour warms bottom to top | the surface pays | 于是整根空气柱一起变暖，直到新高度上的逃逸层也回到零下18度。平衡回来了，地面却更热了。 |
| 4:05–4:40 | a glass greenhouse beside the column, its roof greyed | the roof fades | the name is a metaphor; "saturated" answered | "温室"只是个名字：真正的温室靠玻璃挡住热空气对流。也有人说二氧化碳早就"饱和"了，可关键不在吸收了多少，而在热从多高的地方离开。 |
| 4:40–5:00 | before and after side by side, "逃逸层升高" | a breath | the thesis | 二氧化碳越多，热离开的地方越高、越冷，地面就越暖。 |

Pitfalls: CO₂ is no mirror or lid, so re-emission arrows point every way; one escape height is an average (label the picture simplified); the band's rise for doubled CO₂ is an estimate (估算); the re-warming takes decades, so 于是, not 立刻; leave politics out.

### How big is a black hole, 3 min

The general public who know black holes from films. About 15 decades of mass at about 3 s each, five landmarks and one twist. **Thesis**: 看完后，观众明白黑洞的大小只由质量决定，每个太阳质量约 3 千米半径，因为他们看到同一个视界圆环随质量刻度从地球（9 毫米）长到 M87*（比行星轨道还大）。**Picture**: a black disc with a thin bright edge that keeps its size on screen while the world and a scale bar zoom out one power of ten at a fixed rate; a mass dial and r = 3 km × M/M☉; a marble inset in a corner. **Shape**: predict → scale journey → twist.

| Time | Rest frame | What moves | Understands | Narration |
|---|---|---|---|---|
| 0:00–0:15 | the Sun; icons Earth, city, town | a 3 s ring | the question | 如果把太阳压成黑洞，它会有多大？像地球？像一座城市？还是一个小镇？ |
| 0:15–0:40 | Earth crushed into a marble on a palm, "9 毫米" | Earth shrinks to hand scale | mass sets size; the human anchor | 先从地球开始：把整个地球压进黑洞的边界，只有9毫米，一颗弹珠大小。 |
| 0:40–1:00 | the ring over a town; 1 个太阳, 3 千米 | the dial turns ×333,000 | the Sun is 3 km | 太阳的质量是地球的33万倍，它的黑洞半径大约3千米，一个小镇那么大。 |
| 1:00–1:25 | the ring over a city; 10, 30 千米; an inset line of r against M | the dial steps 1 → 2 → 10 | the rule is linear | 质量翻一倍，半径也翻一倍。十个太阳，三十千米。 |
| 1:25–2:00 | the Sun small inside the ring; 400 万, 1200 万千米; Mercury's orbit | one decade per 3 s | the galactic centre | 银河系中心的黑洞有四百万个太阳：半径一千二百万千米，直径上能并排放下约18个太阳，大约是水星轨道半径的五分之一。 |
| 2:00–2:30 | every planet's orbit inside; 65 亿, 130 天文单位 | three more decades | M87* | M87星系中心的黑洞有65亿个太阳：半径约130个日地距离，海王星的轨道整个装得进去。 |
| 2:30–2:50 | a density gauge below air's, 估算 | the gauge falls as mass rises | bigger is less dense | 奇怪的是，黑洞越大，平均越"稀"：按边界内的体积算，M87这颗的平均密度比空气还低。 |
| 2:50–3:00 | all rings as dots on one line, "每个太阳≈3千米" | the line draws | the thesis | 黑洞的大小只看质量：每多一个太阳，半径就多约3千米。 |

Pitfalls: this is the horizon of a non-spinning hole, r = 2GM/c² (2.95 km per solar mass, <https://en.wikipedia.org/wiki/Schwarzschild_radius>); the dark disc in the EHT images is the shadow, about 2.6× larger; the density is a hook, not interior physics; keep the zoom rate constant and give landmarks holds, not slower rates.

### Why GPS needs relativity, 3 min

Smartphone users who have heard "moving clocks run slow". Without the precision link, 38 µs sounds negligible, so not 60 s. **Thesis**: 看完后，观众明白为什么 GPS 卫星的钟在发射前要先调慢，因为他们看到位置是由光的飞行时间画出来的（1 微秒 = 300 米），又看到两个效应拉扯卫星的钟（速度每天慢 7 微秒、引力每天快 45 微秒），净快 38 微秒，光走 11 公里多。**Picture**: a light ruler (circles of radius c × delay meeting at the phone; a clock error thickens a circle by 300 m per µs), then one dial with a ground hand and a satellite hand tugged by two arrows (speed left = slower, gravity right = faster). **Shape**: counterfactual with a predict step.

| Time | Rest frame | What moves | Understands | Narration |
|---|---|---|---|---|
| 0:00–0:15 | a phone map with a blue dot; satellites | the dot pulses | the question | 手机怎么知道你在哪？答案里藏着爱因斯坦。 |
| 0:15–0:50 | three circles meeting at the dot | time stamps expand at light speed | distance is light time | 每颗卫星都在广播"现在几点"。信号以光速飞来，晚到多久，就说明离它多远。三颗卫星画三个圈，交点就是你。 |
| 0:50–1:10 | one circle with a thick band; "1 微秒 = 300 米" | an error dial thickens the band | clocks must agree to tens of ns | 所以钟要极准：差一微秒，距离就差三百米。 |
| 1:10–1:25 | two clocks; faster / slower / same | a 3 s ring | they commit | 那么，卫星上的钟和地上的钟，走得一样快吗？ |
| 1:25–1:55 | the satellite hand pulled left, −7 微秒/天 | the satellite streaks; an arrow tugs | speed slows it | 卫星每秒跑将近4千米。按狭义相对论，它的钟每天慢7微秒。 |
| 1:55–2:25 | a longer arrow right, +45; the net at +38 微秒/天 | a gravity well; the second arrow; the net settles | net +38 | 可它在两万千米高处，引力更弱。按广义相对论，钟每天快45微秒。一慢一快，净快38微秒。 |
| 2:25–2:45 | after one day the band is 11 千米 wide | a day counter; the band grows | why it matters | 38微秒，光能走11公里多。不修正，误差会以每天十公里左右的速度累积。 |
| 2:45–3:00 | a factory dial, 10.23 → 10.22999999543 MHz | the dial clicks down before launch | the fix | 所以卫星上天之前，钟就被调慢一点：从10.23兆赫，调到10.22999999543。你每次打开地图，都在用相对论。 |

Pitfalls: three circles in 2-D is a simplification (a phone needs four satellites, it solves for its own clock too); 11 km a day is c × 38 µs, an estimate; keep left = slower throughout; don't say "time runs slower in space" (here it runs faster overall); precise values −7.2 and +45.8 µs/day (<https://en.wikipedia.org/wiki/Error_analysis_for_the_Global_Positioning_System>).

## Papers

Design to the venue's clock: SIGGRAPH's Fast Forward gives 20 s narrated or 10 s silent, a CHI preview 30 s with the title in the first 3–4 s and captions, ECCV summaries under 60, 90 or 120 s, a Three Minute Thesis 3:00 (a second over disqualifies), IOP video abstracts 4 minutes, Elsevier and SIGCHI video figures 5. Every number carries its table ("论文表 1") and stays inside the paper: venues treat the video as part of the record. Result first suits pieces under a minute and method or systems papers; theory opens with the puzzle, clinical abstracts with the design (credibility depends on it), a thesis talk with a human question.

### A method teaser: NeRF, 30 s

A conference preview and project page, often autoplayed muted, for vision and graphics researchers. Numbers from Mildenhall et al., ECCV 2020, Table 1; imagery 示意. **Thesis**: 看完后，观众明白 NeRF 能从一圈照片渲染出没拍过的视角，因为他们看到一条光线从网络里收集颜色和密度、变成一个像素，又看到这个视角和此前最好方法并排。**Picture**: one camera ray through the empty volume, sample dots on it, one dot queried, the dots folding into a pixel. **Shape**: result-first reveal; left the previous best, right ours. A 10-second silent cut keeps the first, third, sixth and seventh beats.

| Time | Rest frame | What moves | Understands | Narration | Why |
|---|---|---|---|---|---|
| 0–3 s | the object from a new angle; a camera on an orbit | the view orbits | this is a view | 这些画面，没有一张是拍的。 | result first |
| 3–6.5 s | a ring of photo cards with cameras; "NeRF" | cards land; the title enters | input = photos and camera positions | 输入只是一圈照片和相机位置。 | title and second shot within 5 s |
| 6.5–11.5 s | a new camera, one ray, a row of dots | the ray draws, dots appear | one pixel = one ray | 要画新视角里的一个像素，就沿光线取一串点。 | cause before effect |
| 11.5–17 s | one dot enlarged: 5 numbers → network → a colour swatch and an opacity bar | numbers fly in, the box pulses | the scene is a function | 每个点都问同一个网络：这里什么颜色，多不透明？ | only the key block gets an extra move |
| 17–21.5 s | the pixel filled | colours slide along the ray into it | rendering accumulates; comparing with photos trains it | 叠起来就是像素，和照片一比就学会了。 | closes the loop |
| 21.5–26.5 s | the same view twice, blurry and sharp; PSNR 26.05 / 31.01 ↑; "论文表 1" | bars grow from zero | same input, same view, sharper | 同一视角：左边此前最好，右边 NeRF。 | the baseline in the same picture |
| 26.5–30 s | the title card with venue and link | a breath | where to read it | — | hold 3.5 s |

Pitfalls: the network stays one box (the ray is the idea, not the 8-layer MLP); positional encoding and hierarchical sampling each need their own beat or a longer cut; the same crop window for both sides; "↑" on the metric.

### A benchmark paper: ImageNetV2, 3 min

A video abstract or a lecture section on evaluation, for people who read leaderboards. All numbers from Recht et al., ICML 2019 (<https://arxiv.org/abs/1902.10811>). A dataset video earns trust in how the data was made before its finding lands, and the finding has two halves. **Thesis**: 看完后，观众明白 ImageNet 模型在按原配方重建的测试集上掉了 11–14 个百分点，但排名几乎不变，因为他们看到每个模型都从 y = x 线上掉到它下方的一条直线上。**Picture**: a scatter with equal scales, x the original test set, y the new one, a dashed y = x. **Shape**: gap → instrument → finding.

| Time | Rest frame | What moves | Understands | Narration | Why |
|---|---|---|---|---|---|
| 0:00–0:10 | one card, "ResNet-152 78.3%" | the number rolls down to 67.0% | something drops | 同一个模型，换一批新的测试图，准确率从 78% 掉到 67%。 | one result as the hook |
| 0:10–0:30 | an x-axis with about 65 grey dots, 21% → 83% | dots land in year order | a decade measured on one test set | ImageNet 用了十年，所有进步都记在同一套测试图上。换一批图，这些进步还在吗？ | the question; axis before data |
| 0:30–1:00 | 1000 class cells; one enlarged with 10 photos | photos stream in; a vote meter fills on each | the new set follows the old recipe | 作者照原配方重收一次：同一网站、相近时间、同样的众包标注，每类十张，共一万张。 | trust in the instrument |
| 1:00–1:15 | the y-axis and the dashed y = x | the diagonal draws | if nothing changed, dots sit on it | 竖轴是新测试集。如果模型真学会了，点就该落在这条对角线上。 | the reference before the data |
| 1:15–1:45 | every dot below the line; ResNet-152 at (78.3, 67.0) | dots drop straight down, AlexNet (56.5 → 44.0) first | all lose 11–14 points | 结果：每个模型都掉了下来，11 到 14 个百分点，从 AlexNet 到最新的模型，无一例外。 | the hook's dot comes back |
| 1:45–2:10 | a fitted line, slope 1.11 | it draws | the order is kept | 但它们落在一条直线上，排名几乎不变。斜率比 1 还大：旧榜上每进一步，新图上进得更多。 | the second half |
| 2:10–2:30 | the band between diagonal and fit shaded | it fills | a shift in the data, not overfitting | 所以这十年不是在背题。差距来自新图稍微更难，原因可能藏在标注的细微差别里。 | the paper's explanation |
| 2:30–2:48 | the fit in three positions by image selection | it slides: −11.8 → −3.2 → +2.1 | replicating a distribution is hard | 换一种挑图标准，下降从 12 点变成 3 点，甚至反升。精确复制一个分布，难得惊人。 | the limitation in the same picture |
| 2:48–3:00 | the scatter, "进步是真的" | a breath | the takeaway | 进步是真的；但准确率的绝对值，离不开那套测试图。 | hold 5 s |

Pitfalls: equal axis scales, or y = x isn't the diagonal; say both halves ("models don't generalise" is a misreading); the 11–14 points are one variant (MatchedFrequency); whiskers on the accented dot (95% interval 66.1–67.9); label only the dots you name.

### A systems paper: FlashAttention, 5 min

A recorded conference talk, for practitioners who use attention but have never counted bytes. Numbers from Dao et al., NeurIPS 2022 (abstract, Theorem 2, Figure 2: GPT-2 medium, N = 1024, A100; <https://arxiv.org/abs/2205.14135>). The viewer needs a mental model (two memories and a pipe) before the trick, and "exact" needs its own beat. **Thesis**: 看完后，观众明白注意力慢在搬内存而不是算术，FlashAttention 结果完全一样却从不把 N×N 大表写进慢内存，因为他们看到小块在快内存里流过时，内存管道上的字节计数一直很低。**Picture**: a small fast SRAM above, a large slow HBM below, a narrow pipe between them with a running "HBM 读写 GB" counter and a clock. **Shape**: bottleneck first.

| Time | Rest frame | What moves | Understands | Narration |
|---|---|---|---|---|
| 0:00–0:12 | two time bars, 41.7 ms and 7.3 ms; "论文图 2" | both grow; the lower stops early | same work, 5.7× faster | 同样的注意力，同样的结果：一个要 41.7 毫秒，一个只要 7.3 毫秒。 |
| 0:12–0:35 | Q, K, V strips → an N×N grid | N grows 1K → 4K, the grid 16× | the cost is an N×N table | 注意力要算每两个词之间的分数，是一张 N 乘 N 的大表。序列长四倍，表就大十六倍。 |
| 0:35–1:00 | SRAM, HBM, the pipe, the counter at 0 | a block flickers fast inside SRAM and crawls through the pipe | computing is fast, moving is slow | GPU 有两种内存：片上 SRAM 极快但很小；显存 HBM 很大，却慢了约十倍。花时间的，是两者之间的搬运。 |
| 1:00–1:35 | the grid in HBM; 40.3 GB | it goes down and up the pipe for each pass | the big table is shipped back and forth | 标准做法把大表写进显存，读出来算 softmax，写回去，再读出来乘 V。一共搬了 40 GB。 |
| 1:35–1:50 | a compute bar, 66.6 GFLOPs, mostly idle | the clock runs while compute blinks idle | the arithmetic waits | 做乘法的部分，大多时间在等数据。瓶颈是搬运，不是计算。 |
| 1:50–2:30 | tiles of Q, K, V; one score tile in SRAM; the output in HBM | tiles enter in turn, each adds to the output and vanishes | the big table is never written | 办法是切块：每次只把一小块搬进 SRAM，算完就加进结果。那张大表，从来不进显存。 |
| 2:30–3:00 | a running max m and sum ℓ beside each output row | a new tile raises m; the row rescales, then the new part adds | tiled softmax stays exact | 难点是 softmax 要看整行。每行记住目前的最大值和总和，新块一来就按比例修正旧结果：结果和原来一样，不是近似。 |
| 3:00–3:20 | compute 75.2 GFLOPs; the counter 4.4 GB | the compute bar extends 13% | more maths, far less moving | 反向传播也不存大表，用时重算。计算多了 13%，搬运从 40 GB 降到 4.4 GB。 |
| 3:20–3:45 | side by side: 40.3 / 4.4 GB, 41.7 / 7.3 ms | the counters stop, then the clocks | bytes set the time | 少搬九倍，快了 5.7 倍。字节数决定了时间。 |
| 3:45–4:15 | speed-ups: BERT-large +15%, GPT-2 3×, LRA 2.4×; "论文摘要" | bars grow | the whole training run is faster | 放进整个训练：BERT-large 比当时的训练纪录快 15%，GPT-2 快三倍。 |
| 4:15–4:38 | memory against N: a line under a parabola; Path-X 61.4% at 16K | the curves grow | longer sequences fit | 显存只随长度线性增长，所以能训练更长的序列：在 1.6 万长度的 Path-X 上，第一次超过随机猜测。 |
| 4:38–4:52 | a chip with three marks | they light | the price is engineering | 代价是：每种注意力变体都要手写新内核，换一代 GPU 要重调，多卡并行还没做。 |
| 4:52–5:00 | the two-memory picture, 4.4 GB, "先数字节" | hold | the takeaway | 想让注意力变快，先数清楚搬了多少字节。 |

Pitfalls: no pseudo-code on screen; one figure's configuration per comparison (Figure 1's 7.6× and Figure 2's 5.7× differ); keep the m/ℓ beat or viewers assume an approximation; show the FLOP increase; bandwidth seen as the speed of the moving block, not read off a spec sheet.

### A thesis talk (3MT): learning on phones without the data, 3 min

A Three Minute Thesis heat, for non-specialists and judges scoring comprehension and engagement. Illustrative thesis built on McMahan et al. 2017 (<https://arxiv.org/abs/1602.05629>). The rules allow one static slide and no animation, so the piece is one picture that steps only add to, and its final rest frame is the competition slide; the stepped version is for the lecture video. Script to 2:45. **Thesis**: 看完后，非专业的观众明白手机输入法能从千万人的打字中学习、而消息不离开手机，因为他们看到模型去了手机上，回来的只是一小份修改。**Picture**: a ring of phones round a server, a locked chat bubble in each, one model icon. **Shape**: human question → stakes → one aim → finding → so what.

| Time | Rest frame | What moves | Understands | Narration |
|---|---|---|---|---|
| 0:00–0:15 | one phone, the keyboard suggesting a word | the suggestion appears | everyone has met this | 你的输入法总能猜中你下一个词。它是怎么学会的？ |
| 0:15–0:40 | bubbles flying to the server, locks broken, dimmed as "the usual way" | bubbles fly in | the obvious way costs privacy | 最直接的办法，是把所有人的聊天记录传到服务器上训练。可谁愿意呢？ |
| 0:40–1:10 | bubbles back in the phones, locked; model copies at each | models fly out | the data stays, the model travels | 我的研究反过来：数据不动，模型出门。 |
| 1:10–1:40 | each phone's model reshaped; thin arrows back | models morph; arrows draw inward | only "what changed" is sent | 每部手机只用自己的数据练几步，把"改了哪里"这一小份送回来。 |
| 1:40–2:05 | the server's model reshaped; "第 3 轮" | arrows merge; the cycle repeats faster | averaging, round after round | 服务器把大家的修改取平均，得到更好的模型，再发出去，一轮又一轮。 |
| 2:05–2:30 | two rows of round dots, many and few | the shorter row fills | 10–100× fewer rounds | 在我们的实验里，达到同样的准确率，通信轮数少了 10 到 100 倍。 |
| 2:30–2:50 | a small key on the arrows | keys appear | updates can still leak a little | 修改本身也可能泄露信息，所以下一步，是给这些箭头上锁。 |
| 2:50–3:00 | the full ring, locks closed | hold | the callback | 下次输入法猜中你，它学会了你，却从没读过你。 |

Pitfalls: jargon (name the field once at most); a text slide; the whole thesis instead of one aim; "completely private" (state the limit); rehearse to 2:45, not 3:00.

### A theory result: universal approximation, 2.5 min

A lecture section or a theory paper's video abstract, for students who know a sigmoid neuron. After Nielsen's constructive proof (*Neural Networks and Deep Learning*, ch. 4, <http://neuralnetworksanddeeplearning.com/chap4.html>), one input, one hidden layer. **Thesis**: 看完后，观众明白一层隐藏神经元就能把区间上任意连续函数逼近到任意精度，因为他们看到两个陡峭的 S 形组成一个凸起，凸起一个个垒在曲线下，直到处处落在宽为 ε 的误差带里；也明白定理只保证存在，不给规模也不给训练方法。**Picture**: one plot: the target f in grey, a band ±ε, the network's output g in the accent, a neuron counter; below, a small network whose hidden neurons share the colours of their steps. Parts of g outside the band glow warn. **Shape**: puzzle → small case → construction → general → what it doesn't say.

| Time | Rest frame | What moves | Understands | Narration |
|---|---|---|---|---|
| 0:00–0:15 | f, its band, an empty one-layer network | the curve draws, the band opens | the question | 只有一层隐藏神经元的网络，能画出任意一条曲线吗？ |
| 0:15–0:30 | the same, "处处误差 < ε" | the band pulses | the statement as a picture | 定理说：能。不管曲线多弯、误差要多小，总有这样一个网络，处处落在误差带里。 |
| 0:30–0:55 | one neuron; g is a step at s = −b/w | the weight grows, the S steepens; the bias slides it | a steep neuron is a step | 一个神经元：权重越大，S 形越陡，几乎成了台阶；偏置决定台阶在哪儿。 |
| 0:55–1:15 | two neurons, +h and −h: a bump | the second step subtracts | two steps make a bump | 两个台阶，一个向上，一个向下，合起来就是一个凸起。 |
| 1:15–1:45 | five bumps under f; red where g leaves the band | bumps rise into place | bumps stack into an approximation | 把区间切成小段，每段放一个凸起，高度取曲线在那里的值。 |
| 1:45–2:05 | 40 bumps, no red; 80 neurons; max error against neurons | segments halve 5 → 10 → 20 → 40 | finer means smaller error: the theorem | 段越细，台阶越贴着曲线。误差要多小，就切多细。这就是定理。 |
| 2:05–2:25 | a large counter; a jump function with a red notch that stays; a training arrow with "?" | the notch persists | what it doesn't say | 但它只保证存在：没说要多少神经元，只管连续函数，也不保证训练能找到它。 |
| 2:25–2:30 | g inside the band, "存在 ≠ 学得到" | hold | the takeaway | — |

The error chart is the Fourier fit's (`gallery/lengths`, `10s/fourier`): the same picture of "add parts, watch the error fall". Pitfalls: no ∀ε ∃N on screen, the band is the ε; keep the sigmoid slightly soft and say 几乎; each doubling is its own move.

### An ablation story: which parts of the Transformer matter, 90 s

A lecture section right after the gallery's method figure (`10s/method`), or a results video. Every BLEU from Vaswani et al. 2017, Table 3, newstest2013 development set, base 25.8 (<https://arxiv.org/abs/1706.03762>). **Thesis**: 看完后，观众明白深度和 dropout 最要紧，多头有用但太多反而变差，位置编码的选择几乎无所谓，因为他们看到每改一处，一个点就在同一把尺上离开基准线一段量得出的距离。**Picture**: the encoder diagram from `10s/method` on the left; a BLEU ruler with a base line at 25.8 on the right; each variant becomes a dot coloured like the block it changed. **Shape**: knock-out (reference → change one thing → measure → rank → qualify).

| Time | Rest frame | What moves | Understands | Narration |
|---|---|---|---|---|
| 0–10 s | encoder and ruler, base 25.8; "论文表 3 · 开发集" | the ruler and base line draw | the reference | 先立一条基准线：基础模型在开发集上 25.8 分，往上更好。 |
| 10–28 s | heads 1 / 4 / 8 / 16 / 32: 24.9 / 25.5 / 25.8 / 25.8 / 25.4 | the attention block splits; each dot drops in | an inverted U | 计算量不变，只改头数：一个头掉 0.9；16 个和 8 个一样；32 个又往下掉。 |
| 28–40 s | key size 32 / 16: 25.4 / 25.1 | the key slot narrows | smaller keys hurt | 把"键"的维度缩小，分数下降：判断该看谁，并不简单。 |
| 40–56 s | 2 layers: 23.7; d_model 1024: 26.0, 168M | "×6" shrinks to "×2"; then the blocks widen | depth matters most; width costs parameters | 层数从 6 减到 2，掉了 2.1，是最大的一次；模型更宽能更好，但参数多了一倍多。 |
| 56–68 s | dropout 0: 24.6 | dropout marks vanish | regularisation matters | 去掉 dropout，掉 1.2：防止过拟合很关键。 |
| 68–78 s | learned positional embedding: 25.7 | the sine waves swap for a learned strip | almost no change | 把正弦位置编码换成学出来的：25.7，几乎没变。 |
| 78–90 s | a ranked bar chart of Δ: −2.1, −1.2, −0.9, −0.7, −0.1; "论文未给方差" | the dots slide into sorted bars | the ranking and how far to trust it | 排一排：深度和 dropout 最要紧，位置编码怎么做几乎无所谓。注意：论文没给方差，差 0.1 不能算数。 |

Pitfalls: never mix the dev BLEU (25.8) with the test BLEU (28.4) on one ruler; say the parameter count where it changes; a dot on the line is "no detectable effect"; the positional encoding was swapped, not removed.

## Courses

Each is a narrated segment of 2–6 minutes with at least one prediction or a faded worked example; "Learner does" lists the interaction in the web view.

### Dijkstra's shortest paths and its invariant, 5 min

Undergraduate algorithms, after BFS and priority queues; not assumed: why greedy is correct. **Thesis**: 看完这一段，学生能手算 Dijkstra，并解释为什么最小的暂定值已经是最终值，因为他们看到任何别的路都得从前沿上一个不比它小的点走出已确定区域，而边只会让路更长。**Picture**: the MIT 6.006 L13 graph (s, a, b, c, d); the settled set as a shaded region that grows like a ripple; settled nodes filled, frontier nodes outlined with their labels. **Shape**: invariant story with a faded worked example.

| Time | Rest frame | What moves | Understands | Narration | Why |
|---|---|---|---|---|---|
| 0:00–0:25 | the weighted graph; s = 0, others ∞; legend 已确定 / 暂定 | edges draw, s fills | the parts and the goal | 从 s 出发，到每个点最短要走多远？实心表示"已确定"，空心表示"暂定"。 | names before the mechanism |
| 0:25–0:50 | a = 10, c = 3, outlined | a pulse runs along each edge; each label lands as it arrives | a label is the length of some known path | 从 s 走一步：a 暂定 10，c 暂定 3。暂定的意思是：至少有一条这么长的路。 | cause before effect |
| 0:50–1:15 | the same, "下一个确定谁？" | hold 8 s in the video | (learner commits) | 先停一下：下一个该确定谁？a 的 10 还会变小吗？先写下答案。 | nothing in the frame gives the answer |
| 1:15–1:45 | c filled; a 10 → 7, b = 11, d = 5 | c fills; a's label rolls to 7 | the minimum is safe; others can drop | 确定 c：它是前沿上最小的。经过 c，a 从 10 降到 7。暂定的会变，最小的那个不会。 | the surprise is the evidence |
| 1:45–2:30 | region {s}; a dashed detour to c through a; "起点已 ≥ 10" | the detour draws; its exit rings; the readout only grows | why the minimum is final | 有没有更短的绕路到 c？任何绕路都得先走出阴影区，出口处已经不比 3 短，后面的边又不是负的，只会更长。 | the inequality chain as a picture |
| 2:30–3:00 | d filled; b 11 → 10 | worked | the same move | 下一步我来做：确定 d = 5；经过 d，b 从 11 降到 10。 | faded example, worked part |
| 3:00–3:25 | "接下来呢？" | hold | (learner does the last two) | 后面两步交给你：下一个确定谁？b 最终是多少？ | backward fading |
| 3:25–4:00 | all filled; δ: s 0, c 3, d 5, a 7, b 9; rings at those radii | a fills, b → 9; rings draw in settle order | the settle order is distance order | a = 7 确定，经过 a，b 最终是 9。确定的顺序就是距离从小到大，一圈一圈扩开。 | ties back to BFS |
| 4:00–4:40 | s → a 2, s → b 3, b → a −2; a settled at 2 | the −2 edge reaches back into the region; a's label cracks: 1 < 2 | the invariant needs weights ≥ 0 | 如果有负边呢？a 先被确定为 2，可经过 b 只要 1。走出阴影区以后路还能变短，"已确定"就错了。 | break the precondition |
| 4:40–5:00 | the region picture, "前沿最小 = 最终" | nothing | | 记住这张图：阴影里的数都是最终的；前沿上最小的那个，可以放心加进来。 | the final rest is the slide |

Learner does: the prediction at 0:50; the faded steps as a quiz; a new 6-node graph as an exercise. Pitfalls: animating heap operations steals salience from the invariant; the prediction frame must not leak 7; avoid ties, or state the tie rule.

### A visual proof and its induction step, 4 min

First-year discrete mathematics, the induction unit. **Thesis**: 看完这一段，学生能写出归纳步 n² + (2n+1) = (n+1)²，并把它解释成"在正方形外套一圈 L"，因为他们看到每个正方形都恰好长出这样一个 L，并数过它的两条边和一个角。**Picture**: a square of dots growing by L-shaped borders, each a new colour, beside a column of partial sums. **Shape**: picture → formal.

| Time | Rest frame | What moves | Understands | Narration | Why |
|---|---|---|---|---|---|
| 0:00–0:25 | 1, 1+3, 1+3+5 → 1, 4, 9 | one sum per beat | a pattern to explain | 1，1+3，1+3+5，结果是 1、4、9。这是巧合吗？ | problem before procedure |
| 0:25–0:45 | "1+3+5+7+9 = ?" | hold | (learner commits) | 先猜：一直加到 9 是多少？为什么总是平方数？ | prequestion |
| 0:45–1:25 | squares 1×1 to 3×3, each new L coloured | each L slides around the corner; the old square stays | each odd number is an L | 每个奇数都是一圈 L 形的边，套在上一个正方形外面。 | keep identity |
| 1:25–1:55 | 4×4 → 5×5; the L split: arm 4, arm 4, corner 1 | the arms light in turn; 4 + 4 + 1 = 9 | why n → n+1 adds 2n+1 | 从 4×4 到 5×5：两条边各 4 个点，再加一个角，一共 9 个。 | the picture produces the number |
| 1:55–2:20 | zoomed out, the squares trailing off; "第 1000 层呢？" | the view pulls back | a picture checks only what it draws | 图只画到 5。凭什么第 1000 层也对？我们要的是：从任何一层，都能套到下一层。 | doubt motivates rigour |
| 2:20–3:05 | an n×n square and its L beside n² + (2n+1) = (n+1)² | each term lights with its region | the step is the picture's move in algebra | 把这一步写成式子：旧正方形 n²，加上 L 形 2n+1，等于新正方形 (n+1)²。 | colour links picture and term |
| 3:05–3:35 | the proof with two blanks | hold | (learner fills them) | 现在你来补：从哪一层开始？从第 n 层到第 n+1 层，加上的是哪一项？ | faded |
| 3:35–4:00 | the full proof and the picture | the blanks fill | base + step = every n | 起点 1 = 1²；每加一圈 L，还是正方形。所以对所有 n 都成立。 | the final rest is the slide |

The formula is a typed math block in the page with a cue on the changing term (scenes don't typeset LaTeX). Pitfalls: settle the index (the k-th odd number is 2k−1, the step adds 2n+1) and colour it; adding dots one at a time turns it into counting.

### Gradient descent and the learning rate, 5 min

Introductory machine learning; prior: the derivative as a slope. **Thesis**: 看完这一段，学生能根据 η 和曲率判断梯度下降是慢慢走、来回跳着收敛还是发散，因为他们看到每一步是一支长为 η × 斜率的箭头，箭头比到谷底的距离长就越过谷底，比两倍还长就爬出去。**Picture**: the bowl L(w) = w², a point at w = 4, its tangent and the step arrow drawn to scale; a loss bar from the point. η = 0.1 (each step × 0.8), 0.8 (× −0.6), 1.1 (× −1.2); the threshold is η = 1; later an elongated 2-D bowl. **Shape**: ladder of abstraction with a prediction at each rung.

| Time | Rest frame | What moves | Understands | Narration |
|---|---|---|---|---|
| 0:00–0:25 | the bowl, the point, its tangent | the tangent draws | the slope says which way and how steep | 损失像一只碗。切线的斜率告诉我们：哪边是下坡，坡有多陡。 |
| 0:25–0:55 | the step arrow; "w ← w − η·∇L" | the arrow grows out of the tangent; the point jumps and drops onto the curve | the update rule | 每一步：沿着下坡走"η 乘以斜率"这么远。坡越陡，步子越大。 |
| 0:55–1:30 | six points, hops shrinking; the loss bar falls | hops one at a time | steps shrink near the bottom by themselves | η 小的时候，越靠近谷底坡越缓，步子自己就变小了。 |
| 1:30–1:55 | "η 0.1 → 0.8？" with three options | hold | (learner commits) | 把 η 从 0.1 调到 0.8：会更快到底、来回跳，还是飞出去？先选。 |
| 1:55–2:30 | a zigzag across the valley, hops shrinking | each hop arcs over the bottom | overshoot | 步子比到谷底的距离还长，就跳到了对面；落点比出发点低，所以来回跳着收敛。 |
| 2:30–2:50 | "η = 1.1？" | hold | (learner commits) | 再大一点，η = 1.1 呢？ |
| 2:50–3:20 | the trail climbing the walls; the loss bar leaves the frame | hops grow | divergence | 落点比出发点还高，一跳比一跳高。这就是训练"炸了"。 |
| 3:20–3:55 | one hop from 4 to −4; "η × 曲率 < 2" | the arrow stretches to exactly twice the distance | the boundary | 临界点：一步正好跳到对面同样高的地方。η 乘曲率小于 2，才会收敛。 |
| 3:55–4:30 | three loss curves for 0.1, 0.8, 1.1 | they draw in turn | how each looks in training | 在训练曲线上：太小，慢慢降；偏大，抖着降；过大，一路往上冲，直到 NaN。 |
| 4:30–5:00 | an elongated 2-D bowl, a zigzag across its narrow axis | the path draws | the steepest direction sets η | 多维的碗里，最陡的方向最先超调，所以路线是之字形。η 要由最陡的方向来定。 |

Learner does: the two predictions; a run panel where the learner sets η and the curvature. Pitfalls: "a ball rolling downhill" implies momentum, so show discrete hops; a 3-D loss surface hides the arrow length, the one quantity that matters; one bowl and one start across every prediction.

### Why one assignment changed three rows (list aliasing), 4.5 min

CS1 in Python; not assumed: names versus objects. **Thesis**: 看完这一段，学生能预测列表乘法、赋值和修改的效果并修好 [[0]*3]*3，因为他们看到名字和列表的格子里装的是指向对象的箭头，*3 复制的是箭头而不是那一行。**Picture**: a Python Tutor-style memory diagram (names left, objects right, arrows) beside the code with the current line highlighted. **Shape**: bug story with subgoal labels 复现 / 猜原因 / 看内存 / 修复 / 验证.

| Time | Rest frame | What moves | Understands | Narration |
|---|---|---|---|---|
| 0:00–0:30 | grid = [[0]*3]*3; grid[0][0] = 1; print(grid); 复现 | lines highlight | the intent | 做井字棋：先建一个 3×3 的棋盘，再把左上角设成 1。 |
| 0:30–0:50 | two options: only the first row changes / all three | hold | (learner commits) | 先猜输出：只有第一行变，还是三行都变？ |
| 0:50–1:10 | the recorded output: all three | it types in | the symptom | 三行都变了。可我们只改了一个格子。 |
| 1:10–1:40 | 猜原因; grid[1][1] = 1 sets the middle of every row | the line morphs; the output updates | not an index slip | 是下标写错了吗？改中间那格试试：还是三行一起变。 |
| 1:40–2:30 | 看内存; one row object; an outer list of three slots, all arrows to that row | [0]*3 makes the row; *3 draws three arrows onto it | *3 copies arrows | 看内存：[0]*3 造出一行。外面再乘 3，复制的是三根箭头，都指向同一行。 |
| 2:30–3:00 | cell 0 of the row is 1; three arrows into it | a highlight follows grid → slot 0 → row → cell 0 | a mutation changes the shared object | 改的是那一行本身。三根箭头都指着它，所以三行"都"变了。 |
| 3:00–3:30 | the row's cells as arrows to 0, one now to 1 | one arrow swings | assignment turns one arrow; 0 can't change | 里面的 [0]*3 不也是复制箭头吗？是的，但 0 改不了，赋值只是让一个格子改指 1。 |
| 3:30–4:00 | 修复; [[0]*3 for _ in range(3)]; three rows | the line morphs; one row per loop turn | the comprehension builds new rows | 修复：用列表推导式，每转一圈新造一行。三根箭头，三个对象。 |
| 4:00–4:30 | 验证; both diagrams; "复制箭头 ≠ 复制对象" | nothing | | 记住这两张图：一个对象三根箭头，和三个对象各一根。 |

Learner does: the prediction; stepping the same code; a transfer quiz (b = a; b.append(3); print(a)). Pitfalls: draw only grid, its slots and the row; the output must be the real one; never show the fix before the model.

### Retransmission: a lost packet and a lost ACK look the same, 4.75 min

Computer networks, the transport layer. **Thesis**: 看完这一段，学生能解释可靠传输为什么既要超时重传又要序号，因为他们在时空图上看到，从发送方看，丢了包和丢了 ACK 一模一样，所以接收方必须认出重复的包。**Picture**: a time-space diagram (sender and receiver as vertical lines, time down, messages as slanted arrows, a loss as ✕, the sender's timer as a bar); it keeps the history, so every rest frame is a whole slide. **Shape**: predict, then a contrast pair.

| Time | Rest frame | What moves | Understands | Narration |
|---|---|---|---|---|
| 0:00–0:30 | two lines; pkt 0 → ACK 0 | the arrows slide | how to read it | 左边是发送方，右边是接收方，时间往下走。斜线是路上的包，回来的是确认 ACK。 |
| 0:30–1:05 | pkt 1 ✕; the timer full; pkt 1 resent → ACK 1 | the timer fills on the arrows' clock | silence is the only sign, so a timer | 包丢了，接收方并不知道。发送方只能等：计时器满了还没回音，就重发。 |
| 1:05–1:30 | a second lane: pkt 1 arrives, ACK 1 ✕; "发送方会怎样？" | hold | (learner commits) | 换一种情况：包到了，ACK 丢了。发送方会做什么？接收方会收到什么？ |
| 1:30–2:05 | both lanes; a band over the two sender lines | lane 2 times out and resends | the cases are identical to the sender | 两种情况，在发送方看来一模一样：发出去，没回音，超时重发。 |
| 2:05–2:40 | the receiver's app shows 转账 ¥100 twice | the duplicate is delivered | without numbers, a duplicate is new data | 接收方收到第二个 1 号包。如果包没有编号，它会当成新数据：转账执行了两次。 |
| 2:40–3:15 | seq 0 / 1; the duplicate dropped; ACK 1 again | the duplicate stops with ✕; an ACK leaves | numbers let the receiver discard and re-ACK | 给包编号：又见到 1 号，就丢掉，但还要再回一个 ACK，不然发送方会一直重发。 |
| 3:15–3:40 | no loss; a timer shorter than the RTT; "会怎样？" | hold | (learner applies the model) | 计时器比往返时间还短，会怎样？ |
| 3:40–4:15 | a premature resend crossing the late ACK | the two arrows cross | too short duplicates, too long is slow | 没丢包也重发了：ACK 只是晚到。计时器太短，白白重发；太长，丢包后要等很久。 |
| 4:15–4:45 | the two identical sender columns; "超时 + 编号" | nothing | | 记住这张图：发送方分不清丢的是包还是 ACK，所以要超时重发；接收方要靠编号去重。 |

Learner does: the predictions; a run panel simulator that takes a list of lost messages. Pitfalls: packets as dots flying sideways lose the time axis, and the still loses the story; one loss at a time; the receiver never "sees" a loss on screen.

### Current is not used up (series circuits), 4.3 min

Introductory physics; prior: the words current, voltage, battery, bulb. **Thesis**: 看完这一段，学生能预测串联电路里电流表的读数和灯泡的亮度，因为他们看到每秒经过回路每一处的电荷一样多，而灯泡拿走的是电荷带的能量，不是电荷本身。**Picture**: a loop of evenly spaced charge beads that all move together on one clock, like a bicycle chain; ammeter gates count beads per second; beside it an energy staircase (the battery lifts, each bulb steps down). **Shape**: refutation with two predictions.

| Time | Rest frame | What moves | Understands | Narration |
|---|---|---|---|---|
| 0:00–0:20 | battery, one bulb, the loop | the switch closes; every bead starts at once | the whole loop moves together | 电池、导线、一个灯泡。开关一合，整圈的电荷同时动起来，灯亮了。 |
| 0:20–0:45 | gates before and after the bulb, readings hidden; < / = / > | hold | (learner commits) | 灯泡前后各放一个电流表。后面那个读数会更小、相等，还是更大？先选。 |
| 0:45–1:10 | a dashed "hypothesis" overlay: beads thinning past the bulb | dashed beads spread apart | the common idea, stated fairly | 很多人会想：灯泡用掉了一部分电流，所以后面少了。看看是不是这样。 |
| 1:10–1:40 | A1 = A2 = 0.30 A | both gates tick in lockstep | the same everywhere | 两个表一样。每秒经过灯泡前面的电荷，和经过后面的一样多。 |
| 1:40–2:20 | beads bright before the bulb, dim after; the staircase | beads dim across the bulb, brighten at the battery | the bulb takes energy | 灯泡拿走的不是电荷，是电荷带着的能量。绕回电池，电荷又被"抬高"。 |
| 2:20–2:45 | two bulbs in series, unlit; options | hold | (learner commits) | 两个一样的灯泡串起来：哪个更亮？和刚才只有一个灯时比呢？ |
| 2:45–3:30 | both equally dimmer; 0.15 A everywhere; two half-steps | the step splits | they share the energy; the loop sets the current | 两个一样亮，都比原来暗。电流处处相同，但整圈的阻碍大了一倍，电流只有一半。 |
| 3:30–4:00 | three bulbs, one gate hidden | hold | (learner applies it) | 三个灯串联：这个表读多少？哪个最亮？ |
| 4:00–4:20 | loop and staircase, "电流不减少，能量被分走" | nothing | | 记住两张图：电荷像链条，整圈一起动；能量在每个灯泡那里一级一级放掉。 |

Pitfalls: beads that leave the battery and arrive later suggest current travels out and is spent; bead speed shows the rate, not the drift velocity; label 0.30 and 0.15 A as idealised. The same skeleton fits chemical equilibrium: particles keep converting both ways while the concentrations go flat.

## Data, news, history

### UK coal power goes to zero, 30 s

An energy lecture. **Thesis**: 看完后，观众明白英国煤电占比在 35 年里从约三分之二降到零，最陡的一段在 2015 年碳价翻倍之后，因为他们在一条从 0 起的折线上看到 2015 年后线几乎垂直落地。**Picture**: one line chart, y 0–70%, 1990–2024, one event marker. **Shape**: trend with one turning point. Data (sourced): Ember via OWID, 1990 64.6%, 2012 39.2%, 2015 22.4%, 2016 9.0%, 2019 2.1%, 2024 0.7% (<https://ourworldindata.org/grapher/share-electricity-coal>); the carbon price support rose from £9 to £18 a tonne in April 2015 (<https://ember-energy.org/latest-insights/the-uks-coal-to-clean-journey/>); Ratcliffe-on-Soar closed on 30 September 2024.

| Time | Rest frame | What moves | Understands | Narration | Why |
|---|---|---|---|---|---|
| 0–4 s | empty axes 0–70%, 煤电占比, the source | the axes draw | what is measured, from zero | 这是英国发电量中，煤电所占的比例。 | establishing shot |
| 4–11 s | the line 1990 → 2012, at 39% | drawn at a constant rate | it was already falling | 1990 年，三度电两度靠煤。九十年代改烧天然气，先降一截。 | an honest window |
| 11–17 s | the line to 2015; a marker at April 2015, 碳价翻倍 | the marker lands first, then the line | the event | 2015 年 4 月，碳价附加税翻倍，涨到每吨 18 英镑。 | cause before effect |
| 17–24 s | the line to 2024, near vertical in 2015–16 | the same pace | the steepest fall follows the event | 一年后跌到一成以下。风电增长、电厂关停、用电减少，一起推动。 | name the co-causes |
| 24–30 s | the end dot on 0, "2024.9 最后一座关闭" | the dot lands without overshoot | the end | 2024 年秋，最后一座煤电厂关闭。 | hold |

Pitfalls: a window from 2012 makes the policy look like the only cause; an axis not from zero exaggerates; pause at 2015, don't slow the clock; stop at 2024 (2025 is provisional).

### Who emits the most CO₂, 60 s

A climate or economics course; the audience "knows China is the biggest polluter". **Thesis**: 看完后，观众明白中国在 2006 年成为年排放最多的国家，是因为自身排放增至 1990 年的约五倍，而不是美国下降；而按累计和人均，美国仍排在中国前面，因为他们看到同一组条形按三种口径重新排序。**Picture**: horizontal bars for the top six on a fixed axis 0–130 亿吨, the year large, China in the accent, the rest grey. **Shape**: race with one mover, then juxtaposition. Data (Global Carbon Budget 2025 via OWID, fossil fuels and industry; recheck at build): 1990 US 51.3, Russia 25.4, China 24.8 亿吨; 2006 China 64.9, US 60.5; 2024 China 122.9, US 49.0, India 31.9; cumulative 1750–2024 US 4,349, China 2,851; per person 2024 US 14.2 t, China 8.7, India 2.2, world 4.7.

| Time | Rest frame | What moves | Understands | Narration |
|---|---|---|---|---|
| 0–6 s | six grey bars, 1990, the source | bars grow, staggered | one bar = one country, one year | 每根条是一个国家一年排放的二氧化碳。这是 1990 年。 |
| 6–11 s | China in the accent | it pulses | the mover: third, half the US | 看这一根：中国，排第三，只有美国的一半。 |
| 11–23 s | 2006, China just above the US, held 2.4 s | years at 0.6 s each; ranks swap in 0.5 s | the pass, and why | —… 2006 年，中国超过了美国。 |
| 23–36 s | 2024: China 122.9, US 49.0 | the same rate | the gap is China's growth | 到 2024 年，中国一年排 123 亿吨，是美国的两倍半；美国在缓慢下降。 |
| 36–45 s | the cumulative ranking | the axis relabels and rescales, then bars take new lengths | history counts | 但把 1750 年以来排过的全部加起来，美国仍是第一。 |
| 45–54 s | per person, a dashed world line | the same two stages | per person differs again | 按每人算，美国约 14 吨，中国约 9 吨，印度约 2 吨。 |
| 54–60 s | three small rankings, 每年 / 累计 / 人均; "谁第一，看你怎么问" | they slide into place | ranking is a framing choice | 谁排第一，取决于你怎么问。 |

Pitfalls: a dynamic axis hides the growth; bars enter and leave, never relabel a bar as another country; per person covers these six only; ending on the annual ranking alone lets the last frame assign the blame.

### The income mountain, 60 s

Development economics or a public lecture on poverty. **Thesis**: 看完后，观众明白 1990–2015 年全球收入分布整体右移，每天不足 3 美元的人从 43% 降到 13%，但 2015 年后几乎停在 10% 左右，因为他们看到同一座"收入山"线左侧的面积先快速缩小、后几乎不动。**Picture**: a density curve of daily income per person (PPP) on a log axis $1 to $100+, a line at $3, the area left of it shaded and a share counter driven by that area; a strip of share against year below. Data: World Bank PIP via OWID (2021 PPP): 1990 43.4%, 2015 13.4%, 2024 10.1%, 2025 9.9% (nowcast) (<https://ourworldindata.org/grapher/share-of-population-in-extreme-poverty>).

| Time | Rest frame | What moves | Understands | Narration |
|---|---|---|---|---|
| 0–10 s | a log axis with $1, $10, $100 and ×10 brackets; the source | ticks appear, brackets draw | each step is ×10 | 横轴是每人每天的收入，已按各地物价调整。每往右一格，收入多十倍。 |
| 10–18 s | the 1990 mountain | it rises | height is people | 这座山是 1990 年的世界：越高，表示这个收入上的人越多。 |
| 18–28 s | the $3 line, the shaded area, 43% | the line, then the area, then the counter | the poverty line and its share | 这条线是每天 3 美元，世界银行的极端贫困线。1990 年，线左边有 43% 的人。 |
| 28–40 s | the 2015 mountain, 13% | the curve morphs at a constant rate; area and counter on one clock | fast progress | 二十五年里，整座山往右移。线左边降到 13%，少了约 13 亿人。 |
| 40–52 s | the strip, flat after 2015; 2025 marked 估算 | the strip draws on the morph's clock | the stall | 可是 2015 年以后，这一截几乎不再变小。2025 年还有约 10%，八亿多人。 |
| 52–60 s | the mountain, the strip and the source; "山右移了，左尾停住了" | a breath | both facts | — |

Pitfalls: teach the log axis or don't use it; plot density per log unit so area is people; take the curve and the line from one PPP release; mark nowcasts.

### Half of humanity in one circle, 30 s

Geography or demography, for an audience that pictures population by land area. **Thesis**: 看完后，观众明白世界一半以上的人住在以缅甸东部为圆心、半径约 3300 公里的圆内，因为他们看到按人口画点之后，圈内的点比圈外所有的点还多。**Picture**: an equal-area world map (Equal Earth, `d3.geoEqualEarth`); one dot per 10 million people from gridded population; a geodesic circle (`d3.geoCircle`, 29.7°). Data: Quah 2015 (<https://blogs.lse.ac.uk/maths/2015/12/16/the-worlds-tightest-cluster-of-people/>).

| Time | Rest frame | What moves | Understands | Narration |
|---|---|---|---|---|
| 0–5 s | grey land, the source | the outline draws | an honest base map | 这是世界地图，各地面积按真实比例。 |
| 5–12 s | land faded, about 740 dots; ● = 1000 万人 | dots rise by region | people, not land | 每个点代表一千万人。人挤在哪里，一眼可见。 |
| 12–18 s | the circle and its centre | the pin lands, then the stroke draws | the region | 画一个圆：圆心在缅甸东部，靠近云南，半径约 3300 公里。 |
| 18–25 s | dots inside in the accent; counters 圈内 / 圈外 | a recolour wave from the centre drives the counters | inside > outside | 圈里的人，比圈外全世界加起来还多。 |
| 25–30 s | the map, the counters and "Quah 2015，2015 年人口" | rest | the claim and its data year | — |

Pitfalls: Mercator warps the areas and the circle; dots at country centroids put people in empty Siberia; recompute "half" for the year shown.

### How smallpox was ended, 3 min

Public-health history, for an audience that assumes eradication meant vaccinating everyone. **Thesis**: 看完后，观众明白天花在 1967–1977 年这十年里被消灭，关键不是给所有人接种，而是找到每个病例、给周围的人接种（监测-围堵），因为他们在一个村子里看到围堵环挡住了传播，又在地图上看到流行国家一个个熄灭。**Picture**: a world map with 1967 borders above a timeline with a visible break (1796 // 1950–1980), and a drill-down into one illustrative village (示意). **Shape**: scale as the hook, a countdown as the spine, a drill-down for the mechanism. Data: OWID (<https://ourworldindata.org/smallpox>): about 300 million deaths in the 20th century; 1967 reported about 132,000 cases against an estimated 10–15 million; the last natural case in Merka, Somalia, on 26 October 1977. WHO for the regions and the method; certification needed two years with no cases.

| Time | Rest frame | What moves | Understands | Narration |
|---|---|---|---|---|
| 0:00–0:14 | 300 dots, ● = 100 万人, "20 世纪死于天花（估计）" | dots fill row by row | the scale | 二十世纪，天花大约夺走了三亿人的生命。每个点是一百万人。 |
| 0:14–0:32 | the dots in a corner; the timeline 1796 // 1950–1980 | the strip and its break draw | a puzzle: a vaccine existed for 170 years | 1796 年，英国医生詹纳发明了牛痘接种。可是一百七十年后，天花还在。 |
| 0:32–0:50 | the 1967 map, endemic countries filled | countries fill by region | the set to count down | 1967 年，世界卫生组织开始加强消灭天花的计划。当时，天花还在三十多个国家流行。 |
| 0:50–1:08 | bars: 上报 13.2 万 and 估计 1000–1500 万 | the reported bar, then the range | the records were far too low | 那一年上报的病例只有十三万。后来估计，真实的数字是一千万到一千五百万。 |
| 1:08–1:28 | a village of 100 houses, most vaccinated, one case, a chain through the gaps | the infection hops three times | vaccinating everyone leaks | 只靠给所有人接种，总会漏掉一些人，病毒就沿着这些缺口传下去。 |
| 1:28–1:50 | a ring round the case, contacts filled, the chain stopped; "监测-围堵" | the ring draws; contacts fill in a wave | the mechanism | 新办法是：找到每一个病人，给他身边接触过的人接种，把病毒围住。这叫监测和围堵。 |
| 1:50–2:20 | the map in 1977, only the Horn of Africa left | countries grey at a constant pace | the method cleared the world region by region | 南美洲 1971 年清零。……亚洲的最后一例，1975 年在孟加拉。……最后只剩非洲之角。 |
| 2:20–2:36 | Merka with one dot, "1977.10.26" | the dot lands | the last natural case | 1977 年 10 月，索马里梅尔卡的一名医院厨师，成了最后一个自然感染的病人。 |
| 2:36–2:50 | the map grey; "两年无病例", then a 1980.5 marker | the bracket, then the marker | evidence, then the declaration | 又找了两年，确认再没有病例。1980 年 5 月，世界卫生大会宣布：天花被消灭了。 |
| 2:50–3:00 | the empty map, the timeline, the 300 dots, the sources; "人类消灭的第一种传染病" | a breath | the arc in one still | 这是人类消灭的第一种传染病。 |

Pitfalls: 1967 borders (Bangladesh was East Pakistan) or "按今天的国界"; say which count (31 endemic, or more than 50 reporting any case); a uniform 1796–1980 axis squashes the decade that matters, so the break is visible; don't invent per-year dates the source doesn't give; "最后一个自然感染的病人" (a 1978 laboratory infection killed one more); no single hero.

### How hot by 2100, 3 min

A climate-policy class, for an audience that hears "scientists aren't sure" and concludes the outcome is unknowable. **Thesis**: 看完后，观众明白到本世纪末，低排放和高排放两条路的升温区间完全不重叠，选择造成的差别大于科学的不确定，因为他们看到几条区间带在 2040 年前叠在一起、到世纪末彻底分开，并量出了"带宽"和"间距"。**Picture**: one chart, 1850–2100, °C above 1850–1900, the observed line, a "右边是预估" marker at 2025, one band per scenario. **Shape**: the fork. Data: IPCC AR6 WG1 SPM, Table SPM.1 (<https://www.ipcc.ch/report/ar6/wg1/downloads/report/IPCC_AR6_WGI_SPM.pdf>): 2081–2100 SSP1-2.6 1.8 (1.3–2.4), SSP2-4.5 2.7 (2.1–3.5), SSP5-8.5 4.4 (3.3–5.7) °C; 2021–2040 about 1.5–1.6 for all three. Without the SPM.8 time series, draw range bars at the two periods and don't fill between.

| Time | Rest frame | What moves | Understands | Narration |
|---|---|---|---|---|
| 0:00–0:12 | axes 1850–2100, 比 1850–1900 年高出, the sources | the axes draw | what is measured | 纵轴是全球气温比工业化前高了多少度。 |
| 0:12–0:32 | the observed line to 2024; a 1.55 dot with its whisker | the line draws at a constant pace | where we are | 这是实测。2024 年，比工业化前高了约 1.55 度，很可能是第一个整年超过 1.5 度的年份。但《巴黎协定》看的是二十年平均。 |
| 0:32–0:44 | a dashed line at 2025, "右边是预估" | it drops | observation becomes projection | 从这条线往右，是预估，不是测量。 |
| 0:44–1:04 | the SSP2-4.5 band, 2.7°（2.1–3.5） | it grows from the 2025 dot | one path and its range | 先看一条中间的排放路径：到本世纪末，大约升高 2.7 度，很可能在 2.1 到 3.5 度之间。 |
| 1:04–1:24 | ten thin lines, nine inside; 示意; "10 种可能，至少 9 种在带内" | the lines draw, the band settles behind | what the band means | 这条带子不是气温的"粗细"。意思是：十种可能的未来里，至少九种落在这里面。 |
| 1:24–1:48 | the low band 1.8° and the high band 4.4°, labelled directly | low, then high | the spread of choices | 排放很快降下来的路，大约 1.8 度；排放一直猛增的路，大约 4.4 度。 |
| 1:48–2:08 | slices at 2021–2040 (重叠) and 2081–2100 (分开) | brackets draw | near term the same, the end differs | 未来二十年，几条路几乎叠在一起；到本世纪末，低的和高的完全分开了。 |
| 2:08–2:30 | band width 1.4° (科学的不确定) and the distance between centres 2.6° (我们的选择) | the brackets draw | science and choice, measured | 一条带子的宽度，是科学还没弄清的；带子之间的距离，是我们自己的选择。 |
| 2:30–2:46 | ticks: 现行政策 ≈2.8°, 兑现承诺 2.3–2.5°, UNEP 2025 | they slide in | where policy points | 按各国现行政策，估计升高约 2.8 度；兑现全部承诺，约 2.3 到 2.5 度。 |
| 2:46–3:00 | everything held, "带宽是未知，间距是选择" | a breath | the argument in one still | 未来升高几度，主要取决于现在的选择。 |

Pitfalls: one year above 1.5 °C isn't the 20-year level; a bare band reads as a hard limit, so label it and use frequency framing; don't call SSP5-8.5 "business as usual"; don't mix baselines (1951–1980 against 1850–1900).

### How much is a billion, 30 s

The opening of any lecture that quotes 十亿 or 万亿. **Thesis**: 看完后，观众明白百万、十亿、万亿每级差一千倍，因为他们看到 12 天在 32 年的尺上缩成一条细线，32 年又在 3.17 万年的尺上细得几乎看不见。**Picture**: one time ruler ending at 今天; bars are durations; the earlier bar is kept as it shrinks. **Shape**: scale ladder. Arithmetic: 10⁶ s = 11.6 days, 10⁹ s = 31.7 years, 10¹² s ≈ 31,700 years.

| Time | Rest frame | What moves | Understands | Narration |
|---|---|---|---|---|
| 0–5 s | a bar, "100 万秒 ≈ 12 天" | it grows from 今天 | the first rung | 一百万秒，大约是十二天。 |
| 5–12 s | the 12 days a sliver; "10 亿秒 ≈ 32 年" | the camera zooms out ×1000 in 2 s | ×1000 | 十亿秒呢？大约三十二年，差不多从出生到三十而立。 |
| 12–20 s | 32 years a sliver; "万亿秒 ≈ 3.17 万年"; a tick at 农业出现 | the same zoom | ×1000 again | 一万亿秒，是三万一千七百年，比人类开始种地早得多。 |
| 20–26 s | the full ruler; the 32-year bar about 1 px with a callout | the callout draws | the punch | 在这把尺上，三十二年细得像一根头发，十二天根本看不见。 |
| 26–30 s | "百万 → 十亿 → 万亿，每级一千倍" | rest | the rule | — |

Pitfalls: the old anchor stays visible while it shrinks; lengths, not areas or volumes; billion is 十亿, not 亿; the same time per ×1000 on every rung.

## Products and systems

### A launch spot, 30 s

A launch on social media and the landing page, for developers watching cold and often muted. Illustrative subject: Stripe Projects (Sessions 2026). **Thesis**: 看完后，观众相信一条命令就能替代十几次注册，因为他们看到同一组十几张服务卡片带着各自的登录和密钥飞进一个项目，密钥汇进一个 .env 文件。**Shape**: heartbeat with a compressed problem–agitate–solve.

| Time | Rest frame | What moves | Understands | Narration | Why |
|---|---|---|---|---|---|
| 0–2.5 s | twelve service cards, each with a padlock | cards drop in; a cursor hops | many separate services | 做一个应用，要接十几个服务。 | the hook is the mess |
| 2.5–5 s | one card open, a key copied and pasted | copy-paste three times, faster; the third flashes red | the chore repeats and breaks | 每个都要注册、复制密钥。 | agitate by rhythm |
| 5–7 s | a small logo docked; an empty terminal | the logo traces in | who is talking | — | brand by 5 s |
| 7–11 s | `stripe projects add ...` | typed at 12–15 characters a second | one line | 现在只要一行。 | the only text is the command |
| 11–17 s | one project panel holding the twelve cards, checked | each card flies from where it lay | the same services, together | — | keep identity |
| 17–21 s | one .env with twelve masked keys | a line from each card's key to a file line | secrets are wired | 密钥也自动配好。 | a second result on the same objects |
| 21–25 s | "12 → 1" | an odometer; ghosts of the old spots fade | the gain, counted from what vanished | — | the picture produces the number |
| 25–30 s | the terminal with the command, the logo | a drift | what to do | 今天就能用。 | the call to action is the command |

Pitfalls: one launch per spot; generic service icons instead of third-party logos; mask every key; the muted cut needs the one spoken line on screen.

### A product explainer, 60 s

The homepage video for people new to the category. Illustrative subject: Dropbox, retold from its 2009 explainer (<https://www.youtube.com/watch?v=w4eTR7tci6A>). **Thesis**: 看完后，观众明白 Dropbox 文件夹在每台设备上都一样，因为他们看到放进笔记本文件夹的一个文件出现在手机和网页上，笔记本摔坏后还能回来。**Picture**: the same blue folder on three devices joined by lines; a change travels the lines. **Shape**: StoryBrand opened with the result.

| Time | Rest frame | What moves | Understands | Narration |
|---|---|---|---|---|
| 0–4 s | one photo on phone, laptop and web, checked | it appears on each in turn | the outcome | 手机拍的照片，电脑上已经有了。 |
| 4–9 s | the folder mark; three faint devices | the mark traces in | brand and cast | 这是 Dropbox。 |
| 9–17 s | Lin's files split across devices; an envelope and a USB stick; "v2" beside "v2-final" | the envelope flies; the stick plugs in | scattered copies | 小林的行程单散在三台设备上，只好发邮件给自己，再插 U 盘。 |
| 17–27 s | the same folder on each device, linked | links draw; the stray copies merge | one folder everywhere | Dropbox 在每台设备上放一个文件夹，三个永远一样。 |
| 27–37 s | the itinerary on all three and the web | Lin drags it in; a pulse runs down each link | put it in once | 放进笔记本的文件夹，手机、台式机和网页上马上都有。 |
| 37–45 s | the broken laptop dark, the web copy lit, a new laptop full | the laptop cracks; files flow back | nothing is lost | 就算电脑摔坏了，文件也还在。 |
| 45–53 s | mom's tablet with the album | a new link to her tablet | sharing is one more link | 共享一个文件夹，妈妈就能看到照片。 |
| 53–60 s | the address bar, "dropbox.com", held 5 s | typed | what to do | 现在就去 dropbox.com 下载。 |

Pitfalls: a metaphor that overstays; the wrong zoom level (no sync engines); the itinerary keeps one icon and colour on every device; show what is wrong (v2-final), not a frowning face; Lin does every action.

### A feature tutorial, 90 s

Existing users of a design tool, the app open beside the video. Illustrative subject: Figma auto layout on one button. **Thesis**: 看完后，观众能做出一个随文字变宽的按钮，因为他们先看到做好的按钮变宽，再在真实面板上看到做到这一点的三个设置，每一步的结果都留在画面上。**Picture**: the button itself, always on the canvas; the panel zooms beside it, never instead of it. **Shape**: do the last thing first, a three-step plan, the wrong way flagged.

| Time | Rest frame | What moves | Understands | Narration |
|---|---|---|---|---|
| 0–6 s | the button "立即购买，免运费", its box grown to fit | the label is retyped longer | the goal | 做完之后，文字变长，按钮自己变宽。 |
| 6–10 s | three empty step chips | they pop in | three steps | 一共三步。 |
| 10–16 s | the full real UI, the button selected, the rest dimmed | the dim falls | the start, in my own app | 从一个普通按钮开始：一个框，一段文字。 |
| 16–32 s | chip 1; the key cap Shift A; padding bands | the key presses; bands grow | auto layout adds padding | 第一步，选中这个框，按 Shift 加 A。框和文字之间出现了内边距。 |
| 32–50 s | chip 2; the panel zoomed 2×; padding 12 / 24 | the values type; the button reflows | the values shape it | 第二步，在右边设内边距：上下十二，左右二十四。 |
| 50–64 s | chip 3; width Hug; the box grown | Hug is chosen; the label retyped | width follows content | 第三步，宽度选 Hug。再改文字，按钮跟着变。 |
| 64–76 s | Fixed overflowing with a red ring; Hug fitting | it toggles | the common mistake | 如果宽度是 Fixed，文字会溢出；改成 Hug 就好。 |
| 76–84 s | the chips with thumbnails of their rest frames | each rest frame shrinks into its chip | recap | 选中按 Shift A，设内边距，宽度选 Hug。 |
| 84–90 s | the button and "轮到你：一排三个按钮", held 6 s | rest | practise | 现在给一排三个按钮试试。 |

Pitfalls: crop or redraw the UI and the viewer can't find the panel; one smooth cursor path per click; every step ends on a held, changed state with its step number; say what a setting means, the cursor shows where.

### A vector database in 100 seconds

Developers who have heard the term. **Thesis**: 看完后，观众明白向量数据库按意思而且很快地找东西，因为他们看到歌曲变成地图上的点、相似的挨在一起，查询变成一个点、离它最近的就是答案，而索引只查 300 个点而不是 10000 个。**Picture**: a 2-D embedding map with clusters, labelled 二维示意. **Shape**: X in 100 seconds, the twist being speed, not storage.

| Time | Rest frame | What moves | Understands | Narration |
|---|---|---|---|---|
| 0–8 s | "适合下雨天听的歌" with three results, none containing 雨 | the query types | search by meaning | 向量数据库：按意思找东西，而不是按字面。 |
| 8–18 s | a table of titles; the only highlighted row contains 雨; the good songs crossed | a highlighter scans | keywords miss meaning | 普通查询只找标题里带"雨"的，真正合适的歌全漏了。 |
| 18–32 s | card → model → [0.12, −0.80, 0.33, …] → one dot | the row collapses into a dot | a vector is a point | 嵌入模型把每首歌变成一串数字，也就是空间里的一个点。 |
| 32–46 s | about 200 dots in three clusters | they drift into clusters | similar is near | 意思相近的歌，点也挨在一起。 |
| 46–60 s | the query dot, a circle, three nearest lit | the circle grows | the answer is the nearest | 查询也变成一个点，离它最近的几个就是答案。 |
| 60–72 s | a beam that visited every dot, "比较了 10,000 次" | the beam sweeps | the difficulty is speed | 难点在快：总不能每查一次，就量一万个距离。 |
| 72–84 s | the map in cells, three lit, "300"; one true neighbour just outside, outlined | the query visits nearby cells | the index trades a little recall for speed | 索引先把空间分格，只查附近几格。快得多，偶尔会漏掉一个。 |
| 84–93 s | the three songs as context in a chat | they fly into a model; the reply types | why it's everywhere | 给大模型配上自己的资料库，靠的就是它。 |
| 93–100 s | a three-line code card, held | typed | how to start | 加几条数据，查一句话，自己试试。 |

Pitfalls: a flat map, not a spinning 3-D cloud; label the counts illustrative or use a sourced benchmark; show the missed neighbour.

### The life of one request, 150 s

Engineers new to a system. Illustrative subject: a checkout (phone → CDN → load balancer → three API servers → cache → database, plus a queue and an email worker). **Thesis**: 看完后，观众明白为什么下单 0.2 秒就返回而邮件稍后才到，因为他们跟着一个请求走过一张固定的系统图，看到每一站在时间条上加一段，缓存命中缩短了路，发邮件的任务被丢进返回路径之外的队列。**Picture**: one fixed map at one zoom level (C4 containers; left the user, right the data), one token with a trail, a time bar whose slices are the stops. **Shape**: journey of one request, then before/after on the same map.

| Time | Rest frame | What moves | Understands | Narration |
|---|---|---|---|---|
| 0–8 s | the phone "已下单 ✓", a stopwatch 0.20 s | a tap | the question | 点一下"下单"，0.2 秒就好了。这 0.2 秒里发生了什么？ |
| 8–20 s | the whole map with a legend | boxes draw left to right | the cast and the direction | 我们跟着这一个请求，从左走到右。 |
| 20–32 s | the token past the edge; images back to the phone | the images return from the edge | static files come from nearby | 图片和脚本由离你最近的节点给；下单请求继续往里走。 |
| 32–44 s | the balancer and three servers, server 2 lit | a selector ticks and stops | the balancer picks | 负载均衡挑一台空闲的服务器。 |
| 44–58 s | server 2 with two checks | the checks pop | checks before writing | 服务器先核对：是不是本人，购物车对不对。 |
| 58–74 s | the cache's empty slot; a new row in the database; its slice the longest | the token bounces off the cache; the row slides in | the database is the slow part | 先问缓存，没有；只好去数据库，写下这笔订单。这一段最慢。 |
| 74–86 s | an email job in the queue, off the path | it drops in; the token doesn't wait | slow work is deferred | 发邮件这种慢活儿，丢进队列，不等它。 |
| 86–98 s | the phone ✓; the bar complete | the token returns along its trail | the total is the sum | 原路返回，一共 0.2 秒。 |
| 98–114 s | a second bar, 0.05 s; the cache lit | a second token stops at the cache | a cache shortens the path | 第二次，缓存里有了：路短了，时间也短了。 |
| 114–128 s | server 2 dark; the token at server 3 | the balancer reroutes | one failure doesn't stop checkout | 一台服务器坏了，负载均衡就绕开它。 |
| 128–140 s | an envelope on the phone, "+2 s" | the worker sends it | later, but certain | 过了一会儿，后台把确认邮件发了出去。 |
| 140–150 s | both trails; "快的同步做，慢的排队做", held | a drift | the principle | 记住一句：快的同步做，慢的排队做。 |

Timings are illustrative unless taken from a real trace. Pitfalls: one zoom level per shot; the map never moves; one token before any crowd; label every arrow; at least one failure and one deferred job.

### An API demo, 60 s, and a release highlight, 45 s

Developers evaluating an API. Illustrative subject: Stripe Checkout. **Thesis**: 看完后，观众相信一个能用的结账页只要六行代码，因为他们看到每一行点亮它在支付页上生成的那一部分，API 返回的链接打开了这个页面，测试付款又作为事件回到了服务器。**Picture**: code on the left, a phone on the right, a thread from each line to what it makes. **Shape**: do the last thing first.

| Time | Rest frame | What moves | Understands | Narration |
|---|---|---|---|---|
| 0–5 s | the shop's 谢谢 page after paying | the card fills; pay is pressed | the result | 一个能收款的结账页。 |
| 5–10 s | a six-line code card, an empty phone, "6 行" | the count rolls to 6 | the cost | 这是全部代码，六行。 |
| 10–16 s | `pnpm add stripe`; the key masked | typed | setup | 装好库，密钥放进环境变量。 |
| 16–30 s | lines lit with threads: price → ¥99, quantity → ×1, success_url → 谢谢 | a line lights, its thread draws, its element appears | each parameter is a visible part | 价格和数量变成页面上的金额；success_url 是付完款去的页面。 |
| 30–40 s | the response JSON with url; the page full | a token flies to the API; the url opens | a hosted page | 运行：Stripe 返回一个链接，打开就是这个页面。 |
| 40–50 s | the server log `checkout.session.completed` | the test card; an event flies back | the server hears of the payment | 用测试卡付款；付完，Stripe 回调你的服务器。 |
| 50–60 s | the install command and the docs link, held | rest | what to do | 复制这六行，自己跑一遍。 |

The release highlight (45 s, existing users): the version rolls 2.3 → 2.4 (2.4 版，三处变化。), then three changes as before/after on the screen they already use, same framing each time (导出，现在一键完成。 / 搜索能搜到文件里面的字。 / 断网也能改，联网自动同步。), three thumbnails and a stack "还有 9 项" (其余九项见更新日志。), the update button (现在更新。). Pitfalls: code that runs as shown; mask keys; never fake a response; don't read the changelog aloud.
