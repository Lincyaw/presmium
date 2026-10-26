# 嵌入预览保留编辑焦点

2026-10-27，真实音频编辑四组合调查发现：快速填写入点或出点时，偶尔保存了原值。原生事件证明字段没有收到那次输入，已有草稿没有被迟回执覆盖。

## 根因

固定记录 `audio-editor-focus-steal-before.json` 通过原样委托的原生 `HTMLElement.focus` 观察器、父窗口焦点事件与公开预览消息记录同一现场：入点 focusin 时 readOnly 为 false；随后 focusout，值仍为 0；父窗口 blur 的 activeElement 是 iframe。子窗口的原生 focus 调用栈为 `MutationObserver.handleMutations → focus`，调用前 `document.hasFocus()` 为 false。该字段没有 beforeinput／input 事件，实际 CAS 的 startMs 为 0。没有 readOnly 属性翻转。

`PresentView` 与 `PresenterView` 沿用了独立放映的 Radix `FocusScope` 焦点锁定；子文档失焦后，内容 mutation 会把焦点拉回 scope。初次挂载还会运行公共 autofocus 与 `useModal` 的主动聚焦。画面准备与编辑字段的暂停／选步恰好经过这些时点，因而会截断父窗口的连续输入。

观察器只在私有浏览器上下文记录调用并委托原生方法，没有替换框架逻辑、响应或产品源码。

## 修改边界

网页应用已有的权威 embedded 参数原样传入公开 `ViewerOptions.embedded`。仅嵌入场景关闭 `FocusScope` 的 trap 与 loop，并通过公开 mount／unmount autofocus 回调取消自动夺焦点。`useModal` 在独立放映中继续聚焦；嵌入预览只有当前子文档本身拥有焦点时才聚焦。

独立放映的默认值仍为非 embedded，原有 focus、trap、loop 和回调行为保持。未增加父窗口重试、延时、输入回填或依赖补丁。

## 真实验证

- `audio-editor-browser.json`：四组合 85/85。每组连续填写入点、出点、延后并操作滑杆与静音，首字段 focus 后没有父窗口 blur，CAS 得到 500–1500 ms 和延后 250 ms。还完成当前同 iframe 的真实播放、暂停与往返跳步。
- `audio-editor-ownership.json`：8/8。实际提交与 SSE 先到、ACK 后到期间输入 1250；ACK 和自动准备完成后，原始文字及父字段焦点都保留，再明确保存新输入。
- `viewer-embedded-focus-after.json`：10/10，0 前端异常、0 HTTP 错误。父字段聚焦时同一步导航、真实素材标题 source 更新与 SSE、预览 overlay 卸载均保留 raw；从嵌入预览最后控件实际按 Tab 能到父控件。独立 Present／Presenter 的焦点和键盘行为另在同记录中验证。

稳定父窗口图为 `viewer-embedded-focus-parent.png`，独立放映图为 `viewer-standalone-{present,presenter}-focus.png`。四组合视觉另见 [音频片段编辑](audio-clip-editor-2026-10-27.md)。主链的一次未知计划 409 与有意 index.lock 500 分别记录，没有宣称零 HTTP 错误。

独立消费者首版并发绕过父播放器所有权，直接向子服务发出 control，被实际 AbortError 拒绝；改为公开导航及原生父编辑流程。首次独立焦点断言和一次将上下文 Hook 放在提供者外的错误观察器也保留原记录。最终独立放映先 bringToFront、确认 document.hasFocus，再实际聚焦已有控件并按 Tab；随后验证外部焦点仍被锁回、末控件 Tab 仍循环，Present 与 Presenter 均通过。没有放宽断言或为观察时序增加产品延时。

只使用隔离 Studio 与唯一私有文稿，未触碰公开 Studio 或作者文稿。轻量 types、tokens、layering、skills 与 diff 检查通过；没有新增受版本控制的测试或运行测试套件。
