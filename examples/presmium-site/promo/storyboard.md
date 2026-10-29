# 《Make complex things clear》分镜

影片是英文的。看完后，观众知道：在 Presmium 里圈出文稿的一段、说一句要什么，AI 就把动画加进来；同一份文稿现场能一步一步讲，会后能当网站看、能导出视频发出去。影片用一堂课做例子，论文报告、技术分享、产品发布也是同样的做法；片尾把这个例子收到更大的承诺上。

故事是一个闭环：学生深夜提了一个问题，老师上节课在黑板上画了三遍没讲明白；这次换个讲法；第二天上课一步一步讲，课后学生自己说出了答案。问题和答案都在同一个课程群里。

## 十个镜头

| 时间 | 镜头 | 画面 | 屏幕上的话 |
|---|---|---|---|
| 00:00–00:06 | 提问 | 深夜书桌，手机亮起、震动；课程群里 Sam 正在输入，消息落下 | 消息本身：Why does a bigger learning rate make training worse, not better? |
| 00:06–00:11 | 黑板 | 上节课的黑板：损失曲线上，大步长的折线画了三遍、擦了两遍，最后打了个问号 | Drew it three times. Still didn't click. |
| 00:11–00:19 | 圈出来 | 同一个夜里，笔记本上是英文界面的 Presmium 工作台。拖选更新规则那一段，点 New Comment，写下要求，保存 | This time, show it.／Mark the spot. Say what you want. |
| 00:19–00:26 | 交给 AI | 在 AI Assistant 里发出 “Apply my comment on page 2”；页面刷新，多了对比动画，Version History 记下 “Add a learning-rate comparison to page 2 · AI · just now”；按预览的步骤 2、3、4 | The AI does the rest. |
| 00:26–00:29 | 三种用法 | 文稿分成三张卡片，各带真实画面 | Present in class · Publish a website · Export a video |
| 00:29–00:39 | 上课 | 第二天的教室，投影上是放映版。每按一下翻页笔走一步：2.2 时预测线越摆越远，学生歪头；换成 0.35，线贴上数据点，有人说 “Oh, I see!” | In class: one click, one step. |
| 00:39–00:44.5 | 网站 | 浏览器打开课程网站 Intro to Machine Learning，滚到这一节的动画 | After class, it's all online. |
| 00:44.5–00:50.5 | 视频 | 老师在课程群里发出导出的视频；点开播放，进度条拖回第二步再看 | Export a video. Send it to the class.／Missed a step? Drag it back. |
| 00:50.5–00:54 | 懂了 | 回到聊天，Sam 回复 | 消息本身：Got it! The steps were too big, so it kept overshooting. |
| 00:54–01:00 | 片尾 | Presmium 标志 | Make complex things clear.／Open source · Free to use |

## 写法

- 一次只出现一句话，放在画面下方同一个位置。句子短，用口语，不用 empower、unlock、seamless 这类空话。
- 产品画面都是英文界面的真实采集：工作台的拖选、批注框（每三个字符一帧）、AI 助手、版本历史与预览步骤，放映版的九个步骤，课程网站，导出的教学视频逐步帧。被编辑的课是 `learn/lecture.json` 的英文译文。AI 的修改是重放：采集时把加好动画的文稿按 AI 修改的格式写入版本历史，工作台显示的是它真实的样子。
- 故事场景（夜晚的房间、黑板、教室、手机聊天）是统一风格的扁平插画：设计令牌中的影片配色（`film-*`），圆角、无描边、一盏台灯的暖光。聊天界面是插画，不模仿任何真实聊天软件。
- 原因先于结果：指针按下，界面才变；翻页笔按下，幻灯片才走一步。
- 推近时镜头不越出笔记本屏幕；每个结果至少停 0.5 秒，片尾停 5 秒以上。

## 声音

原创合成配乐，没有旁白。D 小调的夜晚和黑板，在“这次换个讲法”转到 F 大调；工作台里的点击和打字有轻微的点击声；AI 改好时一次上扬；上课时每按一下有一个音，2.2 的三步越走越出调，0.35 的五步走回主音；拖回进度条时动机倒放；“懂了”落在一个暖和弦上。
